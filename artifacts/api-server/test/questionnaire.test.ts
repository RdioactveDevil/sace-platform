import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_QUESTIONNAIRE,
  OWNER_QUESTIONNAIRE,
  countRedFlags,
  flaggedAnswers,
  questionnaireOpen,
  questionnaireStatus,
  snapshotFrom,
  validateAnswers,
  validateQuestionnaire,
  type Questionnaire,
} from "../src/lib/questionnaire";

const ok = (r: ReturnType<typeof validateQuestionnaire>) => {
  assert.ok("questionnaire" in r, "error" in r ? r.error : "");
  return r.questionnaire;
};
const bad = (r: { error: string } | object) => {
  assert.ok("error" in r, "expected an error");
};
const short = (label = "Q") => ({ type: "short", label });

test("starting sets validate and never say 'your tutor'", () => {
  for (const q of [DEFAULT_QUESTIONNAIRE, OWNER_QUESTIONNAIRE]) {
    ok(validateQuestionnaire(q));
    assert.doesNotMatch(JSON.stringify(q), /your tutor/i);
  }
});

test("owner set: 4 flagged options, career question allows Other", () => {
  const items = OWNER_QUESTIONNAIRE.items;
  const flagged = items.flatMap((i) => (i.options ?? []).filter((o) => o.flag));
  assert.equal(flagged.length, 4);
  const career = items.find((i) => /career pathway/.test(i.label));
  assert.equal(career?.other, true);
  assert.match(OWNER_QUESTIONNAIRE.intro, /^THIS FORM IS MEANT/);
  assert.ok(items.some((i) => /facing trouble with application-style/.test(JSON.stringify(i))));
});

test("validateQuestionnaire limits", () => {
  bad(validateQuestionnaire({ intro: "", items: Array.from({ length: 61 }, () => short()) }));
  ok(validateQuestionnaire({ intro: "", items: Array.from({ length: 60 }, () => short()) }));
  bad(validateQuestionnaire({ intro: "", items: [short("x".repeat(301))] }));
  bad(validateQuestionnaire({ intro: "", items: [{ ...short(), help: "x".repeat(501) }] }));
  bad(validateQuestionnaire({ intro: "x".repeat(2001), items: [short()] }));
  const opts = (n: number) => Array.from({ length: n }, (_, i) => ({ label: `o${i}` }));
  bad(validateQuestionnaire({ intro: "", items: [{ type: "one", label: "Q", options: opts(21) }] }));
  ok(validateQuestionnaire({ intro: "", items: [{ type: "one", label: "Q", options: opts(20) }] }));
  bad(validateQuestionnaire({ intro: "", items: [{ type: "one", label: "Q", options: [{ label: "x".repeat(201) }] }] }));
  bad(validateQuestionnaire({ intro: "", items: [{ type: "one", label: "Q", options: [] }] }));
});

test("validateQuestionnaire rejects bad shapes", () => {
  bad(validateQuestionnaire(null));
  bad(validateQuestionnaire({ intro: "", items: [{ type: "date", label: "Q" }] }));
  bad(validateQuestionnaire({ intro: "", items: [{ id: "a", ...short() }, { id: "a", ...short() }] }));
  bad(validateQuestionnaire({ intro: "", items: [] }));
  bad(validateQuestionnaire({ intro: "", items: [{ type: "section", label: "Only a heading" }] }));
  bad(validateQuestionnaire({ intro: "", items: [short("   ")] }));
  bad(validateQuestionnaire({ intro: "", items: "nope" }));
});

test("validateQuestionnaire normalises", () => {
  const q = ok(
    validateQuestionnaire({
      intro: "  hi  ",
      items: [
        { type: "short", label: "  School  ", options: [{ label: "x" }], other: true, required: true },
        { type: "section", label: "S", required: true, other: true },
        { type: "many", label: "M", other: true, options: [{ label: " A ", flag: true }, { label: "B" }] },
      ],
    }),
  );
  assert.equal(q.intro, "hi");
  assert.equal(q.items[0].label, "School");
  assert.equal(q.items[0].options, undefined);
  assert.equal(q.items[0].other, undefined);
  assert.equal(q.items[0].required, true);
  assert.equal(q.items[1].required, undefined);
  assert.equal(q.items[1].other, undefined);
  assert.equal(q.items[2].other, true);
  assert.equal(q.items[2].options?.[0].label, "A");
  assert.equal(q.items[2].options?.[0].flag, true);
  assert.equal(q.items[2].options?.[1].flag, undefined);
  const ids = [...q.items.map((i) => i.id), ...q.items[2].options!.map((o) => o.id)];
  for (const id of ids) assert.match(id, /^[A-Za-z0-9_-]{8}$/);
  assert.equal(new Set(ids).size, ids.length);
});

test("snapshotFrom is a deep copy", () => {
  const snap = snapshotFrom(OWNER_QUESTIONNAIRE);
  assert.deepEqual(snap, OWNER_QUESTIONNAIRE);
  snap.items[2].options![0].label = "changed";
  snap.items.pop();
  snap.intro = "x";
  assert.notEqual(OWNER_QUESTIONNAIRE.items[2].options![0].label, "changed");
  assert.notEqual(OWNER_QUESTIONNAIRE.intro, "x");
});

const Q: Questionnaire = {
  intro: "",
  items: [
    { id: "h", type: "section", label: "Head" },
    { id: "s", type: "short", label: "School", required: true },
    { id: "l", type: "long", label: "More" },
    {
      id: "o",
      type: "one",
      label: "Pick",
      other: true,
      options: [{ id: "a", label: "A" }, { id: "b", label: "B", flag: true }],
    },
    {
      id: "m",
      type: "many",
      label: "Many",
      options: [{ id: "x", label: "X", flag: true }, { id: "y", label: "Y" }],
    },
    { id: "n", type: "one", label: "NoOther", options: [{ id: "p", label: "P" }] },
  ],
};
const good = { s: "  Uni High " };

test("validateAnswers accepts and trims", () => {
  const r = validateAnswers(Q, { ...good, o: "a", m: ["x", "y"], junk: "zzz", h: "no" });
  assert.deepEqual(r, { answers: { s: "Uni High", o: "a", m: ["x", "y"] } });
});

test("validateAnswers rejects", () => {
  bad(validateAnswers(Q, { ...good, o: "zzz" }));
  bad(validateAnswers(Q, { ...good, o: ["a"] }));
  bad(validateAnswers(Q, { ...good, m: "x" }));
  bad(validateAnswers(Q, { ...good, m: ["x", "x"] }));
  bad(validateAnswers(Q, { ...good, m: ["nope"] }));
  bad(validateAnswers(Q, {}));
  bad(validateAnswers(Q, { s: "   " }));
  bad(validateAnswers(Q, { s: "x".repeat(5001) }));
  bad(validateAnswers(Q, { ...good, l: "x".repeat(5001) }));
  bad(validateAnswers(Q, { ...good, s: 5 }));
  bad(validateAnswers(Q, null));
  bad(validateAnswers(Q, { ...good, n: { choice: "other", other: "hi" } }));
  bad(validateAnswers(Q, { ...good, m: [{ other: "hi" }] }));
});

test("validateAnswers: Other only when allowed", () => {
  const r = validateAnswers(Q, { ...good, o: { choice: "other", other: " custom " } });
  assert.deepEqual(r, { answers: { s: "Uni High", o: { choice: "other", other: "custom" } } });
  bad(validateAnswers(Q, { ...good, o: { choice: "other", other: "x".repeat(5001) } }));
  const q2: Questionnaire = { intro: "", items: [{ ...Q.items[4], other: true }] };
  const r2 = validateAnswers(q2, { m: ["x", { other: "mine" }] });
  assert.deepEqual(r2, { answers: { m: ["x", { other: "mine" }] } });
  bad(validateAnswers(q2, { m: [{ other: "a" }, { other: "b" }] }));
});

test("validateAnswers: required many / one", () => {
  const q: Questionnaire = {
    intro: "",
    items: [{ ...Q.items[4], required: true }, { ...Q.items[3], id: "o2", required: true }],
  };
  bad(validateAnswers(q, { m: [], o2: "a" }));
  bad(validateAnswers(q, { m: ["x"] }));
  bad(validateAnswers(q, { m: ["x"], o2: { choice: "other", other: "  " } }));
  assert.ok("answers" in validateAnswers(q, { m: ["y"], o2: "a" }));
});

test("countRedFlags and flaggedAnswers", () => {
  assert.equal(countRedFlags(Q, { s: "a", o: "b", m: ["x", "y"] }), 2);
  assert.equal(countRedFlags(Q, { s: "a", o: "a", m: ["y"] }), 0);
  assert.equal(countRedFlags(Q, { s: "a", o: { choice: "other", other: "b" } }), 0);
  assert.deepEqual(flaggedAnswers(Q, { s: "a", o: "b", m: ["x", "y"] }), [
    { question: "Pick", answer: "B" },
    { question: "Many", answer: "X" },
  ]);
});

const HOUR = 3_600_000;
const NOW = Date.parse("2026-12-01T10:00:00.000Z");
const call = (startOffsetH: number, status = "scheduled", duration_minutes = 45) => ({
  status,
  scheduled_at: new Date(NOW + startOffsetH * HOUR).toISOString(),
  duration_minutes,
});

test("questionnaireOpen", () => {
  const open = (calls: ReturnType<typeof call>[], cancelledAt: string | null = null) =>
    questionnaireOpen({ cancelledAt, calls, now: NOW });
  assert.equal(open([]), true);
  assert.equal(open([], "2026-11-30T00:00:00.000Z"), false);
  assert.equal(open([call(-48, "cancelled")]), true);
  assert.equal(open([call(5)]), true);
  assert.equal(open([call(-2)]), false);
  assert.equal(open([call(-0.5)]), true); // started 30 min ago, 45 min long
  assert.equal(open([call(-0.75)]), false); // ends exactly now
  assert.equal(open([call(-48, "cancelled"), call(48)]), true); // reschedule reopens
  assert.equal(open([call(-48), call(-24, "cancelled")]), false);
  assert.equal(open([call(-48), call(24)]), true); // latest wins
  assert.equal(open([call(5, "cancelled")], "2026-11-30T00:00:00.000Z"), false);
});

test("questionnaireStatus", () => {
  const s = questionnaireStatus;
  assert.equal(s({ hasSnapshot: false, submittedAt: null, hasLiveBooking: true }), null);
  assert.equal(s({ hasSnapshot: false, submittedAt: "2026-12-01", hasLiveBooking: true }), null);
  assert.equal(s({ hasSnapshot: true, submittedAt: null, hasLiveBooking: false }), "none");
  assert.equal(s({ hasSnapshot: true, submittedAt: null, hasLiveBooking: true }), "waiting");
  assert.equal(s({ hasSnapshot: true, submittedAt: "2026-12-01", hasLiveBooking: false }), "submitted");
});
