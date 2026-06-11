-- ============================================================================
-- Session recordings — LiveKit Egress auto-recording for tutoring sessions
-- ============================================================================
-- When a tutor opts to record a session, the API starts a LiveKit Room
-- Composite Egress that writes an MP4 into the tutor-resources storage bucket.
-- When egress finishes, the LiveKit webhook creates a tutor_resources row of
-- type 'recording' so the recording shows up alongside other class materials.
-- ============================================================================

alter table public.tutoring_sessions
  add column if not exists record_session         boolean not null default false,
  add column if not exists recording_egress_id    text,
  -- null | recording | ready | failed
  add column if not exists recording_status        text,
  add column if not exists recording_storage_path  text;
