-- Diagnostics sent to prospective students by email.
--
-- A tutor can send a link diagnostic (student_id null) to a prospective
-- student's email from the Diagnostic tab. The row records where it's up to:
--   prospect_email  the student's own email (they do the test, not a parent)
--   sent_at         last emailed; the link works for 30 days from here
--                   (or from created_at for copy-link diagnostics)
--   opened_at       first opened the link
--   started_at      pressed Start
--   reminded_at     the one reminder went out (the prospect has no account,
--                   so not email_log); a resend clears it
--   cancelled_at    the tutor cancelled it
-- Status rules: artifacts/api-server/src/lib/prospect-status.ts.

set local lock_timeout = '10s';

alter table public.diagnostic_assessments
  add column if not exists prospect_email text,
  add column if not exists sent_at        timestamptz,
  add column if not exists opened_at      timestamptz,
  add column if not exists started_at     timestamptz,
  add column if not exists reminded_at    timestamptz,
  add column if not exists cancelled_at   timestamptz;

-- The email job's reminder lookup.
create index if not exists diagnostic_assessments_prospect_reminders
  on public.diagnostic_assessments (sent_at)
  where prospect_email is not null and status = 'pending';
