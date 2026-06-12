import { Router } from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { CLAUDE_MODEL } from "../lib/anthropic-model";
import { logger } from "../lib/logger";
import { extractJsonArray } from "../lib/json-latex";

const router = Router();
const SUPABASE_URL = "https://pslpxawrfpcuwnupdfbs.supabase.co";
const BUCKET = "curriculum-resources";

// Claude's native PDF support accepts up to ~32 MB / 100 pages per request. The
// upload bucket caps at 50 MB; we additionally refuse oversize PDFs up front so
// the admin gets a clear message rather than an opaque Claude error. Whole-book
// ingestion beyond this is a future enhancement (page-range chunking).
const MAX_PDF_BYTES = 30 * 1024 * 1024;

const RESOURCE_TYPES = new Set([
  "textbook",
  "exam",
  "practice_test",
  "assessment",
  "notes",
  "resource",
]);

function getAdmin(): SupabaseClient {
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("No SUPABASE_SERVICE_KEY configured");
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false } });
}

type TopicRow = { id: string; name: string; order_index: number };
type SubtopicRow = { topic_id: string; name: string };

// Distilled exemplar pack as returned by Claude.
type DistilledExemplar = { subtopic?: string; topic?: string; content?: string };

/**
 * Load a curriculum's topic → subtopic taxonomy so Claude can map document
 * content onto canonical subtopic names rather than inventing its own.
 */
async function loadTaxonomy(admin: SupabaseClient, curriculumId: string) {
  const { data: topics } = await admin
    .from("curriculum_topics")
    .select("id, name, order_index")
    .eq("curriculum_id", curriculumId)
    .order("order_index");
  const topicRows = (topics ?? []) as TopicRow[];
  const topicIds = topicRows.map((t) => t.id);

  let subRows: SubtopicRow[] = [];
  if (topicIds.length > 0) {
    const { data: subs } = await admin
      .from("curriculum_subtopics")
      .select("topic_id, name, order_index")
      .in("topic_id", topicIds)
      .order("order_index");
    subRows = (subs ?? []) as SubtopicRow[];
  }

  // subtopic name (lowercased) → { topic, subtopic } for resolving Claude output.
  const subtopicIndex = new Map<string, { topic: string; subtopic: string }>();
  const taxonomyLines: string[] = [];
  for (const t of topicRows) {
    taxonomyLines.push(`Topic: ${t.name}`);
    for (const s of subRows.filter((s) => s.topic_id === t.id)) {
      taxonomyLines.push(`  - ${s.name}`);
      subtopicIndex.set(s.name.trim().toLowerCase(), { topic: t.name, subtopic: s.name });
    }
  }
  return { taxonomyText: taxonomyLines.join("\n"), subtopicIndex };
}

/**
 * Distill a source PDF into per-subtopic exemplar packs via Claude.
 * Returns the rows ready to insert into curriculum_resource_exemplars.
 */
async function distillExemplars(opts: {
  pdfBase64: string;
  subjectName: string;
  resourceType: string;
  taxonomyText: string;
  subtopicIndex: Map<string, { topic: string; subtopic: string }>;
}): Promise<{ subtopic: string | null; topic: string | null; content: string }[]> {
  const { pdfBase64, subjectName, resourceType, taxonomyText, subtopicIndex } = opts;

  const system = [
    `You are analysing a ${resourceType.replace("_", " ")} for the "${subjectName}" curriculum.`,
    "Your job is to turn this document into reusable EXEMPLAR PACKS that will guide an AI when it later writes new practice questions for this subject.",
    "Work out which of the curriculum subtopics below the document covers, and for EACH covered subtopic produce one exemplar pack.",
    "",
    "Return ONLY a valid JSON array. No markdown, no commentary outside the array.",
    "Each object must have exactly these keys:",
    '  "subtopic" (string — copy EXACTLY one of the subtopic names from the list below, or "GENERAL" if the content applies broadly across the subject and not to one subtopic)',
    '  "content" (string — the exemplar pack)',
    "",
    "Each exemplar pack's content must contain:",
    "  1. 2–4 representative SAMPLE QUESTIONS drawn from or closely modelled on the document, written in its authentic style (keep the wording, structure and command words faithful).",
    "  2. A short STYLE NOTES section: typical difficulty/calibration, key terminology and notation, question formats used, command words, marking style and any scope limits evident in the document.",
    "Keep each pack under ~1200 characters. Be concrete and specific to the document — do not give generic advice.",
    "Only emit a pack for a subtopic the document genuinely covers. It is fine to return fewer packs than there are subtopics.",
    "",
    "Curriculum subtopics (use these EXACT names):",
    taxonomyText || "(no subtopics provided — use \"GENERAL\" for everything)",
  ].join("\n");

  const anthropicBase = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL || "https://api.anthropic.com";
  const anthropicKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || "";

  const resp = await fetch(`${anthropicBase}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "pdfs-2024-09-25",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 8000,
      system,
      messages: [
        {
          role: "user",
          content: [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } },
            { type: "text", text: "Produce the exemplar packs as a JSON array, following the rules exactly." },
          ],
        },
      ],
    }),
  });

  if (!resp.ok) {
    const detail = await resp.text();
    throw new Error(`Claude API error: ${detail.slice(0, 300)}`);
  }

  const data = (await resp.json()) as { content?: { text: string }[] };
  const raw = data?.content?.[0]?.text || "";
  const parsed = extractJsonArray(raw) as DistilledExemplar[];

  // Resolve each pack's subtopic onto the canonical taxonomy. Unknown names that
  // aren't "GENERAL" are stored as subject-wide (subtopic null) rather than
  // dropped, so nothing useful is lost.
  const rows: { subtopic: string | null; topic: string | null; content: string }[] = [];
  for (const ex of parsed) {
    const content = (ex.content || "").trim();
    if (!content) continue;
    const rawName = (ex.subtopic || "").trim();
    if (!rawName || rawName.toUpperCase() === "GENERAL") {
      rows.push({ subtopic: null, topic: null, content });
      continue;
    }
    const match = subtopicIndex.get(rawName.toLowerCase());
    if (match) {
      rows.push({ subtopic: match.subtopic, topic: match.topic, content });
    } else {
      rows.push({ subtopic: null, topic: null, content });
    }
  }
  return rows;
}

// ── Create + process a resource ──────────────────────────────────────────────
// The client uploads the PDF to the curriculum-resources bucket, then calls this
// with the storage path. We register the resource, distill exemplars with Claude
// (synchronously, like /extract-pdf), and return the final status.
router.post("/curriculum-resources", async (req, res) => {
  const { curriculumId, storagePath, filename, fileSize, mimeType, title, resourceType } = req.body as {
    curriculumId?: string;
    storagePath?: string;
    filename?: string;
    fileSize?: number;
    mimeType?: string;
    title?: string;
    resourceType?: string;
  };

  if (!curriculumId || !storagePath) {
    res.status(400).json({ error: "curriculumId and storagePath are required" });
    return;
  }
  if (typeof fileSize === "number" && fileSize > MAX_PDF_BYTES) {
    res.status(400).json({
      error: `PDF too large for ingestion (${Math.round((fileSize / (1024 * 1024)) * 10) / 10} MB). Max ${MAX_PDF_BYTES / (1024 * 1024)} MB — split large textbooks into chapters and upload each.`,
    });
    return;
  }

  const admin = getAdmin();

  const { data: curr } = await admin
    .from("curricula")
    .select("id, name")
    .eq("id", curriculumId)
    .maybeSingle<{ id: string; name: string }>();
  if (!curr) {
    res.status(404).json({ error: "Curriculum not found" });
    return;
  }

  const type = resourceType && RESOURCE_TYPES.has(resourceType) ? resourceType : "resource";
  const resolvedTitle = (title || filename || "Untitled resource").trim();

  // Register the resource row first so it shows up immediately as "processing".
  const { data: resource, error: insErr } = await admin
    .from("curriculum_resources")
    .insert({
      curriculum_id: curriculumId,
      title: resolvedTitle,
      resource_type: type,
      storage_path: storagePath,
      file_name: filename ?? null,
      file_size: typeof fileSize === "number" ? fileSize : null,
      mime_type: mimeType ?? "application/pdf",
      status: "processing",
    })
    .select("id")
    .single<{ id: string }>();
  if (insErr || !resource) {
    res.status(500).json({ error: insErr?.message || "Failed to register resource" });
    return;
  }

  const resourceId = resource.id;

  try {
    // Download the PDF (retained in the bucket — not removed afterwards).
    const { data: blob, error: dlErr } = await admin.storage.from(BUCKET).download(storagePath);
    if (dlErr || !blob) throw new Error(dlErr?.message || "Failed to download PDF from storage");
    const pdfBase64 = Buffer.from(await blob.arrayBuffer()).toString("base64");

    const { taxonomyText, subtopicIndex } = await loadTaxonomy(admin, curriculumId);

    const exemplarRows = await distillExemplars({
      pdfBase64,
      subjectName: curr.name,
      resourceType: type,
      taxonomyText,
      subtopicIndex,
    });

    if (exemplarRows.length > 0) {
      const insertRows = exemplarRows.map((r) => ({
        resource_id: resourceId,
        curriculum_id: curriculumId,
        subject: curr.name,
        topic: r.topic,
        subtopic: r.subtopic,
        content: r.content,
        enabled: true,
      }));
      const { error: exErr } = await admin.from("curriculum_resource_exemplars").insert(insertRows);
      if (exErr) throw new Error(exErr.message);
    }

    await admin
      .from("curriculum_resources")
      .update({ status: "ready", exemplar_count: exemplarRows.length, error: null })
      .eq("id", resourceId);

    res.status(200).json({ id: resourceId, status: "ready", exemplars: exemplarRows.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Processing failed";
    logger.error({ err, resourceId }, "[curriculum-resources] distillation failed");
    await admin
      .from("curriculum_resources")
      .update({ status: "failed", error: message.slice(0, 500) })
      .eq("id", resourceId);
    res.status(500).json({ id: resourceId, status: "failed", error: message });
  }
});

// ── List a curriculum's resources ────────────────────────────────────────────
router.get("/curriculum-resources", async (req, res) => {
  const curriculumId = String(req.query.curriculumId || "");
  if (!curriculumId) {
    res.status(400).json({ error: "curriculumId query parameter is required" });
    return;
  }
  try {
    const admin = getAdmin();
    const { data, error } = await admin
      .from("curriculum_resources")
      .select("id, title, resource_type, file_name, file_size, status, error, exemplar_count, created_at")
      .eq("curriculum_id", curriculumId)
      .order("created_at", { ascending: false });
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.status(200).json({ resources: data ?? [] });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
  }
});

// ── Delete a resource (cascades to its exemplars + removes the file) ──────────
router.delete("/curriculum-resources/:id", async (req, res) => {
  const id = String(req.params.id);
  try {
    const admin = getAdmin();
    const { data: row } = await admin
      .from("curriculum_resources")
      .select("id, storage_path")
      .eq("id", id)
      .maybeSingle<{ id: string; storage_path: string | null }>();
    if (!row) {
      res.status(404).json({ error: "Resource not found" });
      return;
    }
    if (row.storage_path) {
      await admin.storage.from(BUCKET).remove([row.storage_path]).catch(() => {});
    }
    // Exemplars cascade via the FK on delete.
    const { error } = await admin.from("curriculum_resources").delete().eq("id", id);
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
  }
});

export default router;
