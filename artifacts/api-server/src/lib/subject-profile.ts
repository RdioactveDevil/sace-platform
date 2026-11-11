import { isChemSubject, sacStage } from "./chem-figures";

/**
 * Who a written-answer question is for, from the subject's name (and the
 * curriculum's level label when there is one): what kind of subject it is,
 * the exam board, and the student's year. The prompts that write, check and
 * mark written answers, and Titan's advice on them, all speak from this, so a
 * Year 6 maths answer isn't marked as if it were SACE Chemistry.
 */
export type SubjectKind = "chem" | "maths" | "other";

export type SubjectProfile = {
  kind: SubjectKind;
  board: "SACE" | "VCE" | null;
  /** The student's year level, when it can be told. */
  year: number | null;
  /** "Year 12", or "senior secondary" when the year is unknown. */
  yearText: string;
  /** Who checks and marks: "SACE Chemistry Stage 2 assessor", "Year 6 Mathematics teacher". */
  marker: string;
  /** The exam the questions are styled on, for the question writer. */
  examStyle: string;
};

const MATHS_RE = /math|method|specialist|statist|calculus|algebra|numeracy/i;

export function subjectKind(subject: string): SubjectKind {
  if (isChemSubject(subject)) return "chem";
  if (MATHS_RE.test(subject || "")) return "maths";
  return "other";
}

function yearOf(subject: string, levelLabel: string): number | null {
  const labelled = `${levelLabel} ${subject}`.match(/year\s*(\d{1,2})/i);
  if (labelled) return Number(labelled[1]);
  const stage = sacStage(subject);
  if (stage) return stage === 1 ? 11 : 12;
  if (/units?\s*1\s*(?:and|&|-)\s*2/i.test(subject)) return 11;
  if (/units?\s*3\s*(?:and|&|-)\s*4/i.test(subject)) return 12;
  return null;
}

export function subjectProfile(subject: string, levelLabel = ""): SubjectProfile {
  const name = (subject || "").trim();
  const board = /\bsace\b/i.test(name) || sacStage(name) ? "SACE" : /\bvce\b/i.test(name) ? "VCE" : null;
  const year = yearOf(name, levelLabel || "");
  const yearText = year ? `Year ${year}` : "senior secondary";
  const prefix = board && !name.toUpperCase().startsWith(board) ? `${board} ` : "";
  const marker = board ? `${prefix}${name} assessor` : `${name} teacher`;
  const senior = year == null || year >= 11;
  let examStyle: string;
  if (board === "SACE") {
    examStyle = year === 11
      ? "pitched at SACE Stage 1 (Year 11) tests, written in the style of SACE exams"
      : "in the style of the SACE end-of-year exam";
  } else if (board === "VCE") {
    examStyle = year === 11
      ? "pitched at Year 11 school tests, written in the style of VCAA exams"
      : "in the style of the VCAA end-of-year exams";
  } else {
    examStyle = senior ? "in the style of end-of-year school exams" : `pitched at ${yearText} class tests`;
  }
  return { kind: subjectKind(name), board, year, yearText, marker, examStyle };
}
