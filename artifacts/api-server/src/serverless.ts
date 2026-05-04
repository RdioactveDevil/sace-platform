/**
 * Express app only — bundled for Vercel serverless (see /api/index.mjs).
 * The long-running `index.ts` entry is for Replit / `node dist/index.mjs`.
 */
import app from "./app";

export default app;
