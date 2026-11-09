/**
 * Exam-paper ingestion — loads a whole exam paper (an official past exam such
 * as VCAA, or a commercial trial exam) into the question bank for the exam
 * builder, with each question's figures cropped from the page.
 *
 * Pipeline:
 *   1. Load the paper PDF, and optionally its solutions / assessment report
 *      PDF (public URL or a path in the Supabase admin-uploads bucket).
 *   2. Two Claude calls read the paper: Section A (multiple choice) and
 *      Section B (short and extended answer, with parts, marks per part and
 *      worked solutions). Answers come from the solutions PDF when given.
 *      Each question is filed under one of the subject's course topics and
 *      subtopics, and figures are located by page and bounding box.
 *   3. Pages with figures are rasterised (WASM PDFium) and the figures cropped
 *      (sharp), uploaded to the public `question-images` bucket and attached.
 *   4. Rows are upserted (--apply) or summarised (default dry-run). Ids are
 *      built from the source and question number, so re-running a paper
 *      updates its questions instead of adding copies.
 *
 * Rows carry the exam-paper fields from migration
 * 20261109000003_question_source.sql (source, source_kind, source_publisher,
 * source_year, source_paper, source_question, exam_section, parts). Section B
 * questions are question_type 'extended': only the exam builder uses them.
 *
 * Env: SUPABASE_SERVICE_KEY, ANTHROPIC_API_KEY (+ optional INGEST_MODEL,
 * AI_INTEGRATIONS_ANTHROPIC_BASE_URL / _API_KEY).
 *
 * Usage:
 *   tsx ingest-past-paper.ts --pdf <batch id from Admin → Exam papers> [--apply]   (loads every paper in the batch)
 *   tsx ingest-past-paper.ts --pdf <url | admin-uploads path> --subject "VCE Mathematical Methods Units 3 and 4"
 *     --kind official --publisher VCAA --year 2023 --paper "Exam 2"
 *     [--solutions <url | path>] [--topic "Only this topic"] [--limit 5] [--apply]
 *   Add --recrop (with a batch or a paper) to redo the figure crops of papers already loaded,
 *   without reading their questions again.
 *   (--pdf-url / --storage-path still work in place of --pdf.)
 */
import { createHash } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { PDFiumLibrary } from "@hyzyla/pdfium";
import sharp from "sharp";
import { snapToInk, pctToPx, grow, crop, type Page, type PxBox } from "./lib/figure-crop";

const SUPABASE_URL = "https://pslpxawrfpcuwnupdfbs.supabase.co";
const MODEL = process.env.INGEST_MODEL || "claude-opus-5-5";
// A second, close-up look at each figure to place its box exactly.
const FIGURE_MODEL = process.env.FIGURE_MODEL || "claude-sonnet-5-5";

type Args = {
  pdf?: string;
  solutions?: string;
  subject?: string;
  kind: "official" | "commercial";
  publisher?: string;
  year?: number;
  paper?: string;
  topic?: string;
  apply: boolean;
  limit?: number;
  /** Redo the figure crops of a paper already in the bank, leaving its questions as they are. */
  recrop?: boolean;
};

function parseArgs(argv: string[]): Args {
  const a: Args = { apply: false, kind: "official" };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = () => argv[++i];
    if (k === "--pdf" || k === "--pdf-url" || k === "--storage-path") a.pdf = v();
    else if (k === "--solutions") a.solutions = v();
    else if (k === "--subject") a.subject = v();
    else if (k === "--kind") a.kind = v() === "commercial" ? "commercial" : "official";
    else if (k === "--publisher") a.publisher = v();
    else if (k === "--year") a.year = parseInt(v() || "", 10) || undefined;
    else if (k === "--paper") a.paper = v();
    else if (k === "--topic") a.topic = v();
    else if (k === "--apply") a.apply = true;
    else if (k === "--recrop") a.recrop = true;
    else if (k === "--limit") a.limit = parseInt(v() || "", 10) || undefined;
  }
  return a;
}

/** "VCAA 2023 Exam 2" or, for a trial exam, "NEAP 2024 Trial Exam 2". */
export function sourceLabel(a: Pick<Args, "kind" | "publisher" | "year" | "paper">): string {
  return [a.publisher, a.year, a.kind === "commercial" ? "Trial" : "", a.paper].filter(Boolean).join(" ");
}

type BBox = { x: number; y: number; w: number; h: number };
type Part = { label: string; level: number; text: string; marks: number; solution: string; figure_page: number; figure_bbox: BBox };
type Extracted = {
  number: string;
  question: string;
  options: string[];
  answer_index: number;
  solution: string;
  parts: Part[];
  topic: string;
  subtopic: string;
  difficulty: number;
  figure_page: number;
  figure_bbox: BBox;
};

// Loosely typed: the supabase-js generic defaults fight the inferred client type.
async function loadPdf(admin: any, ref: string): Promise<Buffer> {
  if (/^https?:\/\//i.test(ref)) {
    const r = await fetch(ref);
    if (!r.ok) throw new Error(`Failed to fetch ${ref} (${r.status})`);
    return Buffer.from(await r.arrayBuffer());
  }
  const { data, error } = await admin.storage.from("admin-uploads").download(ref);
  if (error || !data) throw new Error(`Failed to download ${ref} from admin-uploads: ${error?.message}`);
  return Buffer.from(await data.arrayBuffer());
}

type Course = { topics: { name: string; subtopics: string[] }[] };

async function loadCourse(admin: any, subject: string): Promise<Course> {
  const { data: cur } = await admin.from("curricula").select("id").eq("name", subject).maybeSingle();
  if (!cur) return { topics: [] };
  const { data: topics } = await admin.from("curriculum_topics").select("id, name").eq("curriculum_id", cur.id).order("order_index");
  const ids = (topics || []).map((t: { id: string }) => t.id);
  const { data: subs } = ids.length
    ? await admin.from("curriculum_subtopics").select("topic_id, name").in("topic_id", ids).order("order_index")
    : { data: [] };
  return {
    topics: (topics || []).map((t: { id: string; name: string }) => ({
      name: t.name,
      subtopics: (subs || []).filter((s: { topic_id: string }) => s.topic_id === t.id).map((s: { name: string }) => s.name),
    })),
  };
}

const bboxSchema = {
  type: "object",
  properties: { x: { type: "number" }, y: { type: "number" }, w: { type: "number" }, h: { type: "number" } },
  required: ["x", "y", "w", "h"],
  additionalProperties: false,
};

function outputSchema(topicNames: string[]) {
  const topic = topicNames.length ? { type: "string", enum: topicNames } : { type: "string" };
  return {
    type: "object",
    properties: {
      questions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            number: { type: "string" },
            question: { type: "string" },
            options: { type: "array", items: { type: "string" } },
            answer_index: { type: "integer" },
            solution: { type: "string" },
            parts: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  label: { type: "string" },
                  level: { type: "integer" },
                  text: { type: "string" },
                  marks: { type: "integer" },
                  solution: { type: "string" },
                  figure_page: { type: "integer" },
                  figure_bbox: bboxSchema,
                },
                required: ["label", "level", "text", "marks", "solution", "figure_page", "figure_bbox"],
                additionalProperties: false,
              },
            },
            topic,
            subtopic: { type: "string" },
            difficulty: { type: "integer" },
            figure_page: { type: "integer" },
            figure_bbox: bboxSchema,
          },
          required: ["number", "question", "options", "answer_index", "solution", "parts", "topic", "subtopic", "difficulty", "figure_page", "figure_bbox"],
          additionalProperties: false,
        },
      },
    },
    required: ["questions"],
    additionalProperties: false,
  };
}

/** How a figure's box is described, for every prompt that asks for one. */
const FIGURE_BOX_RULE = "figure_page is the 1-based page number in the PDF where a figure, graph, table image or diagram printed with the question appears, and figure_bbox is its box as PERCENTAGES (0–100) of that page. The box holds the figure only: everything that belongs to it (axes, scale numbers, axis titles, legends, labels and their leader lines, captions such as 'molecule A' or 'monomer 3'), and no question text, sentences, part labels such as (i) or (1), mark allocations or answer lines. Use figure_page 0 and a zero box when there is no figure.";

function systemPrompt(args: Args, section: "A" | "B", course: Course, hasSolutions: boolean): string {
  const courseList = course.topics.length
    ? course.topics.map((t) => `- ${t.name}${t.subtopics.length ? `: ${t.subtopics.join("; ")}` : ""}`).join("\n")
    : "(no course list: use short, sensible topic and subtopic names)";
  const common = [
    `You are copying exam questions exactly from a ${args.subject} exam paper (${sourceLabel(args)}) into structured data.`,
    "Copy the wording exactly as printed. Do not rewrite, simplify, correct or add to any question.",
    "Write every mathematical expression and chemical formula in LaTeX inside $...$ (inline) or $$...$$ (displayed). Use \\ce{} for chemical formulas. A literal dollar sign is \\$.",
    "Keep line breaks that matter (e.g. a function definition on its own line) as \\n.",
    FIGURE_BOX_RULE,
    "Tables that are plain text may be written as a markdown table in the text instead of a figure.",
    `topic must be one of the course topics below, and subtopic one of that topic's subtopics (exactly as written). Course:\n${courseList}`,
    args.topic ? `Every question in this run is on the topic "${args.topic}".` : "",
    "difficulty is 1 (easiest on the paper) to 5 (hardest on the paper).",
    hasSolutions
      ? "The second document is the solutions or assessment report for this paper. Take answers, marks and worked solutions from it."
      : "No solutions document is given: work out each answer carefully and check it before you reply.",
  ];
  const sectionRules = section === "A"
    ? [
        "Extract ONLY the multiple-choice questions (usually Section A). If the paper has none, return an empty list.",
        "number is the question number as printed. question is the stem. options are the answer options in order WITHOUT their letters (A., B. …). answer_index is the 0-based index of the correct option.",
        "solution is a short worked explanation of why that option is right. parts is an empty list.",
      ]
    : [
        "Extract ONLY the short-answer and extended-answer questions (usually Section B, or every question in a paper without multiple choice, such as SACE question booklets). Skip multiple-choice questions.",
        "number is the question number as printed. question is the text before the first part (the shared context or definitions; empty if the question starts with a part).",
        "parts lists every part in order: label as printed without dots or brackets ('a', 'b'; 'i', 'ii' for sub-parts; '1', '2' for sub-sub-parts), level 1 for a, b, c, level 2 for i, ii, iii and level 3 for (1), (2) under a sub-part.",
        "A part that only introduces its sub-parts has marks 0 and its own text; each sub-part carries its marks. marks is the number printed for that part (e.g. '2 marks' → 2).",
        "solution on each part is the worked answer for that part (as in the solutions document when given). A part's figure goes on the part (figure_page / figure_bbox); a figure shared by the whole question goes on the question.",
        "A question with no lettered parts has one part with label '' holding the question's marks and solution, and question holds its text.",
        "options is an empty list and answer_index is -1.",
      ];
  return [...common, ...sectionRules].filter(Boolean).join("\n");
}

async function extractSection(client: Anthropic, args: Args, section: "A" | "B", paper: Buffer, solutions: Buffer | null, course: Course): Promise<Extracted[]> {
  const docs: Anthropic.Beta.BetaContentBlockParam[] = [
    { type: "document", source: { type: "base64", media_type: "application/pdf", data: paper.toString("base64") }, title: "Exam paper" },
  ];
  if (solutions) docs.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: solutions.toString("base64") }, title: "Solutions" });
  const message = await client.beta.messages
    .stream({
      model: MODEL,
      max_tokens: 64000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "high", format: { type: "json_schema", schema: outputSchema(course.topics.map((t) => t.name)) } },
      system: systemPrompt(args, section, course, !!solutions),
      messages: [{ role: "user", content: [...docs, { type: "text", text: `Extract the Section ${section} questions as specified.` }] }],
    })
    .finalMessage();
  if (message.stop_reason === "refusal") throw new Error(`Section ${section}: the model declined`);
  if (message.stop_reason === "max_tokens") throw new Error(`Section ${section}: ran out of output tokens (paper too long for one pass)`);
  const text = message.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  return (JSON.parse(text) as { questions: Extracted[] }).questions || [];
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

/**
 * Crop one figure: a close-up look by FIGURE_MODEL at the area around the
 * rough box gives its exact box, then snapToInk() corrects it against the
 * page (drops stray lines of question text, keeps labels whole).
 * `hint` says which figure it is (the text printed with it).
 */
async function placeFigure(client: Anthropic, page: Page, rough: BBox, hint: string): Promise<Buffer> {
  const roughPx = pctToPx(page, rough);
  let box: PxBox = roughPx;
  try {
    const area = grow(page, roughPx, 0.05);
    const areaPng = await sharp(await crop(page, area)).resize({ width: Math.min(1600, area.width), withoutEnlargement: true }).png().toBuffer();
    const message = await client.messages.create({
      model: FIGURE_MODEL,
      max_tokens: 400,
      output_config: {
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            properties: { found: { type: "boolean" }, x: { type: "number" }, y: { type: "number" }, w: { type: "number" }, h: { type: "number" } },
            required: ["found", "x", "y", "w", "h"],
            additionalProperties: false,
          },
        },
      },
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/png", data: areaPng.toString("base64") } },
          {
            type: "text",
            text: [
              "This is part of a page of an exam paper. It contains a figure (a diagram, graph, structure or table image) and probably some of the question text around it.",
              `The figure belongs with this question text: "${hint.slice(0, 400)}"`,
              "Give the box around the figure as PERCENTAGES (0–100) of THIS image: x and y of its top-left corner, w and h its width and height.",
              "Include everything that belongs to the figure: axes, scale numbers, axis titles, legends, labels and their leader lines, and captions such as 'molecule A' or 'monomer 3'.",
              "Leave out question text, sentences, part labels such as (i) or (1), mark allocations and answer lines. found is false if there is no figure here.",
            ].join("\n"),
          },
        ],
      }],
    } as Anthropic.MessageCreateParamsNonStreaming);
    const text = message.content.map((c) => (c.type === "text" ? c.text : "")).join("");
    const r = JSON.parse(text) as { found: boolean; x: number; y: number; w: number; h: number };
    if (r.found && r.w > 1 && r.h > 1) {
      box = {
        left: Math.round(area.left + (clamp(r.x, 0, 100) / 100) * area.width),
        top: Math.round(area.top + (clamp(r.y, 0, 100) / 100) * area.height),
        width: Math.round((clamp(r.w, 0, 100) / 100) * area.width),
        height: Math.round((clamp(r.h, 0, 100) / 100) * area.height),
      };
    }
  } catch (err) {
    console.warn(`  close-up look failed (${(err as Error).message}); using the first box`);
  }
  return crop(page, await snapToInk(page, box));
}

/** A file name that changes when the crop does, so a new crop is never served from a cache. */
const figurePath = (sourceId: string, name: string, png: Buffer) =>
  `exam-papers/${sourceId}/${name}-${createHash("sha1").update(png).digest("hex").slice(0, 8)}.png`;

const hasFigure = (page: number, box: BBox) => page > 0 && box && box.w > 0 && box.h > 0;

type Outcome = { questions: number; marks: number; figures: number; skipped: string[] };

/** Load one paper: read it, crop its figures, and save (apply) or list (dry run) its questions. */
/**
 * --recrop: redo the figures of a paper already in the bank. Finds where each
 * of its saved figures is printed, crops them again the careful way
 * (placeFigure), and points the questions at the new images. The questions
 * themselves are left as they are.
 */
async function recropPaper(admin: any, client: Anthropic, args: Args, paper: Buffer, source: string): Promise<Outcome> {
  const sourceId = createHash("sha1").update(`${args.subject}|${source}`).digest("hex").slice(0, 10);
  const { data: rows, error } = await admin.from("questions")
    .select("id, exam_section, source_question, question, image_url, parts")
    .like("id", `ep_${sourceId}_%`);
  if (error) throw new Error(`Loading the paper's questions failed: ${error.message}`);
  type Row = { id: string; exam_section: string; source_question: string; question: string; image_url: string | null; parts: { label: string; text: string; image_url: string | null }[] | null };
  const figs: { key: string; row: Row; part: number; name: string; hint: string }[] = [];
  for (const r of (rows || []) as Row[]) {
    const n = `${r.exam_section}${r.source_question}`;
    if (r.image_url) figs.push({ key: `${r.id}|q`, row: r, part: -1, name: n, hint: r.question || "" });
    (r.parts || []).forEach((p, i) => {
      if (p.image_url) figs.push({ key: `${r.id}|${i}`, row: r, part: i, name: `${n}${p.label || ""}`, hint: p.text || "" });
    });
  }
  console.log(`${(rows || []).length} question(s) from ${source} in the bank, ${figs.length} with figures.`);
  if (!figs.length) return { questions: 0, marks: 0, figures: 0, skipped: [] };

  // Where each figure is printed.
  const list = figs.map((f) => `- key ${f.key}: question ${f.row.source_question}${f.part >= 0 ? `, part (${f.row.parts![f.part].label})` : ""}. Printed with: "${f.hint.slice(0, 300).replace(/\s+/g, " ")}"`).join("\n");
  const message = await client.beta.messages
    .stream({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: {
        effort: "high",
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            properties: {
              figures: {
                type: "array",
                items: {
                  type: "object",
                  properties: { key: { type: "string" }, figure_page: { type: "integer" }, figure_bbox: bboxSchema },
                  required: ["key", "figure_page", "figure_bbox"],
                  additionalProperties: false,
                },
              },
            },
            required: ["figures"],
            additionalProperties: false,
          },
        },
      },
      system: `You find figures in an exam paper (${source}). ${FIGURE_BOX_RULE}`,
      messages: [{
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: paper.toString("base64") }, title: "Exam paper" },
          { type: "text", text: `Find each of these figures and give its page and box, with the same key:\n${list}` },
        ],
      }],
    })
    .finalMessage();
  const text = message.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const found = new Map(((JSON.parse(text) as { figures: { key: string; figure_page: number; figure_bbox: BBox }[] }).figures || []).map((f) => [f.key, f]));
  const pages = [...new Set([...found.values()].filter((f) => hasFigure(f.figure_page, f.figure_bbox)).map((f) => f.figure_page))];
  const rendered = await renderPages(paper, pages);

  const changed = new Map<string, Row>();
  const skipped: string[] = [];
  let figures = 0;
  for (const f of figs) {
    const at = found.get(f.key);
    if (!at || !hasFigure(at.figure_page, at.figure_bbox) || !rendered.has(at.figure_page)) { skipped.push(f.name); continue; }
    const png = await placeFigure(client, rendered.get(at.figure_page)!, at.figure_bbox, f.hint);
    figures++;
    if (!args.apply) { console.log(`  ${f.name}: page ${at.figure_page}, ${png.length}-byte crop`); continue; }
    const path = figurePath(sourceId, f.name, png);
    const { error: upErr } = await admin.storage.from("question-images").upload(path, png, { contentType: "image/png", upsert: true });
    if (upErr) { console.warn(`  ${f.name}: upload failed: ${upErr.message}`); skipped.push(f.name); continue; }
    const url = admin.storage.from("question-images").getPublicUrl(path).data.publicUrl;
    const row = changed.get(f.row.id) || { ...f.row, parts: f.row.parts ? f.row.parts.map((p) => ({ ...p })) : null };
    if (f.part < 0) row.image_url = url;
    else row.parts![f.part].image_url = url;
    changed.set(f.row.id, row);
    console.log(`  ${f.name}: page ${at.figure_page} → ${path}`);
  }
  if (args.apply) {
    for (const r of changed.values()) {
      const { error: upd } = await admin.from("questions").update({ image_url: r.image_url, parts: r.parts }).eq("id", r.id);
      if (upd) console.warn(`  saving ${r.id} failed: ${upd.message}`);
    }
  }
  console.log(`${figures} figure(s) cropped again${args.apply ? `, ${changed.size} question(s) updated` : " (dry run: nothing saved)"}.${skipped.length ? ` Not found: ${skipped.join(", ")}` : ""}`);
  return { questions: changed.size, marks: 0, figures, skipped };
}

async function ingestOne(admin: any, client: Anthropic, args: Args): Promise<Outcome> {
  const source = sourceLabel(args);
  console.log(`Paper: ${source} (${args.kind}) for ${args.subject}`);
  const paper = await loadPdf(admin, args.pdf as string);
  if (args.recrop) return recropPaper(admin, client, args, paper, source);
  const solutions = args.solutions ? await loadPdf(admin, args.solutions) : null;
  const course = await loadCourse(admin, args.subject as string);
  if (!course.topics.length) console.warn(`::warning::No course called "${args.subject}" found; topics will be free text and the questions won't link to a subject. Check the name matches Admin → Curricula exactly.`);
  const subtopicsOf = new Map(course.topics.map((t) => [t.name, t.subtopics]));

  console.log(`Reading Section A (multiple choice) with ${MODEL}…`);
  const sectionA = await extractSection(client, args, "A", paper, solutions, course);
  console.log(`  ${sectionA.length} multiple-choice question(s)`);
  console.log("Reading Section B (short and extended answer)…");
  const sectionB = await extractSection(client, args, "B", paper, solutions, course);
  console.log(`  ${sectionB.length} written question(s)`);

  let all: { section: "A" | "B"; q: Extracted }[] = [
    ...sectionA.map((q) => ({ section: "A" as const, q })),
    ...sectionB.map((q) => ({ section: "B" as const, q })),
  ];
  if (args.limit) all = all.slice(0, args.limit);

  // Every page that holds a figure, for the question or one of its parts.
  const figurePages = new Set<number>();
  for (const { q } of all) {
    if (hasFigure(q.figure_page, q.figure_bbox)) figurePages.add(q.figure_page);
    for (const p of q.parts || []) if (hasFigure(p.figure_page, p.figure_bbox)) figurePages.add(p.figure_page);
  }
  console.log(`Rendering ${figurePages.size} page(s) with figures…`);
  const rendered = await renderPages(paper, [...figurePages]);

  const sourceId = createHash("sha1").update(`${args.subject}|${source}`).digest("hex").slice(0, 10);
  let figures = 0;
  const figure = async (page: number, box: BBox, name: string, hint = ""): Promise<string | null> => {
    if (!hasFigure(page, box) || !rendered.has(page)) return null;
    try {
      const png = await placeFigure(client, rendered.get(page)!, box, hint);
      figures++;
      if (!args.apply) return `(dry-run: ${png.length}-byte crop)`;
      const path = figurePath(sourceId, name, png);
      const { error } = await admin.storage.from("question-images").upload(path, png, { contentType: "image/png", upsert: true });
      if (error) throw new Error(error.message);
      return admin.storage.from("question-images").getPublicUrl(path).data.publicUrl;
    } catch (err) {
      console.warn(`  figure crop failed for ${name}: ${(err as Error).message}`);
      return null;
    }
  };

  const rows: Record<string, unknown>[] = [];
  const skipped: string[] = [];
  for (const { section, q } of all) {
    const num = String(q.number || "").replace(/^q(uestion)?\s*/i, "").trim() || String(rows.length + 1);
    const topic = args.topic || q.topic || "General";
    const subs = subtopicsOf.get(topic) || [];
    const subtopic = subs.includes(q.subtopic) ? q.subtopic : subs[0] || q.subtopic || topic;
    const base = {
      id: `ep_${sourceId}_${section}${num.replace(/[^a-z0-9]/gi, "")}`,
      subject: args.subject,
      topic,
      subtopic,
      concept_tag: `${args.subject}|${topic}|${subtopic}`.toLowerCase(),
      difficulty: clamp(Math.round(q.difficulty || 3), 1, 5),
      source,
      source_kind: args.kind,
      source_publisher: args.publisher,
      source_year: args.year,
      source_paper: args.paper,
      source_question: num,
      exam_section: section,
      image_url: await figure(q.figure_page, q.figure_bbox, `${section}${num}`, q.question || ""),
      created_at: new Date().toISOString(),
    };
    if (section === "A") {
      if (!q.question || q.options.length < 2 || q.answer_index < 0 || q.answer_index >= q.options.length) { skipped.push(`A${num}`); continue; }
      rows.push({ ...base, question_type: "mcq", question: q.question, options: q.options, answer_index: q.answer_index, solution: q.solution || "" });
    } else {
      const parts = [];
      for (const p of q.parts || []) {
        parts.push({
          label: String(p.label || "").replace(/^\(|\)?\.?$/g, ""),
          level: p.level === 2 || p.level === 3 ? p.level : 1,
          text: p.text || "",
          marks: Math.max(0, Math.round(p.marks || 0)),
          solution: p.solution || "",
          image_url: await figure(p.figure_page, p.figure_bbox, `${section}${num}${p.label || ""}`, p.text || ""),
        });
      }
      const total = parts.reduce((s, p) => s + p.marks, 0);
      if ((!q.question && !parts.length) || !total) { skipped.push(`B${num}`); continue; }
      rows.push({
        ...base, question_type: "extended", question: q.question || parts[0]?.text || "", parts, total_marks: total,
        solution: parts.map((p) => (p.label ? `${p.label}. ${p.solution}` : p.solution)).join("\n"),
      });
    }
  }

  console.log(`Prepared ${rows.length} question(s); ${figures} figure(s) cropped.${skipped.length ? ` Skipped (incomplete): ${skipped.join(", ")}` : ""}`);
  const marks = rows.reduce((s, r) => s + (r.exam_section === "A" ? 1 : Number(r.total_marks) || 0), 0);
  console.log(`Total marks: ${marks}`);

  const outcome = { questions: rows.length, marks, figures, skipped };
  if (!args.apply) {
    console.log("[dry-run] no writes. Questions:");
    for (const r of rows) {
      const parts = Array.isArray(r.parts) ? ` · ${(r.parts as { label: string; marks: number }[]).map((p) => `${p.label || "-"}:${p.marks}`).join(" ")}` : "";
      console.log(`  ${r.exam_section}${r.source_question} [${r.topic} / ${r.subtopic}]${parts}${r.image_url ? " +figure" : ""}  ${String(r.question).slice(0, 80).replace(/\n/g, " ")}`);
    }
    console.log("Re-run with apply to save these to the bank.");
    return outcome;
  }
  if (rows.length === 0) {
    console.log("Nothing to save.");
    return outcome;
  }
  const { data: saved, error } = await admin.from("questions").upsert(rows, { onConflict: "id" }).select("id");
  if (error) throw new Error(`Save failed: ${error.message}`);
  console.log(`Saved ${(saved || []).length} question(s) from ${source}.`);
  if (!solutions) console.log("Tip: no solutions PDF was given, so answers were worked out by the model. Run the 'Backfill — verify & repair' Action to fact-check them.");
  return outcome;
}

type BatchPaper = { pdf: string; solutions?: string | null; kind: "official" | "commercial"; publisher: string; year: number; paper: string; source?: string };

/**
 * Load every paper in a batch from Admin → Exam papers (exam_paper_batches),
 * one after another, writing each paper's outcome back to the batch so the
 * admin page shows it. A paper that fails is recorded and the rest carry on.
 */
async function runBatch(admin: any, client: Anthropic, id: string, cli: Args) {
  const { data: batch, error } = await admin.from("exam_paper_batches").select("id, subject, papers, results").eq("id", id).maybeSingle();
  if (error || !batch) throw new Error(`Batch ${id} not found${error ? `: ${error.message}` : ""}. Copy the ID from Admin → Exam papers.`);
  const papers = (batch.papers || []) as BatchPaper[];
  const mode = cli.apply ? "apply" : "dry-run";
  const results: Record<string, unknown> = { ...(batch.results || {}) };
  const record = async () => {
    const { error: e } = await admin.from("exam_paper_batches").update({ results, updated_at: new Date().toISOString() }).eq("id", id);
    if (e) console.warn(`  couldn't record progress: ${e.message}`);
  };
  console.log(`Batch ${id}: ${papers.length} paper(s) for ${batch.subject} (${mode})`);
  let failed = 0;
  for (let i = 0; i < papers.length; i++) {
    const p = papers[i];
    console.log(`::group::${i + 1}/${papers.length} ${p.source || p.pdf}`);
    results[i] = { status: "running", mode, at: new Date().toISOString() };
    await record();
    try {
      const out = await ingestOne(admin, client, {
        pdf: p.pdf, solutions: p.solutions || undefined, subject: batch.subject, kind: p.kind === "commercial" ? "commercial" : "official",
        publisher: p.publisher, year: Number(p.year), paper: p.paper, topic: cli.topic, apply: cli.apply, limit: cli.limit, recrop: cli.recrop,
      });
      results[i] = { status: cli.apply ? "saved" : "checked", mode, ...out, at: new Date().toISOString() };
    } catch (err) {
      failed++;
      const message = err instanceof Error ? err.message : String(err);
      results[i] = { status: "failed", mode, error: message.slice(0, 300), at: new Date().toISOString() };
      console.error(`::error::${p.source || p.pdf}: ${message}`);
    }
    await record();
    console.log("::endgroup::");
  }
  console.log(`\nDone: ${papers.length - failed} of ${papers.length} paper(s) ${cli.apply ? "saved" : "checked"}${failed ? `, ${failed} failed` : ""}.`);
  if (failed) process.exitCode = 1;
}

const BATCH_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!process.env.SUPABASE_SERVICE_KEY) {
    console.error("::error::SUPABASE_SERVICE_KEY is not set.");
    process.exit(1);
  }
  const admin = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
  const client = new Anthropic({
    apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL || undefined,
    maxRetries: 4,
  });
  const ref = (args.pdf || "").trim();
  if (BATCH_ID.test(ref)) return runBatch(admin, client, ref, args);
  if (!ref || !args.subject || !args.publisher || !args.year || !args.paper) {
    console.error("::error::Give a batch ID from Admin → Exam papers, or a single paper with --pdf, --subject, --publisher, --year and --paper.");
    process.exit(1);
  }
  await ingestOne(admin, client, args);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack || err.message : err);
  process.exit(1);
});
