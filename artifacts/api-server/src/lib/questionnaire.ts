/**
 * The pre-call questionnaire a tutor sends a prospect after they book a
 * consultation: its shape, the starting sets, validation of a questionnaire
 * and of a prospect's answers, red flags, and when it is open.
 *
 * Each tutor has one master; every diagnostic stores its own snapshot taken at
 * create time and never re-snapshots, so answers always match the questions
 * that were shown.
 */
import { randomBytes } from "node:crypto";
import { appUrl } from "./email";

export type QOption = { id: string; label: string; flag?: boolean };
export type QItem = {
  id: string;
  type: "section" | "short" | "long" | "one" | "many";
  label: string;
  help?: string;
  required?: boolean;
  options?: QOption[];
  /** "Other: ___" choice; only on one / many. */
  other?: boolean;
};
export type Questionnaire = { intro: string; items: QItem[] };
/**
 * short/long: text. one: option id, or { choice: "other", other: text } when
 * the item allows Other. many: array of distinct option ids, plus at most one
 * { other: text } object when the item allows Other.
 */
export type OtherAnswer = { other: string };
export type Answers = Record<string, string | Array<string | OtherAnswer> | { choice: string; other?: string }>;

export const MAX_ITEMS = 60;
export const MAX_LABEL = 300;
export const MAX_HELP = 500;
export const MAX_OPTIONS = 20;
export const MAX_OPTION_LABEL = 200;
export const MAX_INTRO = 2000;
export const MAX_ANSWER = 5000;

const RESERVED_IDS = ["__proto__", "constructor", "prototype"];
const TYPES = ["section", "short", "long", "one", "many"] as const;
const newId = () => randomBytes(6).toString("base64url"); // 8 url-safe chars

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

// ---------------------------------------------------------------------------
// Starting sets
// ---------------------------------------------------------------------------

const opts = (prefix: string, labels: string[], flagged: number[] = []): QOption[] =>
  labels.map((label, i) => ({ id: `${prefix}${i + 1}`, label, ...(flagged.includes(i) ? { flag: true } : {}) }));

/** A new tutor's questionnaire until they edit it. Neutral wording. */
export const DEFAULT_QUESTIONNAIRE: Questionnaire = {
  intro:
    "Thanks for booking a call. A few quick questions so we can make the most of our time together.",
  items: [
    { id: "school", type: "short", label: "What school do you attend?", required: true },
    { id: "results", type: "short", label: "What are your current results in this subject?" },
    { id: "why", type: "long", label: "Why are you looking for a tutor?", required: true },
    { id: "goal", type: "short", label: "What is your goal for this subject?" },
    { id: "other", type: "long", label: "Is there anything else we should know before the call?" },
  ],
};

/** The platform owner's own questionnaire. Nothing uses this automatically. */
export const OWNER_QUESTIONNAIRE: Questionnaire = {
  intro:
    "THIS FORM IS MEANT TO BE COMPLETED BY THE STUDENT THEMSELVES — NOT PARENTS. Thank you for booking a call with us! Before we get on call, we would like to know a few things about you that would help in my understanding of what you're looking for, and what problems you have been facing so far. Please answer as honestly as possible, because this call is ONLY for your benefit, and we need to know your situation accurately.",
  items: [
    { id: "sec-personal", type: "section", label: "Personal details" },
    { id: "school", type: "short", label: "What school do you attend?", required: true },
    {
      id: "year-level",
      type: "one",
      label: "What year level are you in?",
      required: true,
      options: opts("y", ["Year 9", "Year 10", "Year 11", "Year 12"]),
    },
    { id: "subjects", type: "short", label: "What subject(s) are you looking for?" },
    { id: "sec-situation", type: "section", label: "Current situation" },
    {
      id: "average",
      type: "one",
      label: "What is your current test/SAC average?",
      required: true,
      options: opts("a", ["95%+", "90-95%", "85-90%", "80-85%", "70-80%", "60-70%", "50-60%", "<50%"]),
    },
    {
      id: "why",
      type: "one",
      label: "Why are you currently looking for a tutor?",
      required: true,
      options: opts("w", [
        "Facing problems with basic skills.",
        "Understanding basics easily but facing trouble with application-style questions.",
        "Declining marks.",
        "Stagnant marks - no improvement.",
      ]),
    },
    {
      id: "one-thing",
      type: "long",
      label: "What's the ONE thing I could do in the call that would SKYROCKET your progress?",
      required: true,
    },
    { id: "sec-goals", type: "section", label: "Goals and aspirations" },
    {
      id: "goal",
      type: "one",
      label: "What is your goal for this subject?",
      required: true,
      options: opts("g", ["50", "45-50", "40-45", "35-40", "30-35", "<35"]),
    },
    {
      id: "atar",
      type: "one",
      label: "What ATAR are you aiming to achieve?",
      required: true,
      options: opts("t", ["99+", "95-99", "90-94", "<90"]),
    },
    {
      id: "career",
      type: "one",
      label: "What career pathway are you looking to enter? (Or have an inclination towards)",
      required: true,
      other: true,
      options: opts("c", ["Medicine", "Engineering", "Law", "Computer Science/IT", "Commerce"]),
    },
    {
      id: "dedication",
      type: "one",
      label: "How dedicated are you to getting the results you want?",
      required: true,
      options: opts(
        "d",
        [
          "VERY dedicated - I am willing to put in the hard yards!",
          "MAYBE dedicated - I guess I'll work hard?",
          "NOT dedicated - I don't care if I achieve my goal or not.",
        ],
        [1, 2],
      ),
    },
    { id: "sec-action", type: "section", label: "Are you an action taker?" },
    {
      id: "action",
      type: "one",
      label:
        "If you need to get support, are you willing to take action ASAP, or want to think about it and risk losing time?",
      required: true,
      options: opts(
        "x",
        [
          "GET ME RESULTS ASAP! (You're an action-taker and walk-the-walk to get results.)",
          "Uh... Maybe. Idk? I'll think about it... (You're unsure if you want to succeed).",
          "Nope - I don't need help! (No point getting on the call if you select this!)",
        ],
        [1, 2],
      ),
    },
  ],
};

// ---------------------------------------------------------------------------
// Validating a questionnaire
// ---------------------------------------------------------------------------

function cleanText(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > max ? null : t;
}

/**
 * Checks types and limits, trims labels, generates missing ids, drops
 * options/other/required where the type can't have them. Rejects duplicate
 * ids and a questionnaire with no questions (sections only).
 */
export function validateQuestionnaire(raw: unknown): { questionnaire: Questionnaire } | { error: string } {
  if (!isObj(raw)) return { error: "Questionnaire must be an object." };
  const intro = raw.intro === undefined || raw.intro === null ? "" : cleanText(raw.intro, MAX_INTRO);
  if (intro === null) return { error: `Intro must be text up to ${MAX_INTRO} characters.` };
  if (!Array.isArray(raw.items)) return { error: "Questionnaire items must be a list." };
  if (raw.items.length > MAX_ITEMS) return { error: `A questionnaire can have at most ${MAX_ITEMS} items.` };

  const seen = new Set<string>();
  const claim = (id: string): boolean => {
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  };
  const freshId = () => {
    let id = newId();
    while (seen.has(id)) id = newId();
    seen.add(id);
    return id;
  };
  // Explicit ids first, so generated ones can't collide with a later explicit id.
  const explicit = (v: unknown): string | null | undefined =>
    v === undefined || v === null || v === "" ? undefined : typeof v === "string" && v.length <= 64 ? v : null;

  const items: QItem[] = [];
  for (const r of raw.items) {
    if (!isObj(r)) return { error: "Each item must be an object." };
    const eid = explicit(r.id);
    if (eid === null) return { error: "Item ids must be short text." };
    if (eid !== undefined && RESERVED_IDS.includes(eid)) return { error: "That item id is reserved." };
    if (eid !== undefined && !claim(eid)) return { error: "Item ids must be unique." };
    for (const o of Array.isArray(r.options) ? r.options : []) {
      const oid = isObj(o) ? explicit(o.id) : undefined;
      if (oid === null) return { error: "Option ids must be short text." };
    }
  }
  // Second pass builds items (explicit item ids are already claimed).
  for (const r of raw.items as Record<string, unknown>[]) {
    const type = r.type as QItem["type"];
    if (!TYPES.includes(type)) return { error: "Unknown item type." };
    const label = cleanText(r.label, MAX_LABEL);
    if (!label) return { error: `Every item needs a label of up to ${MAX_LABEL} characters.` };
    const item: QItem = { id: explicit(r.id) ?? freshId(), type, label };
    if (r.help !== undefined && r.help !== null && r.help !== "") {
      const help = cleanText(r.help, MAX_HELP);
      if (help === null) return { error: `Help text can be at most ${MAX_HELP} characters.` };
      if (help) item.help = help;
    }
    if (type !== "section" && r.required === true) item.required = true;
    if (type === "one" || type === "many") {
      const rawOpts = r.options;
      if (!Array.isArray(rawOpts) || rawOpts.length === 0) return { error: "Choice questions need at least one option." };
      if (rawOpts.length > MAX_OPTIONS) return { error: `A question can have at most ${MAX_OPTIONS} options.` };
      const optionIds = new Set<string>();
      item.options = [];
      for (const o of rawOpts) {
        if (!isObj(o)) return { error: "Each option must be an object." };
        const ol = cleanText(o.label, MAX_OPTION_LABEL);
        if (!ol) return { error: `Every option needs a label of up to ${MAX_OPTION_LABEL} characters.` };
        let oid: string = explicit(o.id) ?? "";
        if (oid === "") {
          oid = newId();
          while (optionIds.has(oid)) oid = newId();
        } else if (optionIds.has(oid)) return { error: "Option ids must be unique within a question." };
        optionIds.add(oid);
        item.options.push({ id: oid, label: ol, ...(o.flag === true ? { flag: true } : {}) });
      }
      if (r.other === true) item.other = true;
    }
    items.push(item);
  }
  if (!items.some((i) => i.type !== "section")) return { error: "Add at least one question." };
  return { questionnaire: { intro, items } };
}

/** A deep copy, for storing on a diagnostic. */
export function snapshotFrom(q: Questionnaire): Questionnaire {
  return JSON.parse(JSON.stringify(q)) as Questionnaire;
}

// ---------------------------------------------------------------------------
// Validating answers
// ---------------------------------------------------------------------------

/**
 * Keeps only answers to known questions. Required questions must be answered.
 * Blank optional answers are left out.
 */
export function validateAnswers(q: Questionnaire, raw: unknown): { answers: Answers } | { error: string } {
  if (!isObj(raw)) return { error: "Answers must be an object." };
  const answers: Answers = {};
  for (const item of q.items) {
    if (item.type === "section") continue;
    const v = Object.hasOwn(raw, item.id) ? raw[item.id] : undefined;
    const missing = () => ({ error: `Please answer: ${item.label}` });
    const invalid = () => ({ error: `That answer isn't valid: ${item.label}` });
    const blank = v === undefined || v === null || v === "";

    if (item.type === "short" || item.type === "long") {
      if (!blank && typeof v !== "string") return invalid();
      const t = typeof v === "string" ? v.trim() : "";
      if (t.length > MAX_ANSWER) return { error: `Answers can be at most ${MAX_ANSWER} characters: ${item.label}` };
      if (t) answers[item.id] = t;
      else if (item.required) return missing();
      continue;
    }

    const optionIds = new Set((item.options ?? []).map((o) => o.id));
    const otherText = (x: unknown): string | null => {
      if (typeof x !== "string") return null;
      const t = x.trim();
      return t.length > MAX_ANSWER ? null : t;
    };

    if (item.type === "one") {
      if (blank) {
        if (item.required) return missing();
        continue;
      }
      if (typeof v === "string") {
        if (!optionIds.has(v)) return invalid();
        answers[item.id] = v;
      } else if (isObj(v) && v.choice === "other") {
        if (!item.other) return invalid();
        const t = otherText(v.other);
        if (t === null) return { error: `Answers can be at most ${MAX_ANSWER} characters: ${item.label}` };
        if (t) answers[item.id] = { choice: "other", other: t };
        else if (item.required) return missing();
      } else return invalid();
      continue;
    }

    // many
    if (blank) {
      if (item.required) return missing();
      continue;
    }
    if (!Array.isArray(v)) return invalid();
    const picked: string[] = [];
    let other: { other: string } | null = null;
    for (const e of v) {
      if (typeof e === "string") {
        if (!optionIds.has(e) || picked.includes(e)) return invalid();
        picked.push(e);
      } else if (isObj(e) && "other" in e) {
        if (!item.other || other) return invalid();
        const t = otherText(e.other);
        if (t === null) return { error: `Answers can be at most ${MAX_ANSWER} characters: ${item.label}` };
        if (t) other = { other: t };
      } else return invalid();
    }
    if (picked.length === 0 && !other) {
      if (item.required) return missing();
      continue;
    }
    answers[item.id] = other ? [...picked, other] : picked;
  }
  return { answers };
}

// ---------------------------------------------------------------------------
// Red flags
// ---------------------------------------------------------------------------

/** Flagged options chosen, as question/answer text. Free-text Other is never flagged. */
export function flaggedAnswers(q: Questionnaire, a: Answers): Array<{ question: string; answer: string }> {
  const out: Array<{ question: string; answer: string }> = [];
  for (const item of q.items) {
    if (item.type !== "one" && item.type !== "many") continue;
    const v = a[item.id];
    if (v === undefined) continue;
    const chosen: unknown[] = Array.isArray(v) ? v : [v];
    for (const c of chosen) {
      if (typeof c !== "string") continue;
      const opt = item.options?.find((o) => o.id === c);
      if (opt?.flag) out.push({ question: item.label, answer: opt.label });
    }
  }
  return out;
}

export function countRedFlags(q: Questionnaire, a: Answers): number {
  return flaggedAnswers(q, a).length;
}

// ---------------------------------------------------------------------------
// Open / status
// ---------------------------------------------------------------------------

/** The call with the latest start (the "live" one when a diagnostic has several). */
export function latestByStart<T extends { scheduled_at: string }>(calls: T[]): T {
  return calls.reduce((a, b) => (Date.parse(b.scheduled_at) > Date.parse(a.scheduled_at) ? b : a));
}

/**
 * Open while the diagnostic isn't cancelled and either it has no non-cancelled
 * consultation, or now is before the end (scheduled_at + duration) of the
 * latest non-cancelled one.
 */
export function questionnaireOpen(o: {
  cancelledAt: string | null;
  calls: Array<{ status: string; scheduled_at: string; duration_minutes: number }>;
  now: number;
}): boolean {
  if (o.cancelledAt) return false;
  const live = o.calls.filter((c) => c.status !== "cancelled");
  if (live.length === 0) return true;
  const latest = latestByStart(live);
  return o.now < Date.parse(latest.scheduled_at) + latest.duration_minutes * 60_000;
}

/** null = no snapshot (nothing to show). */
export function questionnaireStatus(o: {
  hasSnapshot: boolean;
  submittedAt: string | null;
  hasLiveBooking: boolean;
}): "none" | "waiting" | "submitted" | null {
  if (!o.hasSnapshot) return null;
  if (o.submittedAt) return "submitted";
  return o.hasLiveBooking ? "waiting" : "none";
}

/**
 * The link booking emails and the Booked screen carry. A snapshot wins: the
 * built-in form. The legacy link is used only for a diagnostic without one.
 */
export function questionnaireLinkFor(d: {
  token: string;
  questionnaire: unknown | null;
  pre_call_form_url: string | null;
}): string | null {
  if (d.questionnaire) return `${appUrl()}/questionnaire/${encodeURIComponent(d.token)}`;
  return d.pre_call_form_url?.trim() || null;
}

// ---------------------------------------------------------------------------
// Reminder
// ---------------------------------------------------------------------------

const REMINDER_LEAD_MS = 24 * 60 * 60 * 1000;

/**
 * Time for the one reminder: from 24 hours before the live call's start until
 * it starts, answers not in, none sent yet. A call booked less than 24 hours
 * ahead is skipped: the booking email already carried the link.
 */
export function dueQuestionnaireReminder(o: {
  call: { scheduled_at: string; created_at: string } | null;
  submittedAt: string | null;
  remindedAt: string | null;
  now: number;
}): boolean {
  if (!o.call || o.submittedAt || o.remindedAt) return false;
  const start = Date.parse(o.call.scheduled_at);
  const created = Date.parse(o.call.created_at);
  if (!Number.isFinite(start) || !Number.isFinite(created)) return false;
  if (start - created < REMINDER_LEAD_MS) return false;
  return o.now >= start - REMINDER_LEAD_MS && o.now < start;
}
