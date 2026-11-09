-- Batches of exam papers uploaded on Admin → Exam papers, for the "Ingest exam
-- paper" Action to load in one run (scripts/src/ingest-past-paper.ts, given
-- the batch id). `papers` lists each paper's files (paths in the admin-uploads
-- bucket) and details; the script writes each paper's outcome to `results`
-- ({ "<index>": { status, mode, questions, marks, figures, error, at } }) so
-- the admin page can show progress. Admins only; the script uses the service role.

create table if not exists public.exam_paper_batches (
  id         uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users(id) on delete set null,
  subject    text not null,
  papers     jsonb not null default '[]'::jsonb,
  results    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists exam_paper_batches_created_idx on public.exam_paper_batches (created_at desc);

alter table public.exam_paper_batches enable row level security;

drop policy if exists exam_paper_batches_admin on public.exam_paper_batches;
create policy exam_paper_batches_admin on public.exam_paper_batches
  for all to authenticated
  using (public.is_current_user_admin())
  with check (public.is_current_user_admin());
