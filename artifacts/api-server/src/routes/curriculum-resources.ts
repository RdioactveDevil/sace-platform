import { Router } from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { PDFDocument } from "pdf-lib";
import { CLAUDE_MODEL } from "../lib/anthropic-model";
import { logger } from "../lib/logger";
import { extractJsonArray } from "../lib/json-latex";

const router = Router();
const SUPABASE_URL = "https://pslpxawrfpcuwnupdfbs.supabase.co";
const BUCKET = "curriculum-resources";

// Bucket cap. Whole textbooks up to this size are ingested by splitting into
// page-range chunks; larger files must be split into volumes by the admin.
const MAX_PDF_BYTES = 50 * 1024 * 1024;
// Pages per chunk — kept well under Claude's ~100-page / 32 MB single-request
// PDF limit so each chunk is one fast, reliable Claude call.
const CHUNK_PAGES = 50;

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

// Where a resource's chunk sub-PDFs live in the bucket.
function chunkDir(curriculumId: string, resourceId: string): string {
  return `${curriculumId}/chunks/${resourceId}`;
}
function chunkPath(curriculumId: string, resourceId: string, index: number): string {
  return `${chunkDir(curriculumId, resourceId)}/chunk_${index}.pdf`;
}

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
 * Distill one PDF (whole document or a single page-range chunk) into
 * per-subtopic exemplar packs via Claude.
 */
async function distillExemplars(opts: {
  pdfBase64: string;
  subjectName: string;
  resourceType: string;
  taxonomyText: string;
  subtopicIndex: Map<string, { topic: string; subtopic: string }>;
  partNote?: string;
}): Promise<{ subtopic: string | null; topic: string | null; content: string }[]> {
  const { pdfBase64, subjectName, resourceType, taxonomyText, subtopicIndex, partNote } = opts;

  const system = [
    `You are analysing a ${resourceType.replace("_", " ")} for the "${subjectName}" curriculum.`,
    partNote ? partNote : "",
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
    "Only emit a pack for a subtopic this document genuinely covers. If it covers nothing relevant, return an empty array [].",
    "",
    "Curriculum subtopics (use these EXACT names):",
    taxonomyText || '(no subtopics provided — use "GENERAL" for everything)',
  ]
    .filter(Boolean)
    .join("\n");

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
    rows.push(
      match
        ? { subtopic: match.subtopic, topic: match.topic, content }
        : { subtopic: null, topic: null, content },
    );
  }
  return rows;
}

/** Persist distilled exemplar packs for a resource. Returns the count inserted. */
async function insertExemplars(
  admin: SupabaseClient,
  resourceId: string,
  curriculumId: string,
  subject: string,
  rows: { subtopic: string | null; topic: string | null; content: string }[],
): Promise<number> {
  if (!rows.length) return 0;
  const insertRows = rows.map((r) => ({
    resource_id: resourceId,
    curriculum_id: curriculumId,
    subject,
    topic: r.topic,
    subtopic: r.subtopic,
    content: r.content,
    enabled: true,
  }));
  const { error } = await admin.from("curriculum_resource_exemplars").insert(insertRows);
  if (error) throw new Error(error.message);
  return rows.length;
}

/** Best-effort removal of a resource's chunk sub-PDFs. */
async function removeChunkFiles(admin: SupabaseClient, curriculumId: string, resourceId: string) {
  try {
    const dir = chunkDir(curriculumId, resourceId);
    const { data: files } = await admin.storage.from(BUCKET).list(dir);
    if (files && files.length) {
      await admin.storage.from(BUCKET).remove(files.map((f) => `${dir}/${f.name}`));
    }
  } catch {
    /* ignore cleanup failures */
  }
}

// ── Create + (small files) process a resource ────────────────────────────────
// The client uploads the PDF to the curriculum-resources bucket, then calls
// this with the storage path. Small documents are distilled inline and returned
// as 'ready'. Large documents (multi-chunk textbooks) are split into page-range
// sub-PDFs here and returned as 'processing'; the client then drives
// /process-chunk once per chunk so no single request exceeds the serverless cap.
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
      error: `PDF too large (${Math.round((fileSize / (1024 * 1024)) * 10) / 10} MB). Max ${MAX_PDF_BYTES / (1024 * 1024)} MB — split very large textbooks into volumes.`,
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
    const { data: blob, error: dlErr } = await admin.storage.from(BUCKET).download(storagePath);
    if (dlErr || !blob) throw new Error(dlErr?.message || "Failed to download PDF from storage");
    const pdfBytes = new Uint8Array(await blob.arrayBuffer());

    const srcDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    const pageCount = srcDoc.getPageCount();
    const totalChunks = Math.max(1, Math.ceil(pageCount / CHUNK_PAGES));

    // Small document → one Claude call inline, mark ready.
    if (totalChunks === 1) {
      const { taxonomyText, subtopicIndex } = await loadTaxonomy(admin, curriculumId);
      const rows = await distillExemplars({
        pdfBase64: Buffer.from(pdfBytes).toString("base64"),
        subjectName: curr.name,
        resourceType: type,
        taxonomyText,
        subtopicIndex,
      });
      const count = await insertExemplars(admin, resourceId, curriculumId, curr.name, rows);
      await admin
        .from("curriculum_resources")
        .update({ status: "ready", exemplar_count: count, total_chunks: 1, processed_chunks: 1, error: null })
        .eq("id", resourceId);
      res.status(200).json({ id: resourceId, status: "ready", exemplars: count, totalChunks: 1, processedChunks: 1 });
      return;
    }

    // Large document → split into page-range sub-PDFs and hand back to the client.
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_PAGES;
      const end = Math.min(start + CHUNK_PAGES, pageCount);
      const chunkDoc = await PDFDocument.create();
      const copied = await chunkDoc.copyPages(srcDoc, Array.from({ length: end - start }, (_, k) => start + k));
      copied.forEach((p) => chunkDoc.addPage(p));
      const chunkBytes = await chunkDoc.save();
      const { error: upErr } = await admin.storage
        .from(BUCKET)
        .upload(chunkPath(curriculumId, resourceId, i), chunkBytes, {
          contentType: "application/pdf",
          upsert: true,
        });
      if (upErr) throw new Error(`Failed to store chunk ${i}: ${upErr.message}`);
    }

    await admin
      .from("curriculum_resources")
      .update({ total_chunks: totalChunks, processed_chunks: 0, error: null })
      .eq("id", resourceId);

    res.status(200).json({ id: resourceId, status: "processing", totalChunks, processedChunks: 0 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Processing failed";
    logger.error({ err, resourceId }, "[curriculum-resources] setup failed");
    await admin
      .from("curriculum_resources")
      .update({ status: "failed", error: message.slice(0, 500) })
      .eq("id", resourceId);
    res.status(500).json({ id: resourceId, status: "failed", error: message });
  }
});

// ── Process a single page-range chunk of a large resource ────────────────────
// Driven by the client once per chunk. Each call is one Claude request, keeping
// whole-textbook ingestion within the serverless time limit.
router.post("/curriculum-resources/:id/process-chunk", async (req, res) => {
  const resourceId = String(req.params.id);
  const chunkIndex = Number((req.body as { chunkIndex?: number })?.chunkIndex);
  if (!Number.isInteger(chunkIndex) || chunkIndex < 0) {
    res.status(400).json({ error: "chunkIndex (non-negative integer) is required" });
    return;
  }

  const admin = getAdmin();
  const { data: resource } = await admin
    .from("curriculum_resources")
    .select("id, curriculum_id, resource_type, total_chunks, processed_chunks, exemplar_count")
    .eq("id", resourceId)
    .maybeSingle<{
      id: string;
      curriculum_id: string;
      resource_type: string;
      total_chunks: number | null;
      processed_chunks: number;
      exemplar_count: number;
    }>();
  if (!resource) {
    res.status(404).json({ error: "Resource not found" });
    return;
  }
  const totalChunks = resource.total_chunks ?? 0;
  if (chunkIndex >= totalChunks) {
    res.status(400).json({ error: `chunkIndex out of range (total ${totalChunks})` });
    return;
  }

  const { data: curr } = await admin
    .from("curricula")
    .select("name")
    .eq("id", resource.curriculum_id)
    .maybeSingle<{ name: string }>();
  if (!curr) {
    res.status(404).json({ error: "Curriculum not found" });
    return;
  }

  try {
    const { data: blob, error: dlErr } = await admin.storage
      .from(BUCKET)
      .download(chunkPath(resource.curriculum_id, resourceId, chunkIndex));
    if (dlErr || !blob) throw new Error(dlErr?.message || `Chunk ${chunkIndex} missing from storage`);
    const pdfBase64 = Buffer.from(await blob.arrayBuffer()).toString("base64");

    const { taxonomyText, subtopicIndex } = await loadTaxonomy(admin, resource.curriculum_id);
    const rows = await distillExemplars({
      pdfBase64,
      subjectName: curr.name,
      resourceType: resource.resource_type,
      taxonomyText,
      subtopicIndex,
      partNote: `This is part ${chunkIndex + 1} of ${totalChunks} of a larger document. Only produce packs for subtopics covered in THIS part.`,
    });
    const added = await insertExemplars(admin, resourceId, resource.curriculum_id, curr.name, rows);

    // Sequential client → processed advances to chunkIndex + 1.
    const processed = Math.max(resource.processed_chunks, chunkIndex + 1);
    const exemplarCount = (resource.exemplar_count || 0) + added;
    const done = processed >= totalChunks;

    await admin
      .from("curriculum_resources")
      .update({
        processed_chunks: processed,
        exemplar_count: exemplarCount,
        status: done ? "ready" : "processing",
      })
      .eq("id", resourceId);

    if (done) await removeChunkFiles(admin, resource.curriculum_id, resourceId);

    res.status(200).json({
      id: resourceId,
      status: done ? "ready" : "processing",
      processedChunks: processed,
      totalChunks,
      exemplars: exemplarCount,
      addedThisChunk: added,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Chunk processing failed";
    logger.error({ err, resourceId, chunkIndex }, "[curriculum-resources] chunk distillation failed");
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
      .select(
        "id, title, resource_type, file_name, file_size, status, error, exemplar_count, total_chunks, processed_chunks, created_at",
      )
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

// ── Delete a resource (cascades to its exemplars + removes its files) ─────────
router.delete("/curriculum-resources/:id", async (req, res) => {
  const id = String(req.params.id);
  try {
    const admin = getAdmin();
    const { data: row } = await admin
      .from("curriculum_resources")
      .select("id, curriculum_id, storage_path")
      .eq("id", id)
      .maybeSingle<{ id: string; curriculum_id: string; storage_path: string | null }>();
    if (!row) {
      res.status(404).json({ error: "Resource not found" });
      return;
    }
    if (row.storage_path) {
      await admin.storage.from(BUCKET).remove([row.storage_path]).catch(() => {});
    }
    await removeChunkFiles(admin, row.curriculum_id, id);
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
