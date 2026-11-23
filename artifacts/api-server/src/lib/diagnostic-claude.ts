import { CLAUDE_MODEL, CLAUDE_THINKING } from "./anthropic-model";
import { repairLatexJson } from "./json-latex";
import { logger } from "./logger";

/**
 * The diagnostic's plain Claude call and its forgiving JSON reader, shared by
 * question generation (routes/diagnostic.ts) and marking (lib/diagnostic-marking.ts).
 */

function getBaseUrl(): string {
  return process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL || "https://api.anthropic.com";
}

function getApiKey(): string {
  return process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || "";
}

export async function callClaude(system: string, user: string, maxTokens = 4000, jsonOnly = false): Promise<string> {
  // Claude Haiku 5.5 rejects assistant prefill, so ask for bare JSON in the
  // user turn instead; extractJson() still strips any fences or stray prose.
  const content = jsonOnly
    ? `${user}\n\nRespond with ONLY the JSON object, starting with { — no markdown fences or commentary.`
    : user;
  const messages = [{ role: "user", content }];

  const res = await fetch(`${getBaseUrl()}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": getApiKey(),
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      thinking: CLAUDE_THINKING,
      max_tokens: maxTokens,
      system,
      messages,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Claude API error: ${text.slice(0, 300)}`);
  }
  const data = (await res.json()) as { content?: { text: string }[]; stop_reason?: string };
  if (data?.stop_reason && data.stop_reason !== "end_turn") {
    logger.warn({ stop_reason: data.stop_reason, maxTokens }, "diagnostic: Claude response did not finish normally");
  }
  return data?.content?.[0]?.text || "";
}

/** JSON.parse that first re-escapes single-backslash LaTeX (\sqrt, \frac ...) the model writes inside strings. */
function parseLatexJson(text: string): unknown {
  for (const candidate of [repairLatexJson(text), text]) {
    try { return JSON.parse(candidate); } catch { /* try next */ }
  }
  throw new Error("unparseable JSON");
}

export function extractJson(text: string): unknown {
  try { return parseLatexJson(text); } catch { /* continue */ }
  // Strip markdown fences
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    try { return parseLatexJson(fenced[1].trim()); } catch { /* continue */ }
  }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try { return parseLatexJson(text.slice(start, end + 1)); } catch { /* continue */ }
  }
  const arrStart = text.indexOf("[");
  const arrEnd = text.lastIndexOf("]");
  if (arrStart !== -1 && arrEnd > arrStart) {
    try { return parseLatexJson(text.slice(arrStart, arrEnd + 1)); } catch { /* continue */ }
  }
  logger.warn({ length: text.length, head: text.slice(0, 300), tail: text.slice(-300) }, "diagnostic: could not parse Claude JSON");
  return null;
}
