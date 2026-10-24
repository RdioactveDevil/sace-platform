-- Invite reminders.
--
-- The automated email job (/api/cron/emails) reminds a student once if they
-- haven't accepted a tutor's invite a few days after it was sent. The invitee
-- may not have an account yet, so it can't go through email_log (keyed by
-- user); the invite records it instead. Re-sending the invite clears it, so
-- the new invite gets its own reminder.

alter table public.tutor_invites
  add column if not exists reminded_at timestamptz;
