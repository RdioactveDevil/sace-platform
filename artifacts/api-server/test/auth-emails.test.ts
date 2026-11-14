import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AUTH_TEMPLATES, authTemplateHtml } from "../src/lib/auth-emails";

test("auth templates keep Supabase's placeholders intact", () => {
  for (const t of AUTH_TEMPLATES) {
    const html = authTemplateHtml(t);
    assert.ok(html.includes('href="{{ .ConfirmationURL }}"'), t.file);
    assert.ok(html.includes("{{ .Email }}"), t.file);
  }
  assert.ok(authTemplateHtml(AUTH_TEMPLATES.find((t) => t.file === "change-email.html")!).includes("{{ .NewEmail }}"));
});

test("supabase/templates matches the generator (run pnpm run auth-templates)", () => {
  const saved = process.env.APP_URL;
  delete process.env.APP_URL;
  try {
    for (const t of AUTH_TEMPLATES) {
      const file = readFileSync(new URL(`../../../supabase/templates/${t.file}`, import.meta.url), "utf8");
      assert.equal(file, authTemplateHtml(t) + "\n", `${t.file} is out of date`);
    }
  } finally {
    if (saved !== undefined) process.env.APP_URL = saved;
  }
});
