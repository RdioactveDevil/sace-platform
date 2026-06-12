-- ============================================================================
-- Whole-textbook ingestion — page-range chunking progress.
-- ============================================================================
-- Documents larger than a single Claude PDF request (~100 pages / 32 MB) are
-- split server-side into page-range chunks. Each chunk is distilled in its own
-- request (one Claude call) so a whole textbook never exceeds the serverless
-- 5-minute limit. These counters drive the upload progress UI and let a partly
-- processed resource be resumed.
-- ============================================================================
alter table public.curriculum_resources
  add column if not exists total_chunks     integer,
  add column if not exists processed_chunks integer not null default 0;
