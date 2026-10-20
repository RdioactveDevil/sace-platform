import { Router, type Request, type Response } from "express";
import { getServiceClient, isCronCaller } from "../lib/auth";
import { deleteExpiredRecordings } from "../lib/recording-retention";
import { logger } from "../lib/logger";

const router = Router();

// ── Cron: delete session recordings past their retention period ─────────────
// Called daily by .github/workflows/recording-cleanup.yml with
// `Authorization: Bearer $CRON_SECRET`. ?dry_run=1 counts what would be
// deleted without deleting; ?max=N caps the run.

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
    const summary = await deleteExpiredRecordings(getServiceClient(), {
      dryRun,
      max: Number.isFinite(max) && max > 0 ? Math.floor(max) : undefined,
    });
    logger.info({ summary }, "recordings: cleanup run finished");
    res.status(summary.failed.length > 0 ? 500 : 200).json(summary);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Cleanup failed" });
  }
}

router.get("/cron/recordings", handleCron);
router.post("/cron/recordings", handleCron);

export default router;
