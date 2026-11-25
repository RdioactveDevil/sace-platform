# Booking the consultation call

Status: approved design pending user sign-off (after builder check).

Project 3a of the prospect-consultation work. Flow: diagnostic (projects 1–2,
done) → **book the call (this)** → pre-call questionnaire (3b: each tutor's own
editable form, linked from the booking confirmation) → call → report and
sign-up (4) → Google Calendar sign-in button (5).

## Why

A tutor runs a free consultation call with a prospective student (not their
student yet) after the prospect does a diagnostic: they go through the results,
strengths, weaknesses and next steps, and aim to sign the student up. Today the
call is booked outside the app. The tutor wants the prospect to book straight
from the diagnostic, or to book it for them, with the call in their calendar,
reminders as they choose, and the call held in the app.

## Goals

1. **Self-booking after the diagnostic.** When a prospect finishes a link
   diagnostic (student_id null), the finish screen offers the tutor's open
   times. They pick one, confirm their email (prefilled from the diagnostic),
   and it's booked immediately (no tutor approval).
2. **Booking reminder.** If a finished prospect hasn't booked one day after
   finishing, one email with a "Book your call" button to the same times.
3. **Tutor booking.** From a prospect's row in the Diagnostic tab the tutor
   picks a date and time (email already known; editable if missing).
4. **Open times** = the tutor's fixed weekly hours (in their own time zone),
   minus their existing GradeFarm sessions (lessons and consultations, plus the
   gap), minus busy times from their Google Calendar's secret iCal address,
   within the notice window.
5. **Confirmation**: the prospect and the tutor each get an email with a
   calendar invite (.ics, `METHOD:REQUEST`) and the join link; Gmail adds it to
   the tutor's Google Calendar. Reschedule and cancel send updated / cancelling
   invites (same UID, higher SEQUENCE; `METHOD:CANCEL`).
6. **Reminders** to both the prospect and the tutor: default a day before and
   an hour before; the tutor sets the defaults and can change them on any
   single booking.
7. **The call** happens in the existing video room (LiveKit). The prospect
   joins from a guest link with no account; the tutor joins from their
   Lessons tab as for any session.
8. Prospect-facing times are shown in the prospect's own time zone (browser),
   and emails state the time zone.
9. **Optional parent email** (user's decision). The tutor can add a parent's
   email when sending the diagnostic, and the student can add or change it
   when booking. A parent with an email gets a copy of the confirmation (with
   the invite), every reminder, and any reschedule or cancellation. It is
   never required.
10. **Replies reach the tutor** (user's decision). Every email about a
   consultation (to the prospect or parent) has Reply-To set to the tutor's
   sign-in email, so "I can't make it" reaches them. This shows the tutor's
   email to the prospect; the user accepted that. Prospects cannot reschedule
   or cancel themselves; the tutor does it from the app.

## Settings (per tutor, with defaults)

| Setting | Default |
|---|---|
| Weekly hours | none set — booking is offered only once hours exist |
| Time zone | Australia/Adelaide |
| Call length | 45 minutes |
| Gap between calls | 15 minutes |
| Earliest booking | 12 hours from now |
| Furthest ahead | 14 days |
| Reminders | 24 hours and 1 hour before |
| Google Calendar secret iCal address | none (optional) |
| Send calendar invites to | the tutor's sign-in email (editable: the Gmail address of the calendar) |

## Non-goals

- The questionnaire (3b); the call report and conversion (4); Google sign-in
  (5).
- Public booking pages not tied to a diagnostic.
- Payments, deposits, approval workflows.
- Group consultations; recording consultations (off for these sessions).

## Anti-goals

- Double-booking the tutor (against lessons, other consultations or their
  Google Calendar).
- Any way for someone with a guest link, or any signed-in user, to join a
  different session, or for a guest link to work for anything but its own
  consultation.
- Breaking existing lessons, series, their access rules or their reminders.
- Calling the tutor the prospect's tutor anywhere a prospect sees.
- Looking different from the rest of the site.

## Approaches

**A. A consultation is a `tutoring_sessions` row (chosen by the user).**
`session_type = 'consultation'`, linked to the diagnostic; the prospect is a
guest on it. It appears in the tutor's Lessons tab, uses the existing video
room, and the existing schedule is what prevents double-booking.
B (a separate consultations table and room) was rejected: double-booking
checks across two lists, duplicated video and reminder code, and calls missing
from the tutor's schedule.

## Design

### Data (one migration)

- `tutor_booking_settings` (one row per tutor, `tutor_id` PK → profiles):
  `time_zone text`, `weekly_hours jsonb` (`{ "mon": [["09:00","12:00"],
  ["15:30","18:00"]], … }`, local times), `call_minutes int`, `gap_minutes
  int`, `min_notice_hours int`, `max_days_ahead int`, `reminder_minutes
  int[]` (`{1440,60}`), `busy_ical_url text` (secret; never sent back to the
  client in full — only whether one is set and when it was last read OK),
  `busy_ical_checked_at`, `busy_ical_error`.
- `tutoring_sessions` gains `diagnostic_id uuid` (→ diagnostic_assessments, on
  delete set null), `guest_email text`, `guest_name text`, `guest_token text`
  (random, unique; the guest join link), `reminder_minutes int[]` (copied from
  settings at booking; editable per booking), `ics_sequence int default 0`.
  `session_type` gains the value `'consultation'` (check constraint, if any,
  updated).
- `consultation_reminders_sent` (`session_id`, `minutes`, `recipient`
  ('guest'|'tutor'), `sent_at`; PK on the first three) — one row per reminder
  sent, so changing a booking's reminders or time doesn't resend or skip.
  Rescheduling deletes that session's rows.
- `diagnostic_assessments` gains `booking_reminded_at timestamptz` (the one
  "book your call" email) and `parent_email text` (optional; set by the tutor
  when sending, or at booking).
- `tutoring_sessions` also gains `guest_parent_email text` (copied from the
  diagnostic or entered at booking).
- At most one live booking per prospect per tutor (builder-check call): a
  prospect sent several diagnostics (say one per subject) gets one call.
  Partial unique index on `tutoring_sessions (tutor_id, lower(guest_email))
  where session_type = 'consultation' and status = 'scheduled'`. A later
  diagnostic from the same email shows the existing booking instead of the
  picker. Once a call is active, completed or cancelled (e.g. a no-show the
  tutor cancels), the tutor can book a new one.
- `tutor_booking_settings.invite_email text` — where the tutor's calendar
  invite goes; defaults to their sign-in email. The tutor is listed as an
  attendee on the invite so Gmail adds it to that calendar.

### Open times (pure, tested)

`openSlots({ settings, now, busy: [{start,end}], existing: [{start,end}] })`
→ ISO start times, on a grid of `call_minutes + gap_minutes`
from the start of each weekly-hours block (block start, +60, +120… for 45+15),
keeping a slot only if the whole call fits in the block, it starts ≥
`min_notice_hours` from now and ≤ `max_days_ahead`, and it doesn't overlap
any busy interval or existing session padded by `gap_minutes` on both sides.
Weekly hours are interpreted in the tutor's time zone, correct across daylight
saving changes (Adelaide and Melbourne both change on the same dates).

### Busy times from Google Calendar

The tutor pastes their calendar's "Secret address in iCal format" in
settings. On each open-times request the server fetches it (5-minute cache per
tutor, 5-second timeout, 5 MB cap, `https` only), parses it with a maintained
iCal library that expands repeating events and exceptions, and treats every
non-transparent, non-cancelled event in the window as busy (all-day events
block the whole day in the tutor's zone). If the fetch fails, open times are
still shown from weekly hours and existing sessions, the error is recorded on
the settings row, and the tutor's settings show "Couldn't read your calendar
on <date>: <reason>". Bookings themselves create invites that land in the
calendar, so the next read sees them.

### Booking (server)

- `GET /consultation/:diagnosticToken/slots` (public; only for a completed
  link diagnostic with no live booking; tutor must have weekly hours) →
  `{ slots, timeZone, callMinutes, senderName, email }`.
- `POST /consultation/:diagnosticToken/book { start, email, name? }` (public):
  re-checks the slot is still open, inside a transaction/lock per tutor so two
  prospects can't take the same time; creates the session (`title`:
  "Consultation call: <prospect name>", `duration_minutes` = call length,
  `record_session` false, no participants), sets `guest_*`,
  `reminder_minutes`, `diagnostic_id`; sends both invites. 409 with fresh
  slots if it was just taken.
- Tutor (auth, owner of the diagnostic): `GET /tutor/consultations/slots?
  diagnosticId=` (same slots, but the tutor may also pick any time with
  `force`, which skips the open-times check but never overlaps an existing
  session), `POST /tutor/consultations` (book), `PATCH
  /tutor/consultations/:sessionId` (reschedule and/or reminders), `POST
  /tutor/consultations/:sessionId/cancel`.
- Settings: `GET/PUT /tutor/booking-settings` (validated: times `HH:MM`,
  blocks non-overlapping and ≥ call length, sensible ranges; the iCal URL must
  be `https://calendar.google.com/…` or another `https` address; reading it once
  on save and reporting the result).

### Guest join

- `GET /call/:guestToken` (client route, no sign-in) → a pre-join screen in
  the site's style: who it's with, when (their time zone), "Join call" (camera
  and mic check as the existing room does), opening 10 minutes before the
  start and closing 2 hours after.
- `POST /consultation/join/:guestToken` → a LiveKit token for that session's
  room only (`identity: guest-<sessionId>`, name = prospect's name, publish +
  subscribe, no room admin, TTL 3 h), only inside the window and not for a
  cancelled session.
- Existing access rule fix: `userCanAccessSession` currently lets anyone in
  when a session has no participants ("open session"). Consultations are
  excluded from that rule: only the tutor (by account) or the guest (by
  token) can join one.

### Emails (same layout as other GradeFarm emails; tested pure builders)

- Booking confirmation (prospect): time in their zone with zone name, length,
  join link, "add to calendar" via the attached invite; names the sender in
  full; says the pre-call questionnaire will follow (3b adds the link).
- Booking notice (tutor): who, when (tutor's zone), link to the diagnostic
  report and to the session in Lessons; invite attached.
- Reschedule and cancel versions of both.
- Reminders (both): at each of the booking's reminder offsets, sent by the
  15-minute email job — so within 15 minutes of the chosen time; skipped if
  the booking was made after that reminder's time had passed.
- "Book your call" (prospect): once, a day after finishing, if no live
  booking and the tutor has hours set; daytime only.
- `sendEmail` gains optional attachments (Resend supports them) for the .ics,
  and an optional `replyTo` (the tutor's sign-in email on consultation
  emails).
- Parent copies: the same emails, addressed to the parent, naming the student
  ("<Student>'s consultation call with <Full name>").

### Calendar invite (.ics, pure, tested)

`consultationIcs({ uid, sequence, method, start, minutes, summary,
description, location (join URL), organizer (tutor name + notification
address), attendee (prospect email) })` → RFC 5545 text with CRLF line
endings, folded lines, escaped text, UTC times. The UID is stable per session.

### Tutor UI (existing styles: THEMES tokens, FONT_B, the card / sectionHdr /
inputStyle / labelStyle patterns in TutorScreen.jsx, SegmentedToggle,
confirmDialog)

- **Lessons tab → "Consultation settings"** card: weekly hours editor (per day,
  add/remove time blocks), time zone, call length, gap, notice, days ahead,
  default reminders (add/remove offsets: minutes/hours/days before), Google
  Calendar secret address with how-to and last-read status.
- **Lessons tab** lists consultations with the other sessions, labelled
  "Consultation", with Reschedule / Cancel / reminders edit, and **Links**:
  the call, questionnaire and diagnostic links the prospect was emailed (from
  `GET /tutor/consultations/:id/links`, the call's own tutor only), each with
  Copy plus Copy all, for when someone can't find their invitation. Fetched on
  click, so the guest token stays out of the sessions list.
- **Diagnostic tab create form** gains "Parent's email (optional)".
- **Diagnostic tab rows** for prospects gain "Book call" (or the booked time
  with Reschedule / Cancel) and a "Booked" status after "Finished".

### Prospect UI (existing styles: AuthLayout, Panel, H1, P, btnStyle,
af-btn/af-inp classes in DiagnosticScreen.jsx)

- The tutor's existing pre-call form link (`pre_call_form_url`) no longer
  redirects the prospect away after the test when booking is offered; it goes
  in the booking confirmation email and the "Booked" screen instead ("Before
  the call, please fill in this short questionnaire"), until 3b replaces it.
  When the tutor has no weekly hours set, today's finish screen and redirect
  are unchanged.
- After finishing a link diagnostic: "Book your consultation call" with days
  as rows and times as buttons (their time zone, stated), email field
  prefilled, "Parent's email (optional)" (prefilled if the tutor gave one),
  Confirm → "Booked for <day, time>. We've emailed you the
  details." If the tutor has no hours set: today's finish screen.
- `/book/:diagnosticToken` (from the reminder email): the same picker on its
  own page; shows the existing booking if already booked.
- `/call/:guestToken`: the pre-join screen and the room.

## Left to the builder

- Choice of iCal parsing library (must expand RRULE/EXDATE/RECURRENCE-ID).
- The invite's ORGANIZER: ideally a prospect's calendar "Decline" reaches the
  tutor, but Gmail auto-adding the invite to the tutor's calendar comes first.
  Check Gmail's behaviour before choosing.
- The per-tutor lock mechanism for booking (advisory lock or a unique
  constraint on (tutor_id, scheduled_at) plus overlap check).
- Exact copy within the wording rules above.
