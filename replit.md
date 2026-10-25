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
- Adaptive quiz system with streak tracking and XP. A new-questions session opens at `STARTING_DIFFICULTY` (2★, `src/lib/engine.js`) and then follows the student's level. Each answer is saved by one `record_answer()` RPC (answer log + struggle row + next review, migration `20261025000004_record_answer.sql`; the app falls back to direct writes until it's applied). `answer_log.selected` is the chosen option for an MCQ and null for other question types
- **XP & ranks** (`RANK_TIERS` in `src/lib/engine.js`, mirrored in the mobile `lib/engine.ts`): a right answer earns 12 × difficulty (up to 2× with an answer streak), a wrong one costs 12 × difficulty, and remediation only wins back a little of that, so XP builds up only when more answers are right than wrong. Ranks run Rookie → Bronze → Silver → Gold → Platinum → Diamond → Master → Grandmaster → Legend (50,000 XP); from Silver up each also needs a minimum recent accuracy (50% for Silver II rising to 85% for Legend). Recent accuracy is `profiles.recent_correct / recent_answers`, decayed counts weighted towards the last ~200 answers, kept up to date by `award_xp(p_xp_earned, p_new_streak, p_correct)`
- **Streaks**: `profiles.streak` / `best_streak` are day streaks in Adelaide time, worked out by `award_xp()` (its `p_new_streak` is ignored). A streak whose last active day is before yesterday has lapsed and shows as 0: `currentStreak()` in `src/lib/streak.js` (web) and `api-server/src/lib/streak.ts`, and the `leaderboard` view. The quiz's XP streak bonus is a separate run of right answers that starts at 0 each session
- Remediation mode: auto-generates similar questions when a student gets one wrong. It serves same-subtopic bank questions first, then stored `question_variants`, then asks the server for new ones (`api-server/src/routes/remediation.ts`): `POST /api/remediation/variants` returns them at once with a signed batch, and the app hands that batch to `POST /api/remediation/store` without waiting, which checks each answer key (`filterVerifiedQuestions`) and saves the ones that pass to `questions` and `question_variants`. Only the server writes those tables (migration `20261025000005_remediation_variants_server_side.sql`; apply it after deploying the app that uses these endpoints); the app counts a served variant with `bump_variant_usage()`
- AI-powered tutor (Titan AI) via Anthropic Claude (chat at `/api/chat`). Each message a student types (`purpose: "titan_chat"`) is also checked by a small classifier; one clearly about a different subject gets a redirect instead of an answer and is recorded in `off_topic_attempts` (migration `20261025000006_off_topic_attempts.sql`), which tutors see on the student's Progress tab. The app's hidden prompts (e.g. the opener from a quiz question) aren't checked
- **Titan AI bridge**: "Get Titan's Help" button in quiz post-answer panel sends the question straight to Titan AI: the full question, every option (correct one marked), what the student answered and whether it was right, the worked solution and any passage or table (`src/lib/questionHelp.js`). That stays in Titan's instructions for the whole chat, and Titan tutors it one step at a time (short hints and questions, no full working unless asked), covering the wrong options once the student has the right answer; after the AI responds, a "Consolidate — practice this topic" button starts a short round on that subtopic (or whole topic; it's only offered when the bank has questions for it, `src/lib/consolidation.js`): new questions until 3 right in a row or 8 questions, outside any assignment and with no remediation on a miss, then "Back to my quiz" restores the quiz the student was in where they left it, minus the remediation that was waiting on the question they asked Titan about (the round replaces it) (`captureQuiz`/`restoreQuiz` in `App.jsx`). Leaving the quiz mid-round restores it too
- Admin tools: AI question generation (`/api/generate-questions`; students' live top-ups count towards their daily AI allowance). It returns only the questions actually saved to the bank (a failed save is a 500, so the app never serves an unsaved question)
- **Exam-grade questions** (ids `ai_exam_…`): written by the strongest model (`CLAUDE_EXAM_MODEL`) and checked strictly: a question the answer checker (`CLAUDE_VERIFY_MODEL`, default `claude-sonnet-5-5`, override with `AI_VERIFY_MODEL`) can't confirm or disputes is dropped, never rewritten, and they're never saved below 4★. Added by the "Seed exam-grade questions" GitHub Action (`scripts/src/seed-hard-graph-questions.ts`), or, when a subject switches on `features.exam_grade_topups`, by a strong student's top-ups: 2 per request from a daily allowance (`features.exam_grade_daily_limit`, default 9) that counts only questions saved (`release_exam_grade_quota`, migration `20261025000007_release_exam_grade_quota.sql`), PDF extraction (`/api/extract-pdf`)
- Leaderboard, progress tracking, study plans
- Subject picker with subscription gating
- **Tutor Dashboard** (`/tutor`): 3-tab dashboard for users with `is_tutor=true` on their profile
  - **Tutor plans** (`api-server/src/lib/tutor-plan.ts`, `routes/tutor-billing.ts`, table `tutor_billing`, migration `20261025000009_tutor_billing.sql`): the tutor portal needs a paid plan, one of `platform_settings.pricing.tutor_plans` (`{ name, price: $/month, students }`, edited in Admin → Settings; 999 students = unlimited), billed monthly or yearly with `annual_discount` off, through Stripe (same customer as their student billing; the subscription carries `metadata.kind = 'tutor_plan'` and the shared webhook/`/billing/sync` record it in `tutor_billing`). Until then `/tutor` shows the plan picker (`components/TutorPlan.jsx`) and tutor endpoints answer 402 `tutor_plan_required`. A plan caps roster + pending invites (checked on `POST /tutor/invites`) at the limit it was bought with. The portal's Plan & billing tab changes plan or period (prorated) and opens the Stripe portal. Admins need no plan; Admin → Tutors → "Free tutor portal" exempts a tutor (every tutor from before plans existed starts exempt)
  - Students tab: **invite** students by email, view/remove roster; "✉ Notify" button per student opens an inline email composer to send a custom message
  - **Student invites** (`api-server/src/routes/invites.ts`, table `tutor_invites`): "Invite student" emails an invite link (`/invite/:token`, works for people without an account yet). The student accepts signed in with the invited address, and only then joins the tutor's roster (`tutor_students`), which opens the Lessons section of the Student Portal and lets the tutor see their progress. Pending invites also show as a card on the student's Home page; tutors can resend or cancel them from the Students tab. Invites expire 30 days after they were last sent. Deleting an account cancels the invites still waiting for its email address (trigger on `auth.users`, migration `20261025000003_cancel_invites_on_account_delete.sql`), so a new account with that address doesn't inherit them. Tutors can no longer insert roster rows from the browser (admin and class tools still link students through the service role)
  - **Included subjects** (`api-server/src/lib/included-subject.ts`, migration `20261025000000_tutor_included_subjects.sql`): a tutor with `profiles.can_include_subject` (turned on in Admin → Tutors; admins always can) picks the subjects they tutor a student in, on the invite (`tutor_invites.curriculum_ids`) or later via Edit on the roster. Each unlocks free and unlimited (`user_subscriptions.source = 'tutor'`, `sponsor_tutor_id` = the tutor), doesn't use up the student's own free subject, takes a paid subject off their Stripe plan, and is deleted by a trigger when the student leaves that tutor's roster. Signing up from an invite link pre-fills the email and accepts the invite automatically once the student is signed in (`lib/pendingInvite.js`; the confirmation email links back to `/invite/:token?accept=1`)
  - **Diagnostics on included subjects** (`api-server/src/lib/student-diagnostic.ts`, migration `20261025000001_student_diagnostics.sql`): each included subject comes with a 20-question diagnostic (`diagnostic_assessments` with `student_id`/`curriculum_id`, one per student and subject) covering the subtopics the tutor picked on the invite (`tutor_invites.diagnostic_subtopics`) or the whole curriculum. The questions are written on first use (`POST /api/diagnostic/:token/prepare`; the app starts it in the background as soon as it knows about one) and tagged with the curriculum's topic/subtopic names. Until it's done, practising that subject shows a "First, a quick check-in" screen (the portal stays open); the tutor can waive it, or set one, from Edit on the roster. The student sees a summary (strong at / work on) and a Home card that starts practice on the weakest subtopics; the tutor gets the full marked report in the Diagnostic tab. Leaving the tutor's roster drops their unfinished diagnostics
  - **Getting new students going**: "Invite student" takes one address or a pasted list (each gets the same subjects). On the roster, a student with a diagnostic waiting is tagged "Diagnostic to do" and one who hasn't answered a question yet "Hasn't practised yet" (`lib/rosterOnboarding.js`); the header counts them alongside pending invites, and the "Getting started" filter shows just them. The automated email job also sends: one reminder to an invitee who hasn't accepted after 3 days (`tutor_invites.reminded_at`, migration `20261025000002_invite_reminders.sql`; re-sending clears it), one reminder to a student whose diagnostic is still undone after 2 days, and the tutor an email with the score and topics to work on when a diagnostic is done
  - Assignments tab: create Quiz/Test/Worksheet/Homework assignments with topics, due dates, a number of questions to complete and a difficulty (Adaptive, Easy 1–2★, Medium 3★, Hard 4–5★) and an optional pass mark (either "keep going until they pass" or "one attempt: pass or fail"), and whether wrong answers get remediation or it runs as a straight quiz; auto-sends assignment notification email to each selected student on creation
  - Progress tab: per-student XP, accuracy, topic breakdown, recent activity
- **Student Portal** (`/portal`, `StudentPortalScreen.jsx`): unlocks once a student has a tutor (or a lesson). Sits apart from the study navigation, above Change Subject in the sidebar, with an unread-messages badge. Tabs: Overview · My Tutor · Messages · My Class · Lessons · Recordings · Resources. The first time it unlocks, a welcome dialog offers a spotlight tour (`PortalWelcome.jsx`, remembered per browser)
  - API: `api-server/src/routes/portal.ts` — `/portal/tutors`, `/portal/classes`, `/tutor/profile` (tutor's bio etc., table `tutor_profiles`, edited in Tutor portal → My Profile)
  - **Messages** (table `tutor_messages`): a conversation per tutor–student pair on the roster; `/messages/threads`, `/messages/:otherId`, `/messages/unread`. Tutors reply from Tutor portal → Messages. The recipient gets one email per batch of unread messages (none again until they've read it); the UI polls every 10–60 s
- **Assigned Tasks widget**: appears on student Home screen when they have pending tutor assignments
- **Assignment auto-completion**: assignments are marked complete once the student has answered the tutor's question count and, if a pass mark is set, scored at least that on their most recent question-count answers (each answer is recorded via `record_assignment_answer`, so progress carries across sessions); older assignments without a count complete when a quiz session ends
- **Assignment reports**: every answer toward an assignment is stored in `assignment_answers`. Tutors open a report from the Assignments or Progress tab (score, pass/fail, topic breakdown, each question with the student's answer, time taken, and an AI write-up of strengths, what went wrong, what could be better and next steps). The tutor is emailed with a link to the report when an assignment finishes (`POST /api/assignments/:id/finished`)
- **Email notifications** (Resend): two API endpoints for tutor→student email
  - `POST /api/tutor/notify-assignment` — sends styled HTML assignment email (type, subject, topics, due date)
  - `POST /api/tutor/notify-student` — sends a custom message email from tutor to student
- **Automated emails** (Resend): `POST /api/cron/emails` sends whatever is due, run every 15 min by the "Automated emails" GitHub Action (`.github/workflows/automated-emails.yml`)
  - Welcome email once a new account confirms its email (student or tutor version)
  - Session reminders ≈24h before (students; only for sessions booked ≥36h ahead) and ≈1h before (students + tutor)
  - Assignment reminders the day before it's due and the day after if still unfinished, one email per student listing them all, sent 8am–8pm Adelaide time
  - Every email is claimed in `email_log` (`claim_email()` RPC) before sending, so a late or repeated run never sends it twice; failed sends retry up to 3 times
  - Reminders carry an unsubscribe link (`/api/email/unsubscribe`, signed per user, plus one-click `List-Unsubscribe` headers) that sets `profiles.emails_unsubscribed_at`; students can also toggle "Email reminders" on My Account. Emails a tutor sends by hand are unaffected
  - Code: `api-server/src/lib/automated-emails.ts` (jobs), `lib/email.ts` (layout, sending, unsubscribe tokens), `routes/email.ts`

### Subjects & navigation
- Subjects are **database-driven**: each row in `curricula` (Admin → Curricula) becomes a picker tile via `curriculumToSubjectTile()` in `src/lib/subjects.js`. The only built-in tiles are the Writing feature.
- Questions link to their subject by `questions.curriculum_id` / `subtopic_id`, filled automatically by a DB trigger from the subject spelling. `select * from unlinked_question_subjects` lists anything that didn't match.
- Student sidebar has three sections — Practice, Learn, Progress — with tabs for their sub-pages (`NAV_SECTIONS` in `App.jsx`).
- Exam Mode, Essay Marker and Writing are **per-subject** tools, off by default; switch them on in Admin → Curricula → (subject) → Student features (`curricula.features`). Exam Mode builds a timed paper from that subject's own bank (`buildSubjectExam` in `src/lib/examEngine.js`). Writing (`features.writing` = a level such as `writing_y56`) adds a Writing section to that subject; there are no standalone Writing tiles any more.
- **Archive** (Admin → Curricula) hides a subject from students without deleting anything (`curricula.archived_at`). Delete is permanent.
- **Reading passages:** set a topic's style to "Reading passages" in the curriculum topic list and generation produces passage sets (one passage or poem + 5 questions, `passages` table, `questions.passage_id`). The quiz keeps a passage's questions together and shows the passage above each question; remediation is skipped for them. Shared generator: `api-server/src/lib/passages.ts`.
- API routes that call Claude or touch admin data require a Supabase JWT (`api-server/src/lib/auth.ts`); the web app attaches it to every `/api/*` call (`src/lib/apiAuth.ts`).

### Required Environment Variables
- `ANTHROPIC_API_KEY` — for AI chat/question generation features
- `SUPABASE_SERVICE_KEY` — for admin operations (question generation, PDF extraction)
- `RESEND_API_KEY` — for sending tutor→student email notifications (resend.com)
- `CRON_SECRET` — shared secret for `/api/cron/emails`; set the same value as the `CRON_SECRET` repo secret, and set repo variable `APP_URL` for the GitHub Action
- `EMAIL_FROM` — sender for every email the API sends (default `gradefarm. <notifications@gradefarm.com.au>`); its domain must be verified in Resend (DNS for gradefarm.com.au is at Crazy Domains)
- `APP_URL` — `https://www.gradefarm.com.au` (the www address: the bare domain redirects, which breaks one-click unsubscribe)
- `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` — student payments (`api-server/src/routes/billing.ts`). Use the live `sk_live_…` key and the signing secret of the live webhook endpoint `https://www.gradefarm.com.au/api/billing/webhook` (events: `checkout.session.completed`, `customer.subscription.*`). Students pay per subject on one plan, billed weekly ($7 / $6 / $5+, `pricing.student_tiers`) or monthly ($27 / $23 / $19+, `pricing.student_monthly_tiers`), chosen at checkout and switchable in My Account (`POST /api/billing/interval`); a running plan keeps the prices it started on. Each price is created in Stripe on first checkout; customers saved from another mode (e.g. the sandbox) are replaced automatically. Save the Customer portal settings once in live mode or "Manage billing" fails
- `EMAIL_UNSUBSCRIBE_SECRET` — optional key for signing unsubscribe links (defaults to the Supabase service key; changing it invalidates old links)
- Note: Resend Replit integration was dismissed by user; API key stored directly as a secret instead
- `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` / `LIVEKIT_URL` — live video sessions (LiveKit)
- Session auto-recording (LiveKit Egress → tutor-resources bucket) also needs:
  - `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` — Cloudflare R2 bucket for recordings (Cloudflare dashboard → R2 → Manage API tokens, Object Read & Write on that bucket). When set, recordings go to R2; otherwise they fall back to Supabase Storage, whose Free plan rejects files over 50 MB
  - `SUPABASE_S3_ACCESS_KEY_ID` / `SUPABASE_S3_SECRET_ACCESS_KEY` / `SUPABASE_S3_REGION` — Supabase Storage S3 access keys (Supabase dashboard → Storage → S3 connection)
  - `SUPABASE_S3_ENDPOINT` — optional; defaults to `<project>.supabase.co/storage/v1/s3`
  - LiveKit dashboard → Webhooks → point at `https://<app>/api/livekit/webhook` (the API verifies the signature with LIVEKIT_API_SECRET)

### Tutor Resources & Session Recordings
- **Resources tab** (`/tutor` → 📁 Resources): tutors upload notes/worksheets/slides/PDFs/images/video to the private `tutor-resources` Supabase Storage bucket, or paste external links (recordings on Zoom/Drive/Loom/YouTube). Each resource targets a single student, a class, or the whole roster, with optional Resend email notification. Students see a "Class Resources" card on Home (`fetchStudentResources`).
- **Large uploads**: files ≤6 MB use a standard upload; larger files (up to 5 GB) switch to resumable TUS uploads (`tus-js-client` → Supabase `/storage/v1/upload/resumable`) with a live progress bar. The bucket `file_size_limit` is 5 GB.
- **Recording during a lesson**: the tutor's Record / Stop rec button in the call (`POST /api/rooms/:roomName/recording`) starts or stops an egress for the occurrence happening now; stopping sets `recording_status = 'processing'` until the `egress_ended` webhook publishes it. Everyone in the call sees the REC badge and a toast when it starts or stops
- **Video backgrounds**: every participant can pick None, blur, a wallpaper (`public/backgrounds/`) or their own picture from the call's Background button (`call/BackgroundPicker.jsx`, `@livekit/track-processors`, loaded only when used). Remembered per browser
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
