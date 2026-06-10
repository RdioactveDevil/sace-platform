/**
 * Past-paper ingestion — turns a real exam PDF into bank questions WITH their
 * original figures attached (no manual per-image upload).
 *
 * Pipeline:
 *   1. Load the PDF (from a public URL or the Supabase admin-uploads bucket).
 *   2. One Claude vision call over the PDF extracts the questions and, for any
 *      question that has a figure, the page number + the figure's bounding box
 *      (as percentages of that page).
 *   3. Only the pages that contain a figure are rasterised (WASM PDFium), the
 *      figure is cropped (sharp), uploaded to the public `question-images`
 *      bucket, and attached to the question as image_url.
 *   4. Questions are inserted into `questions` (--apply) or just summarised
 *      (default dry-run).
 *
 * Answer keys are taken from the paper as Claude reads it; run the existing
 * "Backfill — verify & repair" Action afterwards to fact-check them in bulk.
 *
 * Env: SUPABASE_SERVICE_KEY, ANTHROPIC_API_KEY (+ optional INGEST_MODEL,
 * AI_INTEGRATIONS_ANTHROPIC_BASE_URL / _API_KEY).
 *
 * Usage:
 *   tsx ingest-past-paper.ts --pdf-url <url> --subject "Chemistry Stage 1" --topic "Acids and bases" [--subtopic "The pH scale"] [--apply] [--limit 20]
 *   tsx ingest-past-paper.ts --storage-path <admin-uploads/path.pdf> --subject ... --topic ...
 */
import { createClient } from "@supabase/supabase-js";
import { PDFiumLibrary } from "@hyzyla/pdfium";
import sharp from "sharp";

const SUPABASE_URL = "https://pslpxawrfpcuwnupdfbs.supabase.co";
const MODEL = process.env.INGEST_MODEL || "claude-sonnet-4-6";

type Args = {
  pdfUrl?: string;
  storagePath?: string;
  subject?: string;
  topic?: string;
  subtopic?: string;
  apply: boolean;
  limit?: number;
};

function parseArgs(argv: string[]): Args {
  const a: Args = { apply: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = () => argv[++i];
    if (k === "--pdf-url") a.pdfUrl = v();
    else if (k === "--storage-path") a.storagePath = v();
    else if (k === "--subject") a.subject = v();
    else if (k === "--topic") a.topic = v();
    else if (k === "--subtopic") a.subtopic = v();
    else if (k === "--apply") a.apply = true;
    else if (k === "--limit") a.limit = parseInt(v() || "", 10) || undefined;
  }
  return a;
}

type ExtractedQuestion = {
  question: string;
  options?: string[];
  answer_index?: number;
  solution?: string;
  difficulty?: number;
  subtopic?: string;
  has_figure?: boolean;
  page?: number; // 1-based
  figure_bbox?: { x: number; y: number; w: number; h: number }; // percentages 0–100
};

function extractJsonArray(text: string): ExtractedQuestion[] {
  const tryParse = (s: string) => {
    try {
      const p = JSON.parse(s);
      return Array.isArray(p) ? (p as ExtractedQuestion[]) : null;
    } catch {
      return null;
    }
  };
  const direct = tryParse(text);
  if (direct) return direct;
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end <= start) return [];
  return tryParse(text.slice(start, end + 1)) ?? [];
}

// Loosely typed: the supabase-js generic defaults fight the inferred client type.
async function loadPdf(admin: any, args: Args): Promise<Buffer> {
  if (args.pdfUrl) {
    const r = await fetch(args.pdfUrl);
    if (!r.ok) throw new Error(`Failed to fetch --pdf-url (${r.status})`);
    return Buffer.from(await r.arrayBuffer());
  }
  if (args.storagePath) {
    const { data, error } = await admin.storage.from("admin-uploads").download(args.storagePath);
    if (error || !data) throw new Error(`Failed to download --storage-path: ${error?.message}`);
    return Buffer.from(await data.arrayBuffer());
  }
  throw new Error("Provide --pdf-url or --storage-path");
}

async function extractQuestions(pdf: Buffer, args: Args): Promise<ExtractedQuestion[]> {
  const baseUrl = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL || "https://api.anthropic.com";
  const apiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || "";

  const system = [
    `You are extracting exam questions from a ${args.subject || "past exam paper"} for the topic "${args.topic || ""}".`,
    "Return ONLY a JSON array. Each object:",
    "  question (string — the full question stem, with LaTeX in $...$ for any maths/chemistry)",
    "  options (array of 4 strings) and answer_index (0–3) — for multiple-choice questions",
    "  solution (string — a short worked explanation of the correct answer)",
    "  subtopic (short label), difficulty (integer 1–5)",
    "  has_figure (boolean) — true ONLY if the question depends on a diagram/figure/graph printed in the paper",
    "  page (1-based page number the figure appears on) and figure_bbox { x, y, w, h } as PERCENTAGES (0–100) of that page, tightly around the figure — REQUIRED when has_figure is true",
    "Only include questions a student must answer. Skip cover pages, instructions and formula sheets.",
    "If a question's figure spans wide, include the whole figure in the bbox. Be generous rather than cropping content out.",
  ].join("\n");

  const resp = await fetch(`${baseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "pdfs-2024-09-25",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 8000,
      system,
      messages: [
        {
          role: "user",
          content: [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdf.toString("base64") } },
            { type: "text", text: "Extract the questions as specified." },
          ],
        },
      ],
    }),
  });
  if (!resp.ok) throw new Error(`Anthropic API ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  const data = (await resp.json()) as { content?: { text: string }[] };
  return extractJsonArray(data?.content?.[0]?.text || "");
}

/** Render the requested 1-based pages to PNG buffers + their pixel dimensions. */
async function renderPages(pdf: Buffer, pages: number[]): Promise<Map<number, { png: Buffer; width: number; height: number }>> {
  const out = new Map<number, { png: Buffer; width: number; height: number }>();
  if (pages.length === 0) return out;
  const library = await PDFiumLibrary.init();
  try {
    const document = await library.loadDocument(pdf);
    try {
      const allPages = [...document.pages()];
      for (const pageNo of pages) {
        const page = allPages[pageNo - 1];
        if (!page) continue;
        const image = await page.render({
          scale: 3,
          render: async (o: { data: Uint8Array; width: number; height: number }) =>
            // PDFium emits BGRA; figures are predominantly monochrome so channel
            // order is not significant for legibility.
            sharp(Buffer.from(o.data), { raw: { width: o.width, height: o.height, channels: 4 } }).png().toBuffer(),
        });
        const png = Buffer.from(image.data);
        const meta = await sharp(png).metadata();
        out.set(pageNo, { png, width: meta.width || 0, height: meta.height || 0 });
      }
    } finally {
      document.destroy();
    }
  } finally {
    library.destroy();
  }
  return out;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

async function cropFigure(page: { png: Buffer; width: number; height: number }, bbox: { x: number; y: number; w: number; h: number }): Promise<Buffer> {
  const pad = 1.5; // % padding so we never clip the figure
  const left = Math.round(clamp((bbox.x - pad) / 100, 0, 1) * page.width);
  const top = Math.round(clamp((bbox.y - pad) / 100, 0, 1) * page.height);
  const width = Math.round(clamp((bbox.w + pad * 2) / 100, 0, 1) * page.width);
  const height = Math.round(clamp((bbox.h + pad * 2) / 100, 0, 1) * page.height);
  const w = Math.max(8, Math.min(width, page.width - left));
  const h = Math.max(8, Math.min(height, page.height - top));
  return sharp(page.png).extract({ left, top, width: w, height: h }).png().toBuffer();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!process.env.SUPABASE_SERVICE_KEY) {
    console.error("::error::SUPABASE_SERVICE_KEY is not set.");
    process.exit(1);
  }
  if (!args.subject || !args.topic) {
    console.error("::error::--subject and --topic are required.");
    process.exit(1);
  }

  const admin = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  console.log(`Loading PDF…`);
  const pdf = await loadPdf(admin, args);

  console.log(`Extracting questions with ${MODEL}…`);
  let questions = await extractQuestions(pdf, args);
  if (args.limit) questions = questions.slice(0, args.limit);
  console.log(`Extracted ${questions.length} question(s); ${questions.filter((q) => q.has_figure).length} with figures.`);

  const figurePages = [...new Set(questions.filter((q) => q.has_figure && q.page).map((q) => q.page as number))];
  console.log(`Rendering ${figurePages.length} page(s) with figures…`);
  const rendered = await renderPages(pdf, figurePages);

  const subtopicDefault = args.subtopic || args.topic;
  const conceptTag = `${args.subject}|${args.topic}|${subtopicDefault}`.toLowerCase();
  const rows: Record<string, unknown>[] = [];
  let figuresAttached = 0;

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    if (!q.question || !Array.isArray(q.options) || typeof q.answer_index !== "number") continue;

    let imageUrl: string | null = null;
    if (q.has_figure && q.page && q.figure_bbox && rendered.has(q.page)) {
      try {
        const crop = await cropFigure(rendered.get(q.page)!, q.figure_bbox);
        const path = `past-papers/${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}.png`;
        if (args.apply) {
          const { error } = await admin.storage.from("question-images").upload(path, crop, { contentType: "image/png" });
          if (error) throw new Error(error.message);
          imageUrl = admin.storage.from("question-images").getPublicUrl(path).data.publicUrl;
        } else {
          imageUrl = `(dry-run: would upload ${crop.length}-byte crop)`;
        }
        figuresAttached++;
      } catch (err) {
        console.warn(`  figure crop failed for Q${i + 1}: ${(err as Error).message}`);
      }
    }

    rows.push({
      id: `pp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      subject: args.subject,
      topic: args.topic,
      subtopic: q.subtopic || subtopicDefault,
      concept_tag: conceptTag,
      question_type: "mcq",
      difficulty: q.difficulty || 3,
      question: q.question,
      options: q.options,
      answer_index: q.answer_index,
      solution: q.solution || "",
      image_url: args.apply ? imageUrl : null,
      created_at: new Date().toISOString(),
    });
  }

  console.log(`Prepared ${rows.length} valid question(s); ${figuresAttached} with a cropped figure.`);

  if (!args.apply) {
    console.log("[dry-run] no writes. Sample:");
    rows.slice(0, 3).forEach((r, i) => console.log(`  ${i + 1}. ${(r.question as string).slice(0, 90)}${r.image_url ? "  [+figure]" : ""}`));
    console.log("Re-run with --apply to insert into the live bank.");
    return;
  }

  if (rows.length === 0) {
    console.log("Nothing to insert.");
    return;
  }
  const { data: inserted, error } = await admin.from("questions").insert(rows).select("id");
  if (error) {
    console.error(`::error::Insert failed: ${error.message}`);
    process.exit(1);
  }
  console.log(`Inserted ${(inserted || []).length} question(s) into the live bank.`);
  console.log("Tip: run the 'Backfill — verify & repair' Action to fact-check the answer keys.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack || err.message : err);
  process.exit(1);
});
