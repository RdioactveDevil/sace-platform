/**
 * Checks on what the ingest made of a paper, so a question that came out
 * wrong is flagged for an admin before students see it (Admin → Exam papers →
 * Loaded papers). Text checks run in the app too (artifacts/gradefarm/src/lib/
 * questionChecks.js); these are the ones that need the cropped image.
 *
 * A flag is { code, where, message }: `where` is "" for the question, or the
 * part's label.
 */
import sharp from "sharp";

export type Flag = { code: string; where: string; message: string };

/** The same words, ignoring spacing and case. */
export function sameWords(a: string, b: string): boolean {
  const norm = (s: string) => String(s || "").replace(/\s+/g, " ").trim().toLowerCase();
  return !!norm(a) && norm(a) === norm(b);
}

/**
 * Whether a crop's drawing runs into its edge. Crops are snapped to the ink
 * with a white margin (figure-crop.ts), so ink on the outermost pixels means
 * the figure carries on past the crop: an axis, label or part of a diagram is
 * cut off. Returns the sides that have ink.
 */
export async function inkAtEdges(png: Buffer, opts: { dark?: number; minFrac?: number } = {}): Promise<string[]> {
  const dark = opts.dark ?? 128;
  // A stray speck isn't a cut-off figure: a side counts when enough of it is ink.
  const minFrac = opts.minFrac ?? 0.02;
  const { data, info } = await sharp(png).flatten({ background: "#ffffff" }).greyscale().raw().toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  if (W < 8 || H < 8) return [];
  const at = (x: number, y: number) => data[y * W + x] < dark;
  const frac = (n: number, f: (i: number) => boolean) => {
    let k = 0;
    for (let i = 0; i < n; i++) if (f(i)) k++;
    return k / n;
  };
  const sides: [string, number][] = [
    ["top", frac(W, (x) => at(x, 0))],
    ["bottom", frac(W, (x) => at(x, H - 1))],
    ["left", frac(H, (y) => at(0, y))],
    ["right", frac(H, (y) => at(W - 1, y))],
  ];
  return sides.filter(([, f]) => f >= minFrac).map(([s]) => s);
}

/** What a close look at a crop found (see cropCheckPrompt). */
export type CropLook = {
  is_figure: boolean;
  has_question_text: boolean;
  has_page_furniture: boolean;
  is_cut_off: boolean;
  note: string;
};

export const cropLookSchema = {
  type: "object",
  properties: {
    is_figure: { type: "boolean" },
    has_question_text: { type: "boolean" },
    has_page_furniture: { type: "boolean" },
    is_cut_off: { type: "boolean" },
    note: { type: "string" },
  },
  required: ["is_figure", "has_question_text", "has_page_furniture", "is_cut_off", "note"],
  additionalProperties: false,
};

/** The question asked about each crop, with the text the figure is printed with. */
export function cropCheckPrompt(hint: string): string {
  return [
    "This image was cropped from an exam paper to show one figure (a diagram, graph, chemical structure, table or apparatus) on its own.",
    `It is printed with this question text: "${String(hint || "").slice(0, 400)}"`,
    "Check the crop and answer:",
    "- is_figure: true if it shows a figure that fits that text. False if it is only text, only lines, a blank area, a header or footer, or a figure that clearly belongs to something else.",
    "- has_question_text: true if it also contains sentences of question text, part labels such as a. or (ii), mark allocations such as '2 marks' or '[2 marks]', or answer lines. Labels, axis titles, legends and captions that belong to the figure don't count.",
    "- has_page_furniture: true if it contains a page header or footer, page number, 'continued', 'turn over', a section heading, or a page border.",
    "- is_cut_off: true if part of the figure is missing at an edge of the crop (an axis, label, curve or part of the drawing runs off the edge).",
    "- note: one short sentence saying what is wrong, or empty if nothing is.",
  ].join("\n");
}

/** Flags for one crop, from its edges and the close look. */
export function cropFlags(where: string, edges: string[], look: CropLook | null): Flag[] {
  const out: Flag[] = [];
  const name = where ? `Part ${where}'s figure` : "The figure";
  const note = look?.note ? ` ${look.note}` : "";
  if (look && !look.is_figure) out.push({ code: "figure_wrong", where, message: `${name} doesn't look like the figure the text describes.${note}` });
  if (look?.has_question_text) out.push({ code: "figure_has_text", where, message: `${name} includes question text, part labels or marks that are printed again outside it.${note}` });
  if (look?.has_page_furniture) out.push({ code: "figure_has_furniture", where, message: `${name} includes a page header, footer or border.${note}` });
  if (look?.is_cut_off || edges.length) {
    const sides = edges.length ? ` (ink at the ${edges.join(", ")} edge${edges.length === 1 ? "" : "s"})` : "";
    out.push({ code: "figure_cut_off", where, message: `${name} may be cut off${sides}.${look?.is_cut_off ? note : ""}` });
  }
  return out;
}
