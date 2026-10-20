import { Router, type Request, type Response } from "express";
import { timingSafeEqual } from "node:crypto";
import { getServiceClient } from "../lib/auth";
import { appUrl, escapeHtml, getResend, verifyUnsubscribeToken } from "../lib/email";
import { runAutomatedEmails } from "../lib/automated-emails";
import { logger } from "../lib/logger";

const router = Router();

// ── Cron: send due automated emails ─────────────────────────────────────────
// Called every 15 minutes by .github/workflows/automated-emails.yml with
// `Authorization: Bearer $CRON_SECRET` (the same header Vercel Cron sends).
// ?dry_run=1 lists what would be sent without sending; ?max=N caps the run.

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
  try {
    const summary = await runAutomatedEmails(getServiceClient(), getResend(), {
      dryRun,
      maxEmails: Number.isFinite(max) && max > 0 ? Math.floor(max) : undefined,
    });
    logger.info({ summary: { ...summary, planned: summary.planned?.length } }, "emails: cron run finished");
    // The response lands in GitHub Actions logs, so don't print addresses.
    res.json({ ...summary, planned: summary.planned?.map((p) => ({ ...p, to: maskEmail(p.to) })) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Email run failed";
    const summary = (err as { summary?: unknown }).summary;
    res.status(500).json({ error: message, ...(summary ? { summary } : {}) });
  }
}

router.get("/cron/emails", handleCron);
router.post("/cron/emails", handleCron);

// ── Unsubscribe ─────────────────────────────────────────────────────────────
// GET shows a confirm button rather than unsubscribing straight away, because
// mail scanners open links. POST does the change; mail clients' one-click
// "Unsubscribe" button (List-Unsubscribe-Post) POSTs here too.

function page(res: Response, status: number, heading: string, body: string, form?: { action: string; label: string; u: string; t: string }) {
  const formHtml = form
    ? `<form method="post" action="${escapeHtml(`${appUrl()}/api/email/unsubscribe`)}?u=${encodeURIComponent(form.u)}&t=${encodeURIComponent(form.t)}">
        <input type="hidden" name="action" value="${escapeHtml(form.action)}">
        <button type="submit">${escapeHtml(form.label)}</button>
      </form>`
    : "";
  res.status(status).type("html").send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Email preferences · gradefarm.</title>
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
  <p>${escapeHtml(body)}</p>
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

export default router;
