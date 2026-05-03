# Workspace

## Overview

pnpm workspace monorepo using TypeScript. This is the **gradefarm.** adaptive SACE study platform by Titanium Tutoring.

## Application

**gradefarm.** — An adaptive SACE (South Australian Certificate of Education) Chemistry study platform.

- **Frontend**: React + Vite app at `artifacts/gradefarm/` (preview path: `/`)
- **Backend**: Express API server at `artifacts/api-server/` (preview path: `/api`)
- **Mobile App**: Expo React Native app at `artifacts/gradefarm-mobile/` (preview path: `/mobile/`)
- **Auth & Data**: Supabase (external) — project `pslpxawrfpcuwnupdfbs.supabase.co`

### Key Features
- Supabase auth (login/signup)
- Adaptive quiz system with streak tracking and XP
- Remediation mode: auto-generates similar questions when a student gets one wrong
- AI-powered tutor (Titan AI) via Anthropic Claude (chat at `/api/chat`)
- **Titan AI bridge**: "🎓 Titan AI" button in quiz post-answer panel sends the question straight to Titan AI with a primed opening message; after the AI responds, a "Consolidate — Practice this topic" button appears to loop back to filtered quiz practice
- Admin tools: AI question generation (`/api/generate-questions`), PDF extraction (`/api/extract-pdf`)
- Leaderboard, progress tracking, study plans
- Subject picker with subscription gating
- **Tutor Dashboard** (`/tutor`): 3-tab dashboard for users with `is_tutor=true` on their profile
  - Students tab: add students by email (looked up server-side via service role), view/remove roster
  - Assignments tab: create Quiz/Test/Worksheet/Homework assignments with topics and due dates
  - Progress tab: per-student XP, accuracy, topic breakdown, recent activity
- **Assigned Tasks widget**: appears on student Home screen when they have pending tutor assignments
- **Assignment auto-completion**: assignments are marked complete when a student finishes a quiz session

### Required Environment Variables
- `ANTHROPIC_API_KEY` — for AI chat/question generation features
- `SUPABASE_SERVICE_KEY` — for admin operations (question generation, PDF extraction)

### Custom Assets
- `artifacts/gradefarm/public/SIFONN_PRO.otf` — custom Sifonn Pro font used for the brand logo

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM (not used yet; Supabase used for all data)
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Frontend**: React + Vite, React Router v6, Tailwind CSS v4
- **External**: Supabase (auth + database), Anthropic Claude (AI)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
