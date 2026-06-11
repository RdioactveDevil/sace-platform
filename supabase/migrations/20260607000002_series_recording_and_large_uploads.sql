-- ============================================================================
-- (a) Extend auto-recording to recurring series
-- (c) Allow larger manual uploads (resumable / TUS) to tutor-resources
-- ============================================================================

-- Series remember whether their occurrences should be recorded. The flag is
-- copied onto each generated tutoring_sessions occurrence so the existing
-- per-session recording flow (room_started → egress → resource) just works.
alter table public.session_series
  add column if not exists record_session boolean not null default false;

-- Raise the tutor-resources file-size cap to 5 GB so tutors can upload large
-- video/recording files via resumable uploads. (Standard uploads are used for
-- small files; the client switches to resumable TUS uploads above ~6 MB.)
update storage.buckets
  set file_size_limit = 5368709120  -- 5 GB
  where id = 'tutor-resources';
