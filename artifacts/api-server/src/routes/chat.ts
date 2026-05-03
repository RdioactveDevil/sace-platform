import { Router } from "express";
import { logger } from "../lib/logger";

const router = Router();

router.post("/chat", async (req, res) => {
  try {
    const { messages, system, max_tokens } = req.body;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: max_tokens || 1000,
        system,
        messages,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      res.status(response.status).json({ error: err });
      return;
    }

    const data = await response.json();
    res.status(200).json(data);
  } catch (err) {
    logger.error({ err }, "Chat API error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
