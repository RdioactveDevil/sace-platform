import { test } from "node:test";
import assert from "node:assert/strict";
import { consultationLinks } from "../src/lib/consultation-service.ts";
import { fakeSupabase } from "./fake-supabase";

const APP = "https://www.gradefarm.com.au";
const guest = "G".repeat(43);
const diag = (o: Record<string, unknown> = {}) => ({
  id: "d1", token: "tok_abc12345", questionnaire: { blocks: [] }, pre_call_form_url: null,
  has_test: true, status: "pending", cancelled_at: null, questionnaire_submitted_at: null, ...o,
});
const links = (rows: Record<string, unknown>[], call = { guest_token: guest, diagnostic_id: "d1" }) =>
  consultationLinks(fakeSupabase({ tables: { diagnostic_assessments: rows } }), call);

test("a call with a questionnaire and a test has all three links", async () => {
  assert.deepEqual(await links([diag()]), {
    call: `${APP}/call/${guest}`,
    questionnaire: { url: `${APP}/questionnaire/tok_abc12345`, done: false },
    test: { url: `${APP}/diagnostic/tok_abc12345`, done: false },
  });
});

test("finished steps are marked done", async () => {
  const r = await links([diag({ status: "completed", questionnaire_submitted_at: "2026-11-20T00:00:00Z" })]);
  assert.equal(r.questionnaire?.done, true);
  assert.equal(r.test?.done, true);
});

test("a record without a test, or with a cancelled one, has no test link", async () => {
  assert.equal((await links([diag({ has_test: false })])).test, null);
  assert.equal((await links([diag({ cancelled_at: "2026-11-20T00:00:00Z" })])).test, null);
});

test("the legacy form link is used when there's no built-in questionnaire", async () => {
  const r = await links([diag({ questionnaire: null, pre_call_form_url: "https://forms.example/q" })]);
  assert.deepEqual(r.questionnaire, { url: "https://forms.example/q", done: false });
  assert.equal((await links([diag({ questionnaire: null })])).questionnaire, null);
});

test("a call with no diagnostic record has only the call link", async () => {
  assert.deepEqual(await links([], { guest_token: guest, diagnostic_id: null }), {
    call: `${APP}/call/${guest}`, questionnaire: null, test: null,
  });
});

test("a call with no guest token has no call link", async () => {
  assert.equal((await links([diag()], { guest_token: null, diagnostic_id: "d1" })).call, null);
});
