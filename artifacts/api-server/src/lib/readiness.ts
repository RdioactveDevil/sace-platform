import { escapeHtml, type EmailContent } from "./email";

// The free readiness check for parents (routes/readiness.ts): 20 questions
// from the Year 6 bank, marked here, and a report for the parent. Everything
// in this file is pure so it can be tested without a database.

export const CHECK_QUESTIONS = 20;

export const CHECK_SUBJECTS = {
  maths: { subject: "Year 6 Mathematics", label: "Maths" },
  english: { subject: "Year 6 English", label: "English" },
} as const;
export type CheckSubject = keyof typeof CHECK_SUBJECTS;

export const CHECK_YEARS = ["Year 4", "Year 5", "Year 6", "Year 7", "Year 8"] as const;

/** What selection needs to know about a bank question. */
export type PoolQuestion = {
  id: string;
  topic: string;
  difficulty: number | null;
  passage_id: string | null;
};

const VERBAL = "Verbal Reasoning for Selective School Entry";
/**
 * English: topic → how many questions, before one passage with its questions.
 * Reading is tested through a full passage, the way the reading section of a
 * selective test works, rather than through short stand-alone extracts.
 */
const ENGLISH_PLAN: Array<[string, number]> = [
  ["Grammar and Language", 6],
  [VERBAL, 9],
];
const PASSAGE_QUESTIONS = 5;

type Rand = () => number;

function shuffle<T>(items: T[], rand: Rand): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const level = (q: PoolQuestion) => q.difficulty ?? 2;

/**
 * One question from `pool` on `topic`, preferring the given difficulties and
 * falling back to any difficulty. Skips ids already in `taken`.
 */
function pickOne(pool: PoolQuestion[], topic: string, levels: number[], taken: Set<string>, rand: Rand): PoolQuestion | null {
  const onTopic = pool.filter((q) => q.topic === topic && !taken.has(q.id));
  const preferred = onTopic.filter((q) => levels.includes(level(q)));
  const from = preferred.length ? preferred : onTopic;
  if (!from.length) return null;
  const q = from[Math.floor(rand() * from.length)];
  taken.add(q.id);
  return q;
}

const byLevel = (a: PoolQuestion, b: PoolQuestion) => level(a) - level(b);

/**
 * Maths: two questions per topic, one at level 2–3 and one at level 3–4, so
 * every topic is tested at and above where practice starts. Easiest first.
 * Topics are taken from the pool, so a new topic is covered without a change
 * here (with more than ten topics, a random ten).
 */
function pickMaths(pool: PoolQuestion[], rand: Rand): PoolQuestion[] {
  const standalone = pool.filter((q) => !q.passage_id);
  const topics = shuffle([...new Set(standalone.map((q) => q.topic))], rand).slice(0, CHECK_QUESTIONS / 2);
  const taken = new Set<string>();
  const picked: PoolQuestion[] = [];
  for (const topic of topics) {
    for (const levels of [[2, 3], [3, 4]]) {
      const q = pickOne(standalone, topic, levels, taken, rand);
      if (q) picked.push(q);
    }
  }
  // Fewer than ten topics: fill up with level 3–4 questions from any topic.
  while (picked.length < CHECK_QUESTIONS) {
    const rest = standalone.filter((q) => !taken.has(q.id));
    if (!rest.length) break;
    const hard = rest.filter((q) => level(q) >= 3);
    const q = (hard.length ? hard : rest)[Math.floor(rand() * (hard.length ? hard : rest).length)];
    taken.add(q.id);
    picked.push(q);
  }
  return shuffle(picked, rand).sort(byLevel);
}

/**
 * English: grammar and verbal reasoning at level 2–4, then one passage with
 * its questions (the way the reading section of a selective test works).
 */
function pickEnglish(pool: PoolQuestion[], rand: Rand): PoolQuestion[] {
  const standalone = pool.filter((q) => !q.passage_id);
  const taken = new Set<string>();

  const byPassage = new Map<string, PoolQuestion[]>();
  for (const q of pool) if (q.passage_id) byPassage.set(q.passage_id, [...(byPassage.get(q.passage_id) ?? []), q]);
  const passages = [...byPassage.values()].filter((qs) => qs.length >= 3);
  // Prefer a passage with at least one question at level 3 or above.
  const stretching = passages.filter((qs) => qs.some((q) => level(q) >= 3));
  const choices = stretching.length ? stretching : passages;
  const passage = choices.length ? [...choices[Math.floor(rand() * choices.length)]].sort(byLevel).slice(0, PASSAGE_QUESTIONS) : [];
  passage.forEach((q) => taken.add(q.id));

  const sections: PoolQuestion[] = [];
  for (const [topic, count] of ENGLISH_PLAN) {
    const section: PoolQuestion[] = [];
    // Make up for a short passage with more verbal reasoning.
    const want = topic === VERBAL ? count + (PASSAGE_QUESTIONS - passage.length) : count;
    for (let i = 0; i < want; i++) {
      const q = pickOne(standalone, topic, [2, 3, 4], taken, rand);
      if (q) section.push(q);
    }
    sections.push(...section.sort(byLevel));
  }
  return [...sections, ...passage].slice(0, CHECK_QUESTIONS);
}

/** The questions for a check, in the order the child sees them. */
export function pickCheckQuestions(subject: CheckSubject, pool: PoolQuestion[], rand: Rand = Math.random): PoolQuestion[] {
  return subject === "maths" ? pickMaths(pool, rand) : pickEnglish(pool, rand);
}

// ── Marking ─────────────────────────────────────────────────────────────────

/** A bank question with what marking and the review need. */
export type MarkQuestion = {
  id: string;
  topic: string;
  difficulty: number | null;
  question: string;
  options: string[];
  answer_index: number;
  solution: string | null;
  passage_title: string | null;
};

export type TopicResult = { topic: string; right: number; total: number };

export type ReviewItem = {
  id: string;
  topic: string;
  question: string;
  options: string[];
  /** The option the child picked, or null if they skipped it. */
  picked: number | null;
  answer_index: number;
  solution: string | null;
  passage_title: string | null;
};

export type ReadinessReport = {
  score: number;
  max: number;
  skipped: number;
  band: { key: "ready" | "strong" | "building" | "early"; label: string };
  summary: string;
  /** Questions at level 3 and above: the ones closest to the real test. */
  stretch: { right: number; total: number };
  topics: TopicResult[];
  strengths: string[];
  work_on: string[];
  /** Where practice should start. */
  start_with: string | null;
  /** The questions they got wrong or skipped, with worked solutions. */
  review: ReviewItem[];
};

function band(score: number, max: number): ReadinessReport["band"] {
  const p = max ? score / max : 0;
  if (p >= 0.85) return { key: "ready", label: "Ready for the hardest questions" };
  if (p >= 0.65) return { key: "strong", label: "Strong, with a few gaps to close" };
  if (p >= 0.45) return { key: "building", label: "Building toward selective level" };
  return { key: "early", label: "Early days, with plenty of time to build" };
}

function summary(name: string, b: ReadinessReport["band"], startWith: string | null): string {
  const start = startWith ? ` Start with ${startWith}.` : "";
  switch (b.key) {
    case "ready":
      return `${name} handled selective-level questions well. The next step is level 4 and 5 questions, so they stay sharp and keep stretching.${start}`;
    case "strong":
      return `${name} has a strong base. A few topics are costing marks, and a little practice on each every day will close them.${start}`;
    case "building":
      return `${name} has the foundations, but several topics are costing marks. Daily practice that starts at their level and steps up will move this quickly.${start}`;
    default:
      return `These questions are pitched above Year 6, so this is a common starting point. Short daily practice from where ${name} is now builds up fast.${start}`;
  }
}

/**
 * Mark the check and build the parent's report. `answers` maps question id
 * to the picked option index; a missing or invalid answer counts as skipped.
 */
export function buildReport(childName: string, questions: MarkQuestion[], answers: Record<string, unknown>): ReadinessReport {
  const topics = new Map<string, TopicResult>();
  const review: ReviewItem[] = [];
  let score = 0;
  let skipped = 0;
  const stretch = { right: 0, total: 0 };

  for (const q of questions) {
    const raw = answers[q.id];
    const picked = Number.isInteger(raw) && (raw as number) >= 0 && (raw as number) < q.options.length ? (raw as number) : null;
    const right = picked === q.answer_index;
    if (picked === null) skipped++;
    if (right) score++;
    const t = topics.get(q.topic) ?? { topic: q.topic, right: 0, total: 0 };
    t.total++;
    if (right) t.right++;
    topics.set(q.topic, t);
    if ((q.difficulty ?? 2) >= 3) {
      stretch.total++;
      if (right) stretch.right++;
    }
    if (!right) {
      review.push({
        id: q.id, topic: q.topic, question: q.question, options: q.options, picked,
        answer_index: q.answer_index, solution: q.solution, passage_title: q.passage_title,
      });
    }
  }

  const list = [...topics.values()];
  const pct = (t: TopicResult) => t.right / t.total;
  // Strong: every question right, or 3 in 4 or better on a topic with several.
  const strengths = list
    .filter((t) => t.right === t.total || (t.total >= 3 && pct(t) >= 0.75))
    .sort((a, b) => pct(b) - pct(a) || b.total - a.total)
    .slice(0, 3)
    .map((t) => t.topic);
  // To work on: half or fewer right. Weakest (and most tested) first.
  const weak = list.filter((t) => pct(t) <= 0.5).sort((a, b) => pct(a) - pct(b) || b.total - a.total);
  const workOn = weak.slice(0, 3).map((t) => t.topic);
  // Nothing at half or below: start with the topic that lost the most marks.
  const lostMost = [...list].filter((t) => t.right < t.total).sort((a, b) => (b.total - b.right) - (a.total - a.right) || pct(a) - pct(b))[0];
  const startWith = workOn[0] ?? lostMost?.topic ?? null;

  const max = questions.length;
  const b = band(score, max);
  return {
    score, max, skipped, band: b,
    summary: summary(childName, b, startWith),
    stretch,
    topics: list.sort((a, b) => pct(b) - pct(a) || a.topic.localeCompare(b.topic)),
    strengths,
    work_on: workOn,
    start_with: startWith,
    review,
  };
}

// ── Email ───────────────────────────────────────────────────────────────────

/** The report email to the parent. */
export function readinessEmail(opts: {
  childName: string;
  subjectLabel: string;
  report: ReadinessReport;
  reportUrl: string;
}): { subject: string; content: EmailContent } {
  const { childName: name, report: r } = opts;
  const rows = r.topics
    .map((t) => {
      const width = Math.round((t.right / t.total) * 100);
      const colour = width >= 75 ? "#10b981" : width > 50 ? "#f1be43" : "#ef6b6b";
      return `<tr>
        <td style="padding:7px 0;color:#0c1037;font-size:13px;width:58%">${escapeHtml(t.topic)}</td>
        <td style="padding:7px 8px"><div style="background:#e5e5ea;border-radius:4px;height:8px"><div style="background:${colour};width:${Math.max(width, 4)}%;height:8px;border-radius:4px"></div></div></td>
        <td style="padding:7px 0;color:#4a5068;font-size:13px;font-weight:700;text-align:right;white-space:nowrap">${t.right}/${t.total}</td>
      </tr>`;
    })
    .join("");
  const table = `<table role="presentation" style="width:100%;border-collapse:collapse;margin:0 0 24px">${rows}</table>`;
  const details: Array<[string, string]> = [["Score", `${r.score} of ${r.max} right`]];
  if (r.stretch.total) details.push(["Harder questions", `${r.stretch.right} of ${r.stretch.total} (level 3 and up)`]);
  if (r.strengths.length) details.push(["Strong at", r.strengths.join(", ")]);
  if (r.work_on.length) details.push(["Work on", r.work_on.join(", ")]);

  return {
    subject: `${name}'s ${opts.subjectLabel} readiness check: ${r.score} of ${r.max}`,
    content: {
      heading: `${name}: ${r.band.label}`,
      paragraphs: [
        r.summary,
        "Twenty questions is a snapshot, not a prediction of a test result, but it shows where marks are being lost. The full report has every question they missed, with the working.",
      ],
      details,
      extraHtml: table,
      cta: { label: "See the full report", url: opts.reportUrl },
      footer: `You're getting this because you asked for ${name}'s free readiness check at gradefarm.com.au. If that wasn't you, you can ignore this email. Questions? support@titaniumtutoring.com.au`,
    },
  };
}
