import { Router } from "express";
import { createClient } from "@supabase/supabase-js";
import { CLAUDE_MODEL } from "../lib/anthropic-model";
import { logger } from "../lib/logger";

const router = Router();
const SUPABASE_URL = "https://pslpxawrfpcuwnupdfbs.supabase.co";

function getAdmin() {
  return createClient(
    SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  );
}

async function requireAdmin(req: any, res: any) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) { res.status(401).json({ error: "Unauthorized" }); return null; }
  const adminDb = getAdmin();
  const { data: caller } = await adminDb.auth.getUser(auth.slice(7));
  if (!caller?.user) { res.status(401).json({ error: "Invalid token" }); return null; }
  const { data: profile } = await adminDb.from("profiles").select("is_admin").eq("id", caller.user.id).single();
  if (!profile?.is_admin) { res.status(403).json({ error: "Forbidden" }); return null; }
  return { adminDb, userId: caller.user.id };
}

// ── AI verification ───────────────────────────────────────────────────────────

type Verdict = {
  verdict: "correct" | "wrong_answer" | "wrong_question";
  correct_index: number | null;
  explanation: string;
};

async function verifyQuestion(questionId: string): Promise<Verdict> {
  const adminDb = getAdmin();
  const { data: q } = await adminDb.from("questions").select("*").eq("id", questionId).single();
  if (!q) throw new Error(`Question ${questionId} not found`);

  const options: string[] = typeof q.options === "string" ? JSON.parse(q.options) : (q.options || []);
  const labels = ["A", "B", "C", "D"];
  const optText = options.map((o, i) => `${labels[i]}: ${o}`).join("\n");

  const baseUrl = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL || "https://api.anthropic.com";
  const apiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || "";

  const prompt = `You are a strict mathematical fact-checker reviewing a multiple-choice exam question.

Question: ${q.question}
Options:
${optText}
Currently marked correct: Option ${labels[q.answer_index]} — ${options[q.answer_index]}

Work out the correct answer step by step, then respond with ONLY valid JSON (no other text):

If the marked answer is correct:
{"verdict":"correct","correct_index":null,"explanation":"one sentence"}

If a different option is correct (use 0-based index):
{"verdict":"wrong_answer","correct_index":2,"explanation":"one sentence showing working"}

If no option is correct or the question is fundamentally flawed:
{"verdict":"wrong_question","correct_index":null,"explanation":"one sentence"}`;

  const resp = await fetch(`${baseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 512,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!resp.ok) throw new Error(`Anthropic API ${resp.status}`);
  const body = await resp.json();
  const text: string = (body.content?.[0]?.text ?? "").trim();
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`Non-JSON AI response: ${text.slice(0, 200)}`);
  return JSON.parse(match[0]) as Verdict;
}

async function getTopicCode(
  adminDb: ReturnType<typeof getAdmin>,
  subject: string,
  subtopicName: string,
): Promise<string | null> {
  const { data: curr } = await adminDb.from("curricula").select("id").eq("name", subject).maybeSingle();
  if (!curr?.id) return null;
  const { data: topics } = await adminDb
    .from("curriculum_topics").select("id").eq("curriculum_id", curr.id).order("order_index");
  if (!topics?.length) return null;
  for (let ti = 0; ti < topics.length; ti++) {
    const { data: subs } = await adminDb
      .from("curriculum_subtopics").select("name").eq("topic_id", topics[ti].id).order("order_index");
    if (!subs) continue;
    const si = subs.findIndex((s: any) => s.name.toLowerCase().trim() === subtopicName.toLowerCase().trim());
    if (si >= 0) return `T${ti + 1}.${si + 1}`;
  }
  return null;
}

async function resolveReport(reportId: string, questionId: string) {
  const adminDb = getAdmin();
  try {
    await adminDb.from("question_reports").update({ ai_status: "processing" }).eq("id", reportId);

    const verdict = await verifyQuestion(questionId);

    if (verdict.verdict === "correct") {
      await adminDb.from("question_reports").update({
        ai_status: "dismissed",
        ai_verdict: verdict,
        resolved_at: new Date().toISOString(),
        resolution_note: "AI confirmed the marked answer is correct",
      }).eq("id", reportId);
      return;
    }

    if (verdict.verdict === "wrong_answer" && verdict.correct_index != null) {
      await adminDb.from("questions").update({ answer_index: verdict.correct_index }).eq("id", questionId);
      await adminDb.from("question_reports").update({
        ai_status: "fixed_index",
        ai_verdict: verdict,
        resolved_at: new Date().toISOString(),
        resolution_note: `answer_index updated to ${verdict.correct_index}`,
      }).eq("id", reportId);
      return;
    }

    if (verdict.verdict === "wrong_question") {
      const { data: q } = await adminDb
        .from("questions").select("subject, topic, subtopic, difficulty").eq("id", questionId).single();

      if (q?.subject && q?.subtopic) {
        const topicCode = await getTopicCode(adminDb, q.subject, q.subtopic);
        if (topicCode) {
          await adminDb.from("questions").delete().eq("id", questionId);
          const port = process.env.PORT || 3001;
          const genRes = await fetch(`http://localhost:${port}/api/generate-questions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              subject: q.subject, topicCode, count: 1,
              difficulty: q.difficulty || 3, autoApprove: true,
            }),
          });
          const note = genRes.ok ? "Question deleted and 1 replacement generated" : "Question deleted; regeneration failed";
          await adminDb.from("question_reports").update({
            ai_status: "regenerated",
            ai_verdict: verdict,
            resolved_at: new Date().toISOString(),
            resolution_note: note,
          }).eq("id", reportId);
          return;
        }
      }

      // No topic code — delete only
      await adminDb.from("questions").delete().eq("id", questionId);
      await adminDb.from("question_reports").update({
        ai_status: "deleted",
        ai_verdict: verdict,
        resolved_at: new Date().toISOString(),
        resolution_note: "Question deleted; could not regenerate (topic code not found)",
      }).eq("id", reportId);
    }
  } catch (err) {
    logger.error({ err, reportId, questionId }, "[report-question] AI verification failed");
    await adminDb.from("question_reports").update({ ai_status: "error" }).eq("id", reportId).catch(() => {});
  }
}

// ── POST /api/report-question ─────────────────────────────────────────────────

router.post("/report-question", async (req, res) => {
  const { questionId } = req.body as { questionId?: string };
  if (!questionId) { res.status(400).json({ error: "questionId required" }); return; }

  const adminDb = getAdmin();
  const { data: report, error } = await adminDb
    .from("question_reports")
    .insert({ question_id: questionId, ai_status: "pending" })
    .select("id")
    .single();

  if (error || !report) {
    logger.error({ error }, "[report-question] insert failed");
    res.status(500).json({ error: "Failed to create report" });
    return;
  }

  res.status(200).json({ ok: true, reportId: report.id });
  setImmediate(() => resolveReport(report.id, questionId));
});

// ── POST /api/bulk-scan-questions (admin only) ────────────────────────────────

router.post("/bulk-scan-questions", async (req, res) => {
  const ctx = await requireAdmin(req, res);
  if (!ctx) return;
  const { adminDb, userId } = ctx;

  const { subject, limit = 50 } = req.body as { subject?: string; limit?: number };

  // Skip questions already being processed
  const { data: inFlight } = await adminDb
    .from("question_reports").select("question_id").in("ai_status", ["pending", "processing"]);
  const skipIds = (inFlight || []).map((r: any) => r.question_id);

  let query = adminDb.from("questions").select("id").limit(Math.min(Number(limit), 200));
  if (subject) query = (query as any).eq("subject", subject);
  if (skipIds.length) query = (query as any).not("id", "in", `(${skipIds.map((id: string) => `"${id}"`).join(",")})`);

  const { data: questions } = await query;
  if (!questions?.length) {
    res.status(200).json({ ok: true, queued: 0, message: "No questions to scan" });
    return;
  }

  const rows = questions.map((q: any) => ({ question_id: q.id, reported_by: userId, ai_status: "pending" }));
  const { data: reports, error } = await adminDb.from("question_reports").insert(rows).select("id, question_id");
  if (error) { res.status(500).json({ error: error.message }); return; }

  res.status(200).json({ ok: true, queued: reports?.length ?? 0 });

  setImmediate(async () => {
    for (const r of (reports || [])) {
      await resolveReport(r.id, r.question_id);
      await new Promise(resolve => setTimeout(resolve, 800));
    }
  });
});

// ── GET /api/question-reports (admin only) ────────────────────────────────────

router.get("/question-reports", async (req, res) => {
  const ctx = await requireAdmin(req, res);
  if (!ctx) return;
  const { adminDb } = ctx;

  const status = (req.query.status as string) || "all";
  let query = (adminDb as any)
    .from("question_reports")
    .select("*, questions(id, subject, topic, subtopic, question, options, answer_index, difficulty)")
    .order("reported_at", { ascending: false })
    .limit(200);

  if (status !== "all") query = query.eq("ai_status", status);

  const { data, error } = await query;
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(200).json({ reports: data || [] });
});

export default router;
