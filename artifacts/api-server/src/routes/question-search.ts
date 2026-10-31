import { Router } from "express";
import { CLAUDE_MODEL, CLAUDE_THINKING } from "../lib/anthropic-model";
import { logger } from "../lib/logger";
import { requireAdmin } from "../lib/auth";
import { keywordsFor, scoreQuestion } from "../lib/question-match";

// Finding a question from what a student sent: pasted text or a photo of it.

const router = Router();

function getBaseUrl(): string {
  return process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL || "https://api.anthropic.com";
}
function getApiKey(): string {
  return process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || "";
}

// GET /api/admin/questions/search?q=…&subject=… (admin only)
// The student's wording rarely matches the bank exactly (maths written
// differently, typos, a cropped sentence), so this looks for questions that
// share the most distinctive words, ranked by how many they share.
router.get("/admin/questions/search", async (req, res) => {
  const caller = await requireAdmin(req, res);
  if (!caller) return;
  const { admin } = caller;
  const q = String(req.query.q || "").slice(0, 2000);
  const subject = String(req.query.subject || "").trim();
  const words = keywordsFor(q);
  const idLike = /^[\w.-]{3,80}$/.test(q.trim()) ? q.trim() : null;
  if (!words.length && !idLike) return res.json({ questions: [] });

  const ors = words.map(w => `question.ilike.%${w}%`);
  if (idLike) ors.push(`id.ilike.%${idLike}%`);
  let query = admin.from("questions")
    .select("id, subject, topic, subtopic, question, options, answer_index, solution, difficulty")
    .or(ors.join(","))
    .limit(400);
  if (subject) query = query.eq("subject", subject);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  const ranked = (data || [])
    .map(row => ({ ...row, score: scoreQuestion(row, q, words) + (idLike && row.id === idLike ? 100 : 0) }))
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 40);
  return res.json({ questions: ranked, words });
});

// POST /api/admin/questions/transcribe (admin only)
// Body: { imageBase64, mediaType }. Reads the question out of a photo or
// screenshot a student sent, so it can be searched for.
router.post("/admin/questions/transcribe", async (req, res) => {
  const caller = await requireAdmin(req, res);
  if (!caller) return;
  const { imageBase64, mediaType } = (req.body || {}) as { imageBase64?: string; mediaType?: string };
  if (!imageBase64 || !/^image\/(png|jpeg|webp|gif)$/.test(mediaType || "")) {
    return res.status(400).json({ error: "Send a PNG, JPEG, WebP or GIF image" });
  }
  if (imageBase64.length > 7_000_000) return res.status(400).json({ error: "That image is too big (5 MB at most)" });

  try {
    const resp = await fetch(`${getBaseUrl()}/v1/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": getApiKey(), "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        thinking: CLAUDE_THINKING,
        max_tokens: 1200,
        system: "You read photos and screenshots of quiz questions. Write out the question exactly as shown, then each answer option on its own line. Write maths as plain text (x^2, 1/2, sqrt(3)). Reply with only the transcription. If there is no question in the image, reply with nothing.",
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
            { type: "text", text: "Transcribe the question in this image." },
          ],
        }],
      }),
    });
    if (!resp.ok) {
      logger.error({ status: resp.status, body: (await resp.text()).slice(0, 300) }, "[question-search] transcribe failed");
      return res.status(502).json({ error: "Couldn't read the image just now. Try again, or type a few words instead." });
    }
    const data = (await resp.json()) as { content?: { type: string; text?: string }[] };
    const text = (data.content || []).filter(c => c.type === "text").map(c => c.text || "").join("\n").trim();
    return res.json({ text });
  } catch (err) {
    logger.error({ err }, "[question-search] transcribe failed");
    return res.status(502).json({ error: "Couldn't reach the AI. Try again, or type a few words instead." });
  }
});

export default router;
