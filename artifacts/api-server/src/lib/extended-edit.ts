/**
 * Editing a multi-part exam question (question_type 'extended', Section B of a
 * loaded exam paper) from Admin. Checks what was sent and builds the update:
 * the stem, the parts, and the totals and solution worked out from them.
 */

export type Part = { label: string; level: 1 | 2 | 3; text: string; marks: number; solution: string; image_url: string | null };

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

export function buildExtendedUpdate(body: unknown): { update: Record<string, unknown> } | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const question = str(b.question, 6000).trim();
  if (!Array.isArray(b.parts) || !b.parts.length) return { error: "A question needs at least one part." };
  if (b.parts.length > 30) return { error: "Up to 30 parts." };
  const parts: Part[] = [];
  for (const [i, raw] of b.parts.entries()) {
    const p = (raw ?? {}) as Record<string, unknown>;
    const text = str(p.text, 6000).trim();
    const marks = Number(p.marks);
    if (!Number.isInteger(marks) || marks < 0 || marks > 40) return { error: `Part ${i + 1}: marks must be a whole number from 0 to 40.` };
    const level = Number(p.level);
    const img = typeof p.image_url === "string" && /^https:\/\//i.test(p.image_url.trim()) ? p.image_url.trim() : null;
    // A question without lettered parts: the stem is its text, its one unlabelled part only the answer space.
    const answerSpaceOnly = b.parts.length === 1 && !str(p.label, 12).trim() && !!question;
    if (!text && !img && !answerSpaceOnly) return { error: `Part ${i + 1} needs its question.` };
    parts.push({
      label: str(p.label, 12).trim().replace(/^\(|\)?\.?$/g, ""),
      level: level === 2 || level === 3 ? level : 1,
      text,
      marks,
      solution: str(p.solution, 10000).trim(),
      image_url: img,
    });
  }
  const total = parts.reduce((s, p) => s + p.marks, 0);
  if (!total) return { error: "The parts need at least one mark between them." };
  return {
    update: {
      question: question || parts[0].text,
      parts,
      total_marks: total,
      solution: parts.map((p) => (p.label ? `${p.label}. ${p.solution}` : p.solution)).join("\n"),
    },
  };
}
