# AGENTS.md

## Cursor Cloud specific instructions

### Overview
SACE IQ ("gradefarm.") is a React 18 SPA (Create React App) for adaptive chemistry practice. It uses Supabase for auth/database and optionally Anthropic Claude for AI tutoring. No custom backend server — Supabase client SDK calls are made directly from the browser, and `/api/chat.js` is a Vercel serverless function for LLM proxying.

### Running the dev server
```
npm start          # CRA dev server on port 3000
```

### Building
```
npm run build      # production build into build/
```

### Tests
No automated test files exist in the codebase. `npm test` exits with code 1 (no tests found). Use `CI=true npm test -- --passWithNoTests` if you need a zero-exit check.

### Key caveats
- `.npmrc` has `legacy-peer-deps=true` — always use `npm install` (not `npm ci`) to respect this flag correctly.
- Supabase URL and anon key are **hardcoded** in `src/lib/supabase.js`, not in env vars. The existing values point to a live Supabase project.
- The Anthropic API key (`ANTHROPIC_API_KEY`) is only needed for the "Learn" AI tutor feature (served via `/api/chat.js`). Quiz, leaderboard, progress, and all core flows work without it.
- No ESLint or Prettier config is present in the repo; CRA's built-in ESLint runs during `npm start` and `npm run build`.
- The `postinstall` script runs `chmod +x node_modules/.bin/react-scripts` for compatibility.
