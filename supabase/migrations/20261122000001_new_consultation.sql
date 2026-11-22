-- New consultation: a tutor books a consultation first and sends one combined
-- email to the student and/or parent.
--
--   diagnostic_assessments.has_test            false = the record holds the
--                                              booking only; the test is added
--                                              later (default true: existing
--                                              records all have one)
--   diagnostic_assessments.prospect_is_parent  the primary address
--                                              (prospect_email) is a parent's
--   tutoring_sessions.guest_is_parent          the primary address
--                                              (guest_email) is a parent's

set local lock_timeout = '10s';

alter table public.diagnostic_assessments
  add column if not exists has_test boolean not null default true,
  add column if not exists prospect_is_parent boolean not null default false;

alter table public.tutoring_sessions
  add column if not exists guest_is_parent boolean not null default false;
