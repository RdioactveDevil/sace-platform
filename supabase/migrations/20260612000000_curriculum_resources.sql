-- ============================================================================
-- Curriculum Reference Resources — textbooks, exams, practice tests & assessments
-- used as exemplars during AI question generation.
-- ============================================================================
-- An admin uploads a source document (PDF) against a curriculum. The server
-- reads it with Claude, automatically works out which curriculum subtopics the
-- document covers, and distills a per-subtopic "exemplar pack" (representative
-- sample questions in the source's authentic style + notes on difficulty,
-- terminology, command words and formatting). At generation time the exemplar
-- pack for the target subtopic is injected into the prompt so newly generated
-- questions match the real teaching/assessment material for that subject.
-- ============================================================================

-- ── Source documents ─────────────────────────────────────────────────────────
create table if not exists public.curriculum_resources (
  id             uuid primary key default gen_random_uuid(),
  curriculum_id  uuid not null references public.curricula (id) on delete cascade,

  title          text not null,
  -- textbook | exam | practice_test | assessment | notes | resource
  resource_type  text not null default 'resource',

  -- The uploaded file lives in the private 'curriculum-resources' bucket and is
  -- retained (unlike admin-uploads, which is cleaned up after extraction) so it
  -- can be re-processed if the distillation prompt improves.
  storage_path   text,
  file_name      text,
  file_size      bigint,
  mime_type      text,

  -- processing → ready → failed
  status         text not null default 'processing'
                 check (status in ('processing', 'ready', 'failed')),
  error          text,
  -- How many per-subtopic exemplar packs were distilled from this document.
  exemplar_count integer not null default 0,

  created_at     timestamptz not null default now()
);

create index if not exists curriculum_resources_curr_idx
  on public.curriculum_resources (curriculum_id, created_at desc);

-- ── Distilled per-subtopic exemplar packs ────────────────────────────────────
create table if not exists public.curriculum_resource_exemplars (
  id            uuid primary key default gen_random_uuid(),
  resource_id   uuid not null references public.curriculum_resources (id) on delete cascade,
  curriculum_id uuid not null references public.curricula (id) on delete cascade,

  -- Denormalised curriculum name (matches questions.subject / the value the
  -- generator resolves) so retrieval at generation time is a single fast lookup.
  subject       text not null,
  -- Parent topic name (nullable for subject-wide exemplars).
  topic         text,
  -- Canonical curriculum_subtopics.name this pack targets. NULL = subject-wide
  -- (used as a fallback when no topic-scoped exemplar exists).
  subtopic      text,

  -- The exemplar pack: sample questions in the source's style + style notes.
  content       text not null,
  enabled       boolean not null default true,

  created_at    timestamptz not null default now()
);

-- Fast retrieval path used by generate-questions: by subject, then subtopic.
create index if not exists curriculum_resource_exemplars_lookup_idx
  on public.curriculum_resource_exemplars (subject, subtopic) where enabled;
create index if not exists curriculum_resource_exemplars_resource_idx
  on public.curriculum_resource_exemplars (resource_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- The API reads/writes with the service role (which bypasses RLS). These
-- policies cover any direct client access and keep the tables admin-only.
alter table public.curriculum_resources           enable row level security;
alter table public.curriculum_resource_exemplars  enable row level security;

drop policy if exists "Admins manage curriculum resources" on public.curriculum_resources;
create policy "Admins manage curriculum resources" on public.curriculum_resources
  for all to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true))
  with check (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

drop policy if exists "Admins manage curriculum exemplars" on public.curriculum_resource_exemplars;
create policy "Admins manage curriculum exemplars" on public.curriculum_resource_exemplars
  for all to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true))
  with check (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

-- ============================================================================
-- Storage bucket for source documents (private; 50 MB cap; PDF only).
-- Retained after processing so resources can be re-distilled later.
-- ============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'curriculum-resources',
  'curriculum-resources',
  false,
  52428800,  -- 50 MB
  array['application/pdf']
)
on conflict (id) do nothing;

-- Admins upload + read; downloads for processing are brokered server-side with
-- the service role, so no extra SELECT policy is required for the pipeline.
drop policy if exists "Admins upload curriculum resources" on storage.objects;
create policy "Admins upload curriculum resources" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'curriculum-resources'
    and exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

drop policy if exists "Admins read curriculum resources" on storage.objects;
create policy "Admins read curriculum resources" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'curriculum-resources'
    and exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

drop policy if exists "Admins delete curriculum resources" on storage.objects;
create policy "Admins delete curriculum resources" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'curriculum-resources'
    and exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );
