import { Router, type Request, type Response } from "express";
import { timingSafeEqual } from "node:crypto";
import { getServiceClient } from "../lib/auth";
import {
  appUrl, escapeHtml, getResend, verifyAccountParentUnsubscribeToken, verifyParentConsentToken,
  verifyParentUnsubscribeToken, verifyUnsubscribeToken,
} from "../lib/email";
import { runAutomatedEmails } from "../lib/automated-emails";
import { runRecurringAssignments, type IssueSummary } from "../lib/recurring-assignments";
import { logger } from "../lib/logger";

const router = Router();

// ── Cron: send due automated emails ─────────────────────────────────────────
// Called every 15 minutes by .github/workflows/automated-emails.yml with
// `Authorization: Bearer $CRON_SECRET` (the same header Vercel Cron sends).
// ?dry_run=1 lists what would be sent without sending; ?max=N caps the run.
// A real run first sets the day's recurring assignments, so their emails go
// out in the same run.

function isCronCaller(req: Request): boolean {
  const secret = process.env.CRON_SECRET ?? "";
  const header = req.headers.authorization ?? "";
  if (!secret || !header.startsWith("Bearer ")) return false;
  const given = Buffer.from(header.slice(7));
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  return `${name.slice(0, 1)}***@${domain ?? ""}`;
}

async function handleCron(req: Request, res: Response) {
  if (!process.env.CRON_SECRET) {
    res.status(503).json({ error: "CRON_SECRET is not configured" });
    return;
  }
  if (!isCronCaller(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const dryRun = ["1", "true"].includes(String(req.query.dry_run ?? ""));
  const max = Number(req.query.max);
  let recurring: IssueSummary | { error: string } | undefined;
  if (!dryRun) {
    try {
      recurring = await runRecurringAssignments(getServiceClient());
    } catch (err) {
      logger.error({ err }, "recurring assignments: run failed");
      recurring = { error: err instanceof Error ? err.message : "Recurring assignments failed" };
    }
  }
  try {
    const summary = await runAutomatedEmails(getServiceClient(), getResend(), {
      dryRun,
      maxEmails: Number.isFinite(max) && max > 0 ? Math.floor(max) : undefined,
    });
    logger.info({ summary: { ...summary, planned: summary.planned?.length } }, "emails: cron run finished");
    // The response lands in GitHub Actions logs, so don't print addresses.
    res.json({ ...summary, planned: summary.planned?.map((p) => ({ ...p, to: maskEmail(p.to) })), recurring });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Email run failed";
    const summary = (err as { summary?: unknown }).summary;
    res.status(500).json({ error: message, ...(summary ? { summary } : {}), recurring });
  }
}

router.get("/cron/emails", handleCron);
router.post("/cron/emails", handleCron);

// ── Unsubscribe ─────────────────────────────────────────────────────────────
// GET shows a confirm button rather than unsubscribing straight away, because
// mail scanners open links. POST does the change; mail clients' one-click
// "Unsubscribe" button (List-Unsubscribe-Post) POSTs here too.

type PageForm = { action: string; label: string; path?: string } & Record<string, string>;

/** `body` is plain text, one string per paragraph. */
function page(res: Response, status: number, heading: string, body: string | string[], form?: PageForm, title = "Email preferences") {
  const query = form
    ? new URLSearchParams(Object.entries(form).filter(([k]) => !["action", "label", "path"].includes(k))).toString()
    : "";
  const formHtml = form
    ? `<form method="post" action="${escapeHtml(`${appUrl()}${form.path ?? "/api/email/unsubscribe"}?${query}`)}">
        <input type="hidden" name="action" value="${escapeHtml(form.action)}">
        <button type="submit">${escapeHtml(form.label)}</button>
      </form>`
    : "";
  res.status(status).type("html").send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} · gradefarm.</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#eef0f6;font-family:'Plus Jakarta Sans',Arial,sans-serif;color:#0c1037;padding:16px;box-sizing:border-box}
  .card{max-width:440px;width:100%;background:#fff;border:1px solid #e5e5ea;border-radius:14px;overflow:hidden}
  .top{background:#0c1037;padding:18px 28px;color:#f1be43;font-weight:900;font-size:20px;letter-spacing:-0.5px}
  .body{padding:28px}
  h1{margin:0 0 10px;font-size:20px}
  p{margin:0 0 20px;color:#4a5068;line-height:1.55;font-size:15px}
  button{background:#f1be43;color:#0c1037;border:0;border-radius:9px;padding:12px 22px;font-weight:800;font-size:15px;cursor:pointer;font-family:inherit}
  a{color:#4a5068}
</style></head>
<body><div class="card"><div class="top">gradefarm.</div><div class="body">
  <h1>${escapeHtml(heading)}</h1>
  ${(Array.isArray(body) ? body : [body]).map((p) => `<p>${escapeHtml(p)}</p>`).join("")}
  ${formHtml}
  <p style="margin:20px 0 0;font-size:13px"><a href="${escapeHtml(`${appUrl()}/home`)}">Go to gradefarm.</a></p>
</div></div></body></html>`);
}

function readToken(req: Request): { u: string; t: string } | null {
  const u = String(req.query.u ?? "");
  const t = String(req.query.t ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(u) || !t) return null;
  try {
    return verifyUnsubscribeToken(u, t) ? { u, t } : null;
  } catch {
    return null;
  }
}

router.get("/email/unsubscribe", (req: Request, res: Response) => {
  const tok = readToken(req);
  if (!tok) {
    page(res, 400, "Link not valid", "This unsubscribe link is incomplete or has expired. You can still change your email settings on the My Account page.");
    return;
  }
  page(res, 200, "Stop reminder emails?", "You'll stop getting session reminders and assignment due reminders. Emails your tutor sends you directly will still arrive.", {
    action: "unsubscribe", label: "Unsubscribe", ...tok,
  });
});

router.post("/email/unsubscribe", async (req: Request, res: Response) => {
  const tok = readToken(req);
  if (!tok) {
    page(res, 400, "Link not valid", "This unsubscribe link is incomplete or has expired. You can still change your email settings on the My Account page.");
    return;
  }
  const resubscribe = (req.body as { action?: string } | undefined)?.action === "resubscribe";
  try {
    const { error } = await getServiceClient()
      .from("profiles")
      .update({ emails_unsubscribed_at: resubscribe ? null : new Date().toISOString() })
      .eq("id", tok.u);
    if (error) throw error;
  } catch (err) {
    logger.error({ err }, "emails: unsubscribe failed");
    page(res, 500, "Something went wrong", "We couldn't update your email settings. Please try again in a minute.");
    return;
  }
  if (resubscribe) {
    page(res, 200, "You're subscribed again", "Session and assignment reminders are back on.");
  } else {
    page(res, 200, "You're unsubscribed", "You won't get reminder emails any more. Changed your mind?", {
      action: "resubscribe", label: "Turn reminders back on", ...tok,
    });
  }
});

// ── Parent progress reports ─────────────────────────────────────────────────
// The same confirm-then-POST flow for a parent's weekly report about a
// student (lib/parent-reports.ts). Stopping it is recorded on the roster row.

const PARENT_PATH = "/api/email/parent-unsubscribe";

// A link without a tutor (tu) is for the report from the student's own
// account, stopped on their profile instead of a roster row.
function readParentToken(req: Request): { tu?: string; st: string; t: string } | null {
  const tu = String(req.query.tu ?? "");
  const st = String(req.query.st ?? "");
  const t = String(req.query.t ?? "");
  const uuid = /^[0-9a-f-]{36}$/i;
  if (!uuid.test(st) || !t || (tu && !uuid.test(tu))) return null;
  try {
    if (!tu) return verifyAccountParentUnsubscribeToken(st, t) ? { st, t } : null;
    return verifyParentUnsubscribeToken(tu, st, t) ? { tu, st, t } : null;
  } catch {
    return null;
  }
}

router.get("/email/parent-unsubscribe", (req: Request, res: Response) => {
  const tok = readParentToken(req);
  if (!tok) {
    page(res, 400, "Link not valid", "This unsubscribe link is incomplete. You can also ask your child's tutor to stop the reports.");
    return;
  }
  page(res, 200, "Stop weekly progress reports?", tok.tu
    ? "You'll stop getting the weekly progress email from this tutor about this student."
    : "You'll stop getting the weekly progress email about this student.", {
    action: "unsubscribe", label: "Unsubscribe", path: PARENT_PATH, ...tok,
  });
});

router.post("/email/parent-unsubscribe", async (req: Request, res: Response) => {
  const tok = readParentToken(req);
  if (!tok) {
    page(res, 400, "Link not valid", "This unsubscribe link is incomplete. You can also ask your child's tutor to stop the reports.");
    return;
  }
  const resubscribe = (req.body as { action?: string } | undefined)?.action === "resubscribe";
  try {
    const stoppedAt = resubscribe ? null : new Date().toISOString();
    const { error } = tok.tu
      ? await getServiceClient().from("tutor_students").update({ parent_reports_stopped_at: stoppedAt })
        .eq("tutor_id", tok.tu).eq("student_id", tok.st)
      : await getServiceClient().from("profiles").update({ parent_reports_stopped_at: stoppedAt }).eq("id", tok.st);
    if (error) throw error;
  } catch (err) {
    logger.error({ err }, "emails: parent unsubscribe failed");
    page(res, 500, "Something went wrong", "We couldn't update your email settings. Please try again in a minute.");
    return;
  }
  if (resubscribe) {
    page(res, 200, "You're subscribed again", "Weekly progress reports are back on.");
  } else {
    page(res, 200, "You're unsubscribed", "You won't get weekly progress reports any more. Changed your mind?", {
      action: "resubscribe", label: "Turn reports back on", path: PARENT_PATH, ...tok,
    });
  }
});

// ── Parent consent ──────────────────────────────────────────────────────────
// A student under 15 gave us their parent's email; the parent confirms here
// (lib/parent-consent.ts). GET explains and asks, POST records it. The link is
// signed for the email it went to, so it stops working if the student changes
// the address.

const CONSENT_PATH = "/api/parent/consent";
const BAD_CONSENT_LINK = "This link is incomplete or out of date: the parent email on the account may have changed since it was sent. Ask your child to send it again from My Account in gradefarm.";

type ConsentProfile = { display_name: string | null; year_level: number | null; parent_email: string | null; parent_consent_at: string | null };

/** The student the link is for, or null (and the page sent) when it isn't valid. */
async function readConsentLink(req: Request, res: Response): Promise<{ s: string; t: string; profile: ConsentProfile } | null> {
  const s = String(req.query.s ?? "");
  const t = String(req.query.t ?? "");
  const bad = () => {
    page(res, 400, "Link not valid", BAD_CONSENT_LINK, undefined, "Confirm your child's account");
    return null;
  };
  if (!/^[0-9a-f-]{36}$/i.test(s) || !t) return bad();
  const { data: profile, error } = await getServiceClient()
    .from("profiles").select("display_name, year_level, parent_email, parent_consent_at").eq("id", s)
    .maybeSingle<ConsentProfile>();
  if (error) throw error;
  if (!profile?.parent_email) return bad();
  try {
    if (!verifyParentConsentToken(s, profile.parent_email, t)) return bad();
  } catch {
    return bad();
  }
  return { s, t, profile };
}

const childName = (p: ConsentProfile) => p.display_name?.trim() || "your child";
const firstName = (p: ConsentProfile) => childName(p).split(" ")[0];

function consentDone(res: Response, p: ConsentProfile, already: boolean) {
  page(res, 200, already ? `${firstName(p)}'s account is already confirmed` : `Thanks, ${firstName(p)}'s account is confirmed`, [
    "Titan AI and the other AI features are now switched on for them.",
    `Your first weekly progress email arrives on Sunday evening. To stop those, use the link at the bottom of any of them. To close ${firstName(p)}'s account, email support@titaniumtutoring.com.au.`,
  ], undefined, "Confirm your child's account");
}

router.get("/parent/consent", async (req: Request, res: Response) => {
  try {
    const link = await readConsentLink(req, res);
    if (!link) return;
    const { profile: p, s, t } = link;
    if (p.parent_consent_at) return consentDone(res, p, true);
    const who = `${childName(p)}${p.year_level ? ` (Year ${p.year_level})` : ""}`;
    page(res, 200, `Confirm ${firstName(p)}'s gradefarm account`, [
      `${who} gave us this email address as their parent or guardian. Because they're under 15, we ask you before switching on the AI features.`,
      `By confirming, you agree to ${firstName(p)} using gradefarm under our Terms of Service and Privacy Policy (${appUrl()}/terms and ${appUrl()}/privacy). That includes Titan AI, an AI tutor that explains their practice questions. What they type to Titan is sent to our AI provider, Anthropic, to write a reply. Titan is set up to stay on schoolwork, never to ask for personal details, and to point them to a trusted adult if they say they're worried about something.`,
      "You'll also get a short progress email every Sunday at this address. You can stop it any time.",
      "If you don't agree, you don't need to do anything. Practice questions keep working without the AI features.",
    ], { action: "confirm", label: "I'm their parent or guardian, and I agree", path: CONSENT_PATH, s, t }, "Confirm your child's account");
  } catch (err) {
    logger.error({ err }, "parent consent: page failed");
    page(res, 500, "Something went wrong", "Please try the link again in a minute.", undefined, "Confirm your child's account");
  }
});

router.post("/parent/consent", async (req: Request, res: Response) => {
  try {
    const link = await readConsentLink(req, res);
    if (!link) return;
    const { profile: p, s } = link;
    if (p.parent_consent_at) return consentDone(res, p, true);
    // Only while the email is still the one this link was signed for.
    const { error } = await getServiceClient().from("profiles")
      .update({ parent_consent_at: new Date().toISOString() })
      .eq("id", s).eq("parent_email", p.parent_email!).is("parent_consent_at", null);
    if (error) throw error;
    logger.info({ studentId: s }, "parent consent: confirmed");
    consentDone(res, p, false);
  } catch (err) {
    logger.error({ err }, "parent consent: confirm failed");
    page(res, 500, "Something went wrong", "We couldn't record that. Please try the link again in a minute.", undefined, "Confirm your child's account");
  }
});

export default router;
