/**
 * Single Vercel serverless entry: mounts the Express API under /api/*.
 * Build output: artifacts/api-server/dist/serverless.mjs (from `pnpm --filter @workspace/api-server run build`).
 */
import app from "../artifacts/api-server/dist/serverless.mjs";

export default app;
