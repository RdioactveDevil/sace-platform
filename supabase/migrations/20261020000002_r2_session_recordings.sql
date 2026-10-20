-- ============================================================================
-- Session recordings on Cloudflare R2
-- ============================================================================
-- Supabase's Free plan caps any single upload at 50 MB, so LiveKit Egress
-- uploads of anything past a few minutes were rejected (413) and the session
-- was marked failed. When R2 is configured the API now sends recordings there.
-- Each file remembers which storage holds it so playback, download and delete
-- go to the right place; existing rows stay on Supabase.
--
-- recording_error keeps the reason a recording failed, so it can be seen in
-- the tutor's session list instead of only "Recording failed".
-- ============================================================================

alter table public.tutor_resources
  add column if not exists storage_backend text not null default 'supabase';

alter table public.tutoring_sessions
  add column if not exists recording_storage_backend text,
  add column if not exists recording_error text;
