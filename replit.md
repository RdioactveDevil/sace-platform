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
  - Students tab: add students by email (looked up server-side via service role), view/remove roster; "✉ Notify" button per student opens an inline email composer to send a custom message
  - Assignments tab: create Quiz/Test/Worksheet/Homework assignments with topics and due dates; auto-sends assignment notification email to each selected student on creation
  - Progress tab: per-student XP, accuracy, topic breakdown, recent activity
- **Assigned Tasks widget**: appears on student Home screen when they have pending tutor assignments
- **Assignment auto-completion**: assignments are marked complete when a student finishes a quiz session
- **Email notifications** (Resend): two API endpoints for tutor→student email
  - `POST /api/tutor/notify-assignment` — sends styled HTML assignment email (type, subject, topics, due date)
  - `POST /api/tutor/notify-student` — sends a custom message email from tutor to student

### Required Environment Variables
- `ANTHROPIC_API_KEY` — for AI chat/question generation features
- `SUPABASE_SERVICE_KEY` — for admin operations (question generation, PDF extraction)
- `RESEND_API_KEY` — for sending tutor→student email notifications (resend.com)
- Note: Resend Replit integration was dismissed by user; API key stored directly as a secret instead
- `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` / `LIVEKIT_URL` — live video sessions (LiveKit)
- Session auto-recording (LiveKit Egress → tutor-resources bucket) also needs:
  - `SUPABASE_S3_ACCESS_KEY_ID` / `SUPABASE_S3_SECRET_ACCESS_KEY` / `SUPABASE_S3_REGION` — Supabase Storage S3 access keys (Supabase dashboard → Storage → S3 connection)
  - `SUPABASE_S3_ENDPOINT` — optional; defaults to `<project>.supabase.co/storage/v1/s3`
  - LiveKit dashboard → Webhooks → point at `https://<app>/api/livekit/webhook` (the API verifies the signature with LIVEKIT_API_SECRET)

### Tutor Resources & Session Recordings
- **Resources tab** (`/tutor` → 📁 Resources): tutors upload notes/worksheets/slides/PDFs/images/video to the private `tutor-resources` Supabase Storage bucket, or paste external links (recordings on Zoom/Drive/Loom/YouTube). Each resource targets a single student, a class, or the whole roster, with optional Resend email notification. Students see a "Class Resources" card on Home (`fetchStudentResources`).
- **Large uploads**: files ≤6 MB use a standard upload; larger files (up to 5 GB) switch to resumable TUS uploads (`tus-js-client` → Supabase `/storage/v1/upload/resumable`) with a live progress bar. The bucket `file_size_limit` is 5 GB.
- **Auto-recording**: toggling "Record this session" sets `record_session` on the one-off session (or on the series + every generated occurrence). On the LiveKit `room_started` webhook the API picks the active/nearest occurrence for that room and starts a Room Composite Egress (MP4 → tutor-resources bucket); on `egress_ended` it publishes a `tutor_resources` row of type `recording` shared with the session's audience. Recurring series reuse one room, so the webhook selects the right occurrence per run. Recording status surfaces as a badge on the session card (Will record / Recording / Recorded / Failed).

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
