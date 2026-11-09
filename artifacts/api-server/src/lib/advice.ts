import { CLAUDE_MARK_MODEL } from "./anthropic-model";
import { askForJson, sanitizeScheme, type MarkableQuestion } from "./marking";
import { describeChemDiagram, sacStage } from "./chem-figures";

/**
 * Titan's Advice: how a teacher would annotate a written-answer question.
 * The AI picks the clues in the question (phrases to underline, quantities to
 * circle, units to box, table cells to circle), writes a short handwritten
 * note for each, and lists the steps from the question to the answer. Notes
 * are checked against the question text here, so every one of them can be
 * found and drawn by the app; the result is saved on the question and shared
 * by every student.
 */

export const ADVICE_MARKS = ["underline", "double_underline", "circle", "box"] as const;
export type AdviceMark = (typeof ADVICE_MARKS)[number];
export type AdviceNote = { quote: string; mark: AdviceMark; note: string };
export type AdviceCell = { row: number; col: number; note?: string };
export type Advice = { notes: AdviceNote[]; cells: AdviceCell[]; steps: string[]; model?: string; created_at?: string };

const MAX_NOTES = 7;
const MAX_CELLS = 3;
const MAX_STEPS = 6;
const NOTE_CHARS = 48;

/** The question's maths segments ($...$ and $$...$$), exactly as written. */
export function mathSegments(text: string): string[] {
  return String(text || "").match(/\$\$[\s\S]+?\$\$|\$[^$]+?\$/g) || [];
}

/** The question's plain text with every maths segment blanked out (same length, so offsets agree). */
export function plainText(text: string): string {
  return String(text || "").replace(/\$\$[\s\S]+?\$\$|\$[^$]+?\$/g, (m) => " ".repeat(m.length));
}

/**
 * Keep only notes the app can draw: a quote that is either a phrase in the
 * plain text (outside maths) or one whole maths segment, not overlapping an
 * earlier note's quote. Cells must be inside the table.
 */
export function validateAdvice(
  question: string,
  raw: unknown,
  table?: { rows?: unknown[] } | null,
): Advice {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const plain = plainText(question);
  const maths = new Set(mathSegments(question).map((m) => m.trim()));
  const taken: [number, number][] = [];
  const notes: AdviceNote[] = [];
  for (const item of Array.isArray(r.notes) ? r.notes : []) {
    if (notes.length >= MAX_NOTES) break;
    const o = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const quote = typeof o.quote === "string" ? o.quote.trim() : "";
    const note = typeof o.note === "string" ? o.note.trim().slice(0, NOTE_CHARS) : "";
    const mark = (ADVICE_MARKS as readonly string[]).includes(String(o.mark)) ? (o.mark as AdviceMark) : "underline";
    if (!quote || !note || quote.length > 90) continue;
    let at = -1;
    if (quote.startsWith("$")) {
      if (!maths.has(quote)) continue;
      at = question.indexOf(quote);
    } else {
      if (quote.includes("$") || quote.length < 2) continue;
      at = plain.indexOf(quote);
    }
    if (at < 0) continue;
    const end = at + quote.length;
    if (taken.some(([s, e]) => at < e && end > s)) continue;
    taken.push([at, end]);
    notes.push({ quote, mark, note });
  }
  const rowCount = Array.isArray(table?.rows) ? table!.rows!.length : 0;
  const colCount = rowCount && Array.isArray(table!.rows![0]) ? (table!.rows![0] as unknown[]).length : 0;
  const cells: AdviceCell[] = [];
  for (const item of Array.isArray(r.cells) ? r.cells : []) {
    if (cells.length >= MAX_CELLS || !rowCount) break;
    const o = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const row = Math.round(Number(o.row)), col = Math.round(Number(o.col));
    if (!(row >= 0 && row < rowCount && col >= 0 && col < colCount)) continue;
    if (cells.some((c) => c.row === row && c.col === col)) continue;
    const note = typeof o.note === "string" && o.note.trim() ? o.note.trim().slice(0, NOTE_CHARS) : undefined;
    cells.push(note ? { row, col, note } : { row, col });
  }
  const steps = (Array.isArray(r.steps) ? r.steps : [])
    .filter((s): s is string => typeof s === "string" && !!s.trim())
    .slice(0, MAX_STEPS)
    .map((s) => s.replace(/\$/g, "").trim().slice(0, 300));
  return { notes, cells, steps };
}

const ADVICE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["notes", "cells", "steps"],
  properties: {
    notes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["quote", "mark", "note"],
        properties: {
          quote: { type: "string" },
          mark: { type: "string", enum: [...ADVICE_MARKS] },
          note: { type: "string" },
        },
      },
    },
    cells: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["row", "col", "note"],
        properties: { row: { type: "integer" }, col: { type: "integer" }, note: { type: "string" } },
      },
    },
    steps: { type: "array", items: { type: "string" } },
  },
} as const;

function tableText(table: unknown): string {
  const t = (table && typeof table === "object" ? table : {}) as { headers?: unknown[]; rows?: unknown[][]; caption?: string };
  if (!Array.isArray(t.headers) || !Array.isArray(t.rows)) return "";
  return [
    `${t.caption || "Table"} (body rows numbered from 0, columns from 0):`,
    `header: ${t.headers.join(" | ")}`,
    ...t.rows.map((r, i) => `row ${i}: ${(Array.isArray(r) ? r : []).join(" | ")}`),
  ].join("\n");
}

/** Ask the AI for a question's annotations and keep the ones that can be drawn. */
export async function writeAdvice(q: MarkableQuestion): Promise<Advice> {
  const scheme = sanitizeScheme(q.marking_scheme) || [];
  const year = sacStage(q.subject || "") === 1 ? 11 : 12;
  const system = [
    `You are Titan, an experienced SACE ${q.subject || "Chemistry"} teacher. A Year ${year} student has just attempted this question. Annotate the question the way a teacher marks up a paper with a pen, to show how its wording leads to the answer.`,
    `Choose 3 to ${MAX_NOTES} clues in the question: words that set up the method, quantities to use, units, the thing being asked for. For each give:`,
    "  quote: the exact text to mark, copied character for character from the question. Either a short phrase of plain words (2 to 8 words, no $ signs, nothing inside $...$), or exactly one whole maths segment including its $ signs, e.g. \"$50.0\\ \\text{mL}$\". Quotes must not overlap.",
    "  mark: underline (a key phrase), double_underline (the main thing asked for or a crucial assumption), circle (a quantity or species to use), box (units or a command word).",
    `  note: what the clue tells the student to do, as a teacher would scribble it: at most ${NOTE_CHARS} characters, plain text, no LaTeX; write formulas with Unicode (CO₂, mol L⁻¹, ×, ÷, →).`,
    `cells: up to ${MAX_CELLS} table cells to circle (row and col numbered from 0 within the table body, as listed), each with a short note or "".`,
    `steps: ${3}–${MAX_STEPS} short steps from the question to the answer, one sentence each, including the key numbers: plain text, no LaTeX or $ signs, formulas and units in Unicode (CO₂, mol L⁻¹, 6.67 × 10⁻³).`,
    "Never mark something that isn't in the question. Give the method and the reasoning, not a paragraph of theory.",
  ].join("\n");
  const shown = [tableText(q.table_data), describeChemDiagram(q.diagram)].filter(Boolean).join("\n\n");
  const user = [
    "QUESTION (its exact text):", q.question,
    ...(shown ? ["", shown] : []),
    ...(scheme.length ? ["", "MARKING SCHEME:", ...scheme.map((p, i) => `${i + 1}. [${p.marks}] ${p.point}`)] : []),
    ...(q.solution ? ["", "MODEL ANSWER:", q.solution] : []),
  ].join("\n");
  const raw = await askForJson<unknown>({
    model: CLAUDE_MARK_MODEL, system, user,
    schema: ADVICE_SCHEMA as unknown as Record<string, unknown>,
    effort: "medium", maxTokens: 12000,
  });
  const table = q.table_data && typeof q.table_data === "object" ? (q.table_data as { rows?: unknown[] }) : null;
  return { ...validateAdvice(q.question, raw, table), model: CLAUDE_MARK_MODEL, created_at: new Date().toISOString() };
}

/** A stored advice object that is still usable, or null. */
export function storedAdvice(question: string, stored: unknown, table?: { rows?: unknown[] } | null): Advice | null {
  if (!stored || typeof stored !== "object") return null;
  const a = validateAdvice(question, stored, table);
  return a.notes.length || a.steps.length ? a : null;
}
