# Consultation Booking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A prospect who finishes a link diagnostic books a 45-minute consultation call from the tutor's open times (or the tutor books it), everyone gets calendar invites and reminders at the tutor's chosen times, and the call runs in the app's video room with a guest link.

**Architecture:** A consultation is a `tutoring_sessions` row (`session_type = 'consultation'`) linked to the diagnostic, with guest fields. Pure, tested modules compute open times, read busy times from an iCal feed, build .ics invites and email copy. Booking is atomic in a Postgres function. New routes live in `routes/consultations.ts`; the 15-minute email job sends reminders. UI reuses the existing tutor-portal and AuthLayout styles.

**Tech Stack:** Express + TypeScript (`tsx --test`), Supabase Postgres (plpgsql), Resend, `node-ical` (iCal parsing incl. RRULE), LiveKit (`livekit-server-sdk` AccessToken), React/Vite (`node --test` for `src/lib`).

**Spec:** `docs/superpowers/specs/2026-11-21-consultation-booking-design.md`

## Global Constraints

- Defaults: time zone `Australia/Adelaide`, call 45 min, gap 15 min, earliest 12 h, furthest 14 days, reminders `{1440, 60}` minutes.
- Never call the tutor the prospect's tutor in anything a prospect or parent sees; name them in full (`profiles.display_name`, trimmed; fallback `gradefarm.`).
- Every consultation email to a prospect or parent has Reply-To = the tutor's sign-in email.
- Emailed links use `appUrl()` (never request headers).
- Prospects see times in their browser's zone; emails to prospects/parents state the zone they're shown in (the prospect's zone, captured at booking; tutor-made bookings use the tutor's zone).
- Only the tutor (by account) and the guest (by token) can join a consultation room; the "no participants = open to anyone" rule never applies to consultations.
- Existing lessons, series and their reminders must behave exactly as before.
- UI: reuse existing tokens and patterns — `THEMES`, `FONT_B`, `card` / `sectionHdr` / `inputStyle` / `labelStyle` (TutorScreen.jsx `DiagnosticTab`), `SegmentedToggle`, `confirmDialog`, and on public pages `AuthLayout`, `Panel`, `H1`, `P`, `btnStyle`, `af-btn` / `af-inp` (DiagnosticScreen.jsx). No new colours or fonts.

## Review Focus

- Two prospects booking the same slot at once: exactly one succeeds; the other gets 409 with fresh slots (Task 1 SQL test on `book_consultation`).
- Daylight-saving weeks (Adelaide changes 2027-04-04 and 2027-10-03): weekly hours stay at the same local wall-clock times (Task 2 tests).
- A Google Calendar feed that is slow, huge, not https, or malformed: open times still appear from weekly hours and the error is recorded, never a 500 to the prospect (Task 3 tests + Task 6 route step).
- A guest token used for a different session, outside the join window, or after cancellation gets no LiveKit token (Task 6 tests on `guestJoinAllowed`).
- A booking made 30 minutes before the call doesn't send a "1 day before" reminder; rescheduling resets which reminders are sent (Task 7 tests on `dueConsultationReminders`).

---

### Task 1: Database

**Files:**
- Create: `supabase/migrations/20261121000003_consultation_booking.sql`
- Create: `supabase/tests/consultation-booking.sql`

**Interfaces:**
- Produces (exact names later tasks use):
  - Table `public.tutor_booking_settings` (`tutor_id uuid pk → profiles on delete cascade`, `time_zone text not null default 'Australia/Adelaide'`, `weekly_hours jsonb not null default '{}'`, `call_minutes int not null default 45`, `gap_minutes int not null default 15`, `min_notice_hours int not null default 12`, `max_days_ahead int not null default 14`, `reminder_minutes int[] not null default '{1440,60}'`, `busy_ical_url text`, `busy_ical_checked_at timestamptz`, `busy_ical_error text`, `invite_email text`, `updated_at timestamptz default now()`). RLS on; no policies (server-only).
  - `tutoring_sessions` adds `diagnostic_id uuid references diagnostic_assessments(id) on delete set null`, `guest_email text`, `guest_name text`, `guest_parent_email text`, `guest_time_zone text`, `guest_token text unique`, `reminder_minutes int[]`, `ics_sequence int not null default 0`; `session_type` check allows `'consultation'`.
  - Index `tutoring_sessions_one_live_consultation` unique on `(tutor_id, lower(guest_email)) where session_type = 'consultation' and status = 'scheduled'`.
  - Table `public.consultation_reminders_sent (session_id uuid → tutoring_sessions on delete cascade, minutes int, recipient text check in ('guest','parent','tutor'), sent_at timestamptz default now(), primary key (session_id, minutes, recipient))`. RLS on.
  - `diagnostic_assessments` adds `parent_email text`, `booking_reminded_at timestamptz`.
  - Function `public.book_consultation(p_tutor_id uuid, p_start timestamptz, p_minutes int, p_gap int, p_room text, p_title text, p_diagnostic_id uuid, p_guest_email text, p_guest_name text, p_guest_parent_email text, p_guest_time_zone text, p_guest_token text, p_reminders int[], p_exclude_session uuid default null) returns uuid` — `security definer`, `set search_path = public`; takes `pg_advisory_xact_lock(hashtext('consultation:' || p_tutor_id))`; raises `'slot_taken'` (errcode `P0001`) if any of the tutor's sessions with status in ('scheduled','active') other than `p_exclude_session` overlaps `[p_start - p_gap, p_start + p_minutes + p_gap)`; inserts the row (`session_type 'consultation'`, `status 'scheduled'`, `record_session false`) and returns its id. Execute revoked from `public, anon, authenticated`.
  - Function `public.reschedule_consultation(p_session uuid, p_start timestamptz, p_minutes int, p_gap int, p_reminders int[]) returns void` — same lock and overlap check (excluding itself), updates `scheduled_at`, `reminder_minutes`, `ics_sequence = ics_sequence + 1`, deletes that session's `consultation_reminders_sent`. Same grants.

- [ ] **Step 1: Write the SQL test** (`supabase/tests/consultation-booking.sql`, same style as `link-diagnostics-survive-curriculum-delete.sql`: stub `profiles(id)`, `diagnostic_assessments(id)`, `tutoring_sessions` with the existing columns and check constraints from production — id, tutor_id, student_id, scheduled_at, duration_minutes, livekit_room_name unique, title, status check, session_type check (`individual`,`group`), record_session, created_at — then `\i :migration`). Assertions, each raising `FAIL: …`:
  - booking 10:00–10:45 succeeds; a second at 10:30 raises `slot_taken`; one at 11:00 (exactly the gap after) succeeds; one at 10:50 raises.
  - an existing `individual` lesson at 14:00–15:00 blocks a consultation at 15:05.
  - a second live booking for the same tutor and same email (different case) violates `tutoring_sessions_one_live_consultation`; after setting the first to `completed`, a new one succeeds.
  - `reschedule_consultation` to a free time bumps `ics_sequence` to 1 and clears its reminder rows; to an overlapping time raises `slot_taken`.
  - the migration applies twice without error.
- [ ] **Step 2: Run it against a scratch Postgres 16 with an empty migration file** → FAIL. (`/usr/lib/postgresql/16/bin`, as for migration 20261121000001; cluster under `/var/tmp`, run as `postgres`.)
- [ ] **Step 3: Write the migration.**
- [ ] **Step 4: Run the test with the migration** → `NOTICE: PASS`.
- [ ] **Step 5: Commit** — `git add supabase/migrations/20261121000003_consultation_booking.sql supabase/tests/consultation-booking.sql && git commit -m "Consultation booking: settings, guest fields, atomic booking"`

### Task 2: Open times

**Files:**
- Create: `artifacts/api-server/src/lib/booking-slots.ts`
- Test: `artifacts/api-server/test/booking-slots.test.ts`

**Interfaces:**
- Produces:
  - `type WeeklyHours = Partial<Record<"mon"|"tue"|"wed"|"thu"|"fri"|"sat"|"sun", Array<[string, string]>>>`
  - `type BookingSettings = { timeZone: string; weeklyHours: WeeklyHours; callMinutes: number; gapMinutes: number; minNoticeHours: number; maxDaysAhead: number }`
  - `type Interval = { start: number; end: number }` (epoch ms)
  - `zonedToUtc(ymd: string, hhmm: string, timeZone: string): number` — wall-clock time in a zone → epoch ms (via `Intl.DateTimeFormat` offset lookup, correct on DST days).
  - `openSlots(o: { settings: BookingSettings; now: number; busy: Interval[]; existing: Interval[] }): string[]` — ISO UTC starts, ascending.
  - `validateWeeklyHours(h: unknown, callMinutes: number): { hours: WeeklyHours } | { error: string }` — `HH:MM` 24h, start < end, blocks per day non-overlapping, each ≥ callMinutes.
  - `DEFAULT_BOOKING: BookingSettings` with Global Constraints defaults and `weeklyHours: {}`.

- [ ] **Step 1: Failing tests** (fixed `now`; Adelaide):
  - Mon block 09:00–12:00, 45+15 → starts 09:00, 10:00, 11:00 (11:00 fits: ends 11:45).
  - Block 09:00–10:30 → only 09:00.
  - `minNoticeHours` 12 drops slots before now+12h; `maxDaysAhead` 14 drops slots beyond now+14 days.
  - A busy interval 10:20–10:40 removes 10:00 (call 10:00–10:45 overlaps) but keeps 11:00; an existing session 11:50–12:30 removes 11:00 (gap: 11:45+15 = 12:00 > 11:50).
  - A busy interval ending exactly at 10:00 − 0 keeps 10:00 only if it ends ≤ 09:45 … — specifically: existing session ending 09:45 keeps 10:00 (gap 15 satisfied); ending 09:50 removes it.
  - DST: weekly Monday 09:00 Adelaide maps to 22:30Z (Sunday) on 2027-03-29 (ACDT, +10:30) and 23:30Z on 2027-04-05 (ACST, +9:30).
  - `zonedToUtc("2027-10-03","02:30","Australia/Adelaide")` (a non-existent local time) returns a time and doesn't throw.
  - Empty weekly hours → `[]`.
  - `validateWeeklyHours`: rejects `"9:00"`, `["12:00","09:00"]`, overlapping blocks, a 30-min block with callMinutes 45, unknown day keys; accepts the Monday example.
- [ ] **Step 2: Run** `cd artifacts/api-server && npx tsx --test test/booking-slots.test.ts` → FAIL (module not found).
- [ ] **Step 3: Implement.** Grid per block: `blockStart + k*(call+gap)`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `"Consultation booking: open times from weekly hours"`

### Task 3: Busy times from the tutor's calendar

**Files:**
- Modify: `artifacts/api-server/package.json` (add `node-ical`, current release `^0.27`)
- Create: `artifacts/api-server/src/lib/busy-calendar.ts`
- Test: `artifacts/api-server/test/busy-calendar.test.ts` (fixture as a string in the test)

**Interfaces:**
- Consumes: `Interval`, `zonedToUtc` (Task 2).
- Produces:
  - `parseBusy(ics: string, from: number, to: number, timeZone: string): Interval[]`
  - `checkIcalUrl(raw: unknown): { url: string | null } | { error: string }` — empty → null; must be `https:`, ≤ 2000 chars, a valid URL.
  - `fetchBusy(url: string, from: number, to: number, timeZone: string, fetchImpl = fetch): Promise<{ busy: Interval[] } | { error: string }>` — 5 s timeout (AbortController), rejects bodies > 5 MB, 5-minute in-memory cache keyed by url+window; never throws.

- [ ] **Step 1: Failing tests:**
  - A one-off event 10:00–11:00Z → one interval.
  - Weekly RRULE with one EXDATE → every week but the excluded date, within the window only.
  - A RECURRENCE-ID override moving one instance → the moved time, not the original.
  - `TRANSP:TRANSPARENT` and `STATUS:CANCELLED` events → ignored.
  - All-day `DTSTART;VALUE=DATE:20271101` → busy from 00:00 to 24:00 Adelaide that day.
  - Garbage text → `[]`, no throw.
  - `checkIcalUrl`: `http://…` → error; `""` → `{ url: null }`; Google's `https://calendar.google.com/calendar/ical/x/private-y/basic.ics` → ok.
  - `fetchBusy` with a fake fetch that never resolves → `{ error }` after the timeout (use a 50 ms timeout parameter in the test); with a 6 MB body → `{ error }`; second call within 5 minutes doesn't call fetch again.
- [ ] **Step 2: Run** `npx tsx --test test/busy-calendar.test.ts` → FAIL.
- [ ] **Step 3: Install and implement.** `pnpm --filter @workspace/api-server add node-ical@^0.27`. Use `node-ical`'s `sync.parseICS` and expand RRULEs over `[from, to]`; give `fetchBusy` an optional `timeoutMs` parameter (default 5000).
- [ ] **Step 4: Run** → PASS; `pnpm test` whole suite green.
- [ ] **Step 5: Commit** (include `pnpm-lock.yaml`) — `"Consultation booking: busy times from a calendar's iCal address"`

### Task 4: Calendar invites and email attachments

**Files:**
- Create: `artifacts/api-server/src/lib/consultation-ics.ts`
- Modify: `artifacts/api-server/src/lib/email.ts` (`OutgoingEmail` gains `replyTo?: string; attachments?: Array<{ filename: string; content: string; contentType?: string }>`, passed to `resend.emails.send` as `replyTo` and `attachments` with base64 content)
- Test: `artifacts/api-server/test/consultation-ics.test.ts`, `artifacts/api-server/test/tutor-emails.test.ts` (add a sendEmail test)

**Interfaces:**
- Produces: `consultationIcs(o: { uid: string; sequence: number; method: "REQUEST" | "CANCEL"; start: number; minutes: number; summary: string; description: string; url: string; organizerName: string; organizerEmail: string; attendees: Array<{ name?: string; email: string }>; now?: number }): string`

- [ ] **Step 1: Failing tests:**
  - Lines end `\r\n`; no line longer than 75 octets (folded with `\r\n ` continuation).
  - `DTSTART`/`DTEND` in UTC basic format (`20271101T003000Z`), `DTEND` = start + minutes.
  - `METHOD:REQUEST` + `STATUS:CONFIRMED`; `METHOD:CANCEL` + `STATUS:CANCELLED`; `SEQUENCE` echoes; `UID` echoes.
  - Commas, semicolons, backslashes and newlines in summary/description are escaped (`\,` `\;` `\\` `\n`).
  - One `ATTENDEE` line per attendee with `RSVP=TRUE`.
  - `sendEmail` passes `replyTo` and a base64 attachment through to the fake `resend.emails.send` payload.
- [ ] **Step 2: Run** both test files → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS; whole suite green.
- [ ] **Step 5: Commit** — `"Calendar invites (.ics) and email attachments / reply-to"`

### Task 5: Consultation email copy

**Files:**
- Create: `artifacts/api-server/src/lib/consultation-emails.ts`
- Test: `artifacts/api-server/test/consultation-emails.test.ts`

**Interfaces:**
- Consumes: `EmailContent` (email.ts), `prospectSenderName` (prospect-emails.ts).
- Produces (each `{ subject: string; content: EmailContent }`):
  - `formatCallTime(startIso: string, timeZone: string): string` — e.g. `"Tuesday 3 November, 4:30 pm (Adelaide time)"`; the city is the part after `/` in the zone, `_` → space.
  - `consultationBookedEmail(o: { to: "guest" | "parent" | "tutor"; tutorName: string; studentName: string; start: string; timeZone: string; minutes: number; joinUrl: string; questionnaireUrl?: string | null; reportUrl?: string })`
  - `consultationChangedEmail(o: same + { previousStart: string })`, `consultationCancelledEmail(o: { to; tutorName; studentName; start; timeZone })`
  - `consultationReminderEmail(o: { to; tutorName; studentName; start; timeZone; minutes; joinUrl; lead: number /* minutes before */ })`
  - `bookYourCallEmail(o: { tutorName: string; subject: string; bookUrl: string })`

- [ ] **Step 1: Failing tests:**
  - `formatCallTime("2027-11-02T06:00:00Z","Australia/Melbourne")` → `"Tuesday 2 November, 5:00 pm (Melbourne time)"`.
  - Guest and parent versions never match `/your tutor/i`; they name the tutor in full; the parent version names the student ("Sam's consultation call with Sam Tutor").
  - Guest booked email includes the join URL as the CTA and, when given, a paragraph with the questionnaire URL; without it, no questionnaire paragraph.
  - Tutor version links the report and says who and when in the tutor's zone.
  - Reminder subject for `lead` 1440 says "tomorrow", for 60 says "in 1 hour", for other values "in N hours/days".
  - `bookYourCallEmail` CTA is `bookUrl`; footer says it's the only reminder.
- [ ] **Step 2–4:** run → FAIL, implement, run → PASS.
- [ ] **Step 5: Commit** — `"Consultation emails: booked, changed, cancelled, reminders, book your call"`

### Task 6: Server routes

**Files:**
- Create: `artifacts/api-server/src/routes/consultations.ts` (register in `routes/index.ts` like `diagnostic.ts`)
- Create: `artifacts/api-server/src/lib/consultation-access.ts`
- Modify: `artifacts/api-server/src/routes/sessions.ts` (`userCanAccessSession` ~line 225; `DELETE /sessions/:id` ~line 849 refuses consultations with 409 "Cancel consultations from the consultation card."; session list/detail select includes the new columns)
- Modify: `artifacts/api-server/src/routes/diagnostic.ts` (create accepts optional `parentEmail`, checked with `normaliseProspectEmail`)
- Test: `artifacts/api-server/test/consultation-access.test.ts`

**Interfaces:**
- Consumes: Tasks 1–5; `prospectSenderName`, `normaliseProspectEmail`, `diagnosticStatus`; `getLiveKitConfig` and `AccessToken` as in `sessions.ts`.
- Produces:
  - `openSessionAllowed(sessionType: string, participantCount: number): boolean` — false for `'consultation'`; else `participantCount === 0`.
  - `guestJoinAllowed(s: { status: string; scheduled_at: string; duration_minutes: number }, now: number): boolean` — not cancelled/completed; `now` within `[start − 10 min, start + 120 min]`.
  - `newGuestToken(): string` (32 bytes, base64url).
  - Routes (JSON):
    - `GET /tutor/booking-settings` → `{ settings: {…, hasCalendar: boolean, calendarCheckedAt, calendarError, inviteEmail } }` (never the iCal URL itself).
    - `PUT /tutor/booking-settings` (validates with `validateWeeklyHours`, `checkIcalUrl`, ranges: call 15–180, gap 0–120, notice 0–168, days 1–90, reminders 1–5 values each 5–10080; `busyIcalUrl: null` clears, omitted keeps) → reads the calendar once and returns the same shape.
    - `GET /consultation/:token/slots` (diagnostic token; completed link diagnostic) → `{ slots, timeZone, callMinutes, senderName, email, parentEmail, booking: null | { start, joinUrl } }`; 404 if not found; `slots: []` with `noHours: true` if the tutor has none.
    - `POST /consultation/:token/book { start, email, parentEmail?, name?, timeZone }` → `{ start, joinUrl }`; 409 `{ error, slots }` on `slot_taken` or when `start` isn't in the fresh slots; 409 when a live booking already exists (returns it).
    - `GET /tutor/consultations/slots?diagnosticId=` → `{ slots, timeZone }`.
    - `POST /tutor/consultations { diagnosticId, start, email?, parentEmail?, reminderMinutes? }` → `{ sessionId }` (tutor may book any time not overlapping a session; Google busy is shown, not enforced).
    - `PATCH /tutor/consultations/:id { start?, reminderMinutes? }` → `{ ok: true }` (reschedule via `reschedule_consultation`; reminders-only edits just update the column and clear `consultation_reminders_sent` rows for offsets removed).
    - `POST /tutor/consultations/:id/cancel` → `{ ok: true }` (status `cancelled`, `ics_sequence + 1`, cancel invites).
    - `GET /consultation/join/:guestToken` → `{ title, start, minutes, tutorName, canJoinFrom, status }`; `POST /consultation/join/:guestToken` → `{ token, wsUrl }` (identity `guest-<sessionId>`, name = guest name or "Guest", TTL 3h, `roomJoin` for that room only, no admin) or 403/410.
  - Every booking/reschedule/cancel sends: guest email (+ .ics), parent copy if set (+ .ics), tutor email (+ .ics to `invite_email` or their sign-in email). Reply-To on guest/parent = tutor's sign-in email. `.ics` UID = `consultation-<sessionId>@gradefarm.com.au`. Email failures are logged and don't undo the booking.
  - `pre_call_form_url` of the diagnostic is passed as `questionnaireUrl`.

- [ ] **Step 1: Failing tests** for `openSessionAllowed` (consultation with 0 participants → false; individual with 0 → true; group with 2 → false) and `guestJoinAllowed` (11 min before → false, 9 min before → true, 2h01 after → false, cancelled → false, completed → false), `newGuestToken` (43 chars, url-safe, differs across calls).
- [ ] **Step 2–4:** run `npx tsx --test test/consultation-access.test.ts` → FAIL, implement, → PASS.
- [ ] **Step 5: Use `openSessionAllowed` in `userCanAccessSession`** (select `session_type` where needed).
- [ ] **Step 6: Implement the routes.** Fetching busy times: only when the tutor has `busy_ical_url`; on `{ error }` record it on the settings row and carry on. Booking calls `book_consultation` via `admin.rpc`; map Postgres message `slot_taken` and unique violation `23505` to 409.
- [ ] **Step 7: Typecheck and suite** — `npx tsc -p tsconfig.json --noEmit 2>&1 | grep -v health.ts; pnpm test` → no errors; all pass.
- [ ] **Step 8: Commit** — `"Consultation booking routes, guest join, settings"`

### Task 7: Reminders and the "book your call" email

**Files:**
- Modify: `artifacts/api-server/src/lib/automated-emails.ts` (`runSessionReminders` excludes `session_type = 'consultation'`; new `runConsultationReminders`, `runBookYourCall`; steps list; header comment; `EmailKind` adds `"consultation_reminder" | "book_your_call"`)
- Create: `artifacts/api-server/src/lib/consultation-reminders.ts`
- Test: `artifacts/api-server/test/consultation-reminders.test.ts`

**Interfaces:**
- Consumes: Task 5 emails; `consultation_reminders_sent`.
- Produces:
  - `dueConsultationReminders(s: { scheduled_at: string; created_at: string; reminder_minutes: number[] }, sent: Set<string> /* "minutes:recipient" */, recipients: Array<"guest"|"parent"|"tutor">, now: number): Array<{ minutes: number; recipient: string }>` — due when `now ≥ start − minutes` and `now < start`, not already sent, and the booking was made before `start − minutes` (else that reminder is skipped).
  - `dueBookYourCall(d: { status: string; student_id: string | null; prospect_email: string | null; completed_at: string | null; booking_reminded_at: string | null }, hasLiveBooking: boolean, tutorHasHours: boolean, now: number): boolean` — completed link diagnostic with email, ≥ 24h since completion, < 14 days, not reminded, no live booking, tutor has hours.

- [ ] **Step 1: Failing tests:**
  - Booked 3 days ahead with `{1440,60}`: at start−25h → none; at start−23h50 → `1440` for each recipient; at start−55 min → `60`; after start → none.
  - Booked 30 minutes before start → `1440` and `60` both skipped (60 skipped because booking was after start−60).
  - Already-sent keys are excluded.
  - `dueBookYourCall`: 23h after completion → false; 25h → true; reminded → false; live booking → false; no hours → false; roster diagnostic → false.
- [ ] **Step 2–4:** run → FAIL, implement, → PASS.
- [ ] **Step 5: Wire the job.** `runConsultationReminders`: scheduled consultations starting within the next 8 days (max offset is 7 days); claim each `(session, minutes, recipient)` by inserting into `consultation_reminders_sent` (conflict = already claimed → skip); send; on a non-blocked failure delete the claim row. Recipients: guest (`guest_email`), parent (`guest_parent_email`, if set), tutor (their account email, respecting unsubscribe as `loadRecipients` does). `runBookYourCall`: daytime only; claim with `booking_reminded_at` like prospect reminders; link to `${appUrl()}/book/<diagnostic token>`.
- [ ] **Step 6: Typecheck and suite** → green.
- [ ] **Step 7: Commit** — `"Email job: consultation reminders at the tutor's times; one book-your-call email"`

### Task 8: Tutor screens

**Files:**
- Create: `artifacts/gradefarm/src/components/ConsultationSettings.jsx`
- Create: `artifacts/gradefarm/src/lib/bookingFormat.js` + `bookingFormat.test.js`
- Modify: `artifacts/gradefarm/src/components/SessionsTab.jsx` (settings card; consultation label and actions on `SessionCard` when `session.session_type === 'consultation'`)
- Modify: `artifacts/gradefarm/src/components/TutorScreen.jsx` (`DiagnosticTab`: "Parent's email (optional)" on create; prospect rows: "Book call" / booked time with Reschedule / Cancel)
- Modify: `artifacts/gradefarm/src/lib/db.js` (helpers for every Task 6 tutor route)

**Interfaces:**
- Consumes: Task 6 routes.
- Produces (client libs, tested):
  - `reminderLabel(minutes: number): string` — 1440 → "1 day before", 60 → "1 hour before", 30 → "30 minutes before", 2880 → "2 days before", 90 → "1 hour 30 minutes before".
  - `groupSlotsByDay(slots: string[], timeZone: string): Array<{ day: string /* "Tuesday 3 November" */; times: Array<{ iso: string; label: string /* "4:30 pm" */ }> }>`
  - `emptyWeek(): WeeklyHours` and `isValidHHMM(s)`.

- [ ] **Step 1: Failing tests** for `reminderLabel`, `groupSlotsByDay` (two slots on one Melbourne day, one the next; labels in that zone), `isValidHHMM`. Run `cd artifacts/gradefarm && node --test src/lib/bookingFormat.test.js` → FAIL; implement; → PASS.
- [ ] **Step 2: Consultation settings card** (Lessons tab, above the sessions list, collapsible): per-day rows Mon–Sun with time blocks (two `type="time"` inputs + remove; "Add hours"), time zone select (Australian zones: Adelaide, Darwin, Brisbane, Sydney, Melbourne, Hobart, Perth), call length, gap, earliest booking (hours), furthest ahead (days), default reminders (list of `reminderLabel` chips with remove; add with number + unit select), "Send calendar invites to", Google Calendar secret address (password-style input showing "Connected · last read <date>" or the error; short how-to: Google Calendar → Settings → your calendar → "Secret address in iCal format"). Save → `PUT`; show server validation errors inline.
- [ ] **Step 3: Consultation cards** in the Lessons list: label "Consultation", guest name/email, Join (existing route `/session/:id`), Reschedule (modal with the slot picker from `GET /tutor/consultations/slots` plus a "Pick any time" date-time input), Reminders (edit chips for this booking), Cancel (`confirmDialog`). Lesson cards unchanged.
- [ ] **Step 4: Diagnostic tab.** Create form: "Parent's email (optional)". Prospect rows: when finished and not booked, "Book call" (same modal); when booked, "Call <day time>" with Reschedule / Cancel.
- [ ] **Step 5: Build and test** — `cd artifacts/gradefarm && pnpm run build && pnpm test` → success; all pass.
- [ ] **Step 6: Commit** — `"Tutor: consultation settings, booking, reschedule and cancel"`

### Task 9: Prospect screens

**Files:**
- Create: `artifacts/gradefarm/src/components/BookingPicker.jsx` (shared picker: days → time buttons, email + parent email, Confirm)
- Create: `artifacts/gradefarm/src/components/BookCallScreen.jsx` (`/book/:token`)
- Create: `artifacts/gradefarm/src/components/GuestCallScreen.jsx` (`/call/:guestToken`: pre-join panel, then `RoomFrame` from `components/call/RoomFrame` with the guest token)
- Modify: `artifacts/gradefarm/src/components/DiagnosticScreen.jsx` (`SubmittedScreen`: show `BookingPicker` when slots exist; no redirect to `pre_call_form_url` while booking is offered)
- Modify: `artifacts/gradefarm/src/App.jsx` (public routes `/book/:token`, `/call/:guestToken`, no sign-in, like `/diagnostic/:token`)
- Modify: `artifacts/gradefarm/src/lib/db.js` (public helpers for Task 6 public routes)

**Interfaces:**
- Consumes: Task 6 public routes; Task 8 `groupSlotsByDay`.

- [ ] **Step 1: `BookingPicker`** — loads slots; shows the prospect's zone ("Times are in Melbourne time"); days as rows, times as `af-btn` buttons; email (prefilled, editable), parent email (optional, prefilled); Confirm → `book`; on 409 shows "That time was just taken — pick another" with the fresh slots; success → "Booked for <day, time>. We've emailed you the details." plus the questionnaire link if any. If `noHours`, render nothing (caller shows today's finish screen).
- [ ] **Step 2: Finish screen and `/book/:token`** use it; `/book/:token` shows the existing booking when there is one.
- [ ] **Step 3: `/call/:guestToken`** — `Panel` with "Consultation call with <tutor full name>", time in their zone, "Join call" enabled from 10 minutes before (countdown text before that), then `RoomFrame` (`isTutor={false}`, `onLeave` returns to the panel). Cancelled → "This call was cancelled."
- [ ] **Step 4: Build and test** — `cd artifacts/gradefarm && pnpm run build && pnpm test` → success.
- [ ] **Step 5: Commit** — `"Prospect: book the call after the diagnostic, booking page, guest call link"`
