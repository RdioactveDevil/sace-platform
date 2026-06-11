-- ============================================================================
-- Tutor Resources — post-class notes, files, worksheets, recordings & links
-- ============================================================================
-- Tutors upload class materials (or paste external links to recordings) and
-- share them with an individual student, a class, or their whole roster.
-- Students see the resources shared with them in the student app.
-- ============================================================================

create table if not exists public.tutor_resources (
  id            uuid primary key default gen_random_uuid(),
  tutor_id      uuid not null references public.profiles (id) on delete cascade,

  title         text not null,
  description   text,
  -- High-level category, drives the icon/label in the UI.
  -- notes | worksheet | recording | slides | resource | link
  type          text not null default 'resource',

  -- 'file'  → stored in the tutor-resources storage bucket (storage_path set)
  -- 'link'  → external_url set (recordings on Zoom/Drive/Loom/YouTube, etc.)
  kind          text not null default 'file' check (kind in ('file', 'link')),

  storage_path  text,
  file_name     text,
  file_size     bigint,
  mime_type     text,
  external_url  text,

  -- Sharing target (mirrors the assignment targeting model):
  --   student_id set                 → visible to that one student
  --   class_id set                   → visible to all members of that class
  --   both null                      → visible to the tutor's whole roster
  class_id      uuid references public.tutor_classes (id) on delete set null,
  student_id    uuid references public.profiles (id) on delete cascade,
  -- Optional link back to the session this material came out of.
  session_id    uuid,

  visible_to_students boolean not null default true,
  created_at    timestamptz not null default now(),

  -- A file resource must have a storage_path; a link resource must have a url.
  constraint tutor_resources_payload_chk check (
    (kind = 'file' and storage_path is not null)
    or (kind = 'link' and external_url is not null)
  )
);

create index if not exists tutor_resources_tutor_idx   on public.tutor_resources (tutor_id, created_at desc);
create index if not exists tutor_resources_class_idx   on public.tutor_resources (class_id);
create index if not exists tutor_resources_student_idx on public.tutor_resources (student_id);

alter table public.tutor_resources enable row level security;

-- Tutors have full control over their own resources.
drop policy if exists "Tutors manage own resources" on public.tutor_resources;
create policy "Tutors manage own resources" on public.tutor_resources
  for all to authenticated
  using (tutor_id = auth.uid())
  with check (tutor_id = auth.uid());

-- Students can read resources shared with them:
--   • addressed to them directly, OR
--   • they are on the tutor's roster AND the resource is roster-wide or
--     targeted at a class they belong to.
drop policy if exists "Students view shared resources" on public.tutor_resources;
create policy "Students view shared resources" on public.tutor_resources
  for select to authenticated
  using (
    visible_to_students = true
    and (
      student_id = auth.uid()
      or (
        exists (
          select 1 from public.tutor_students ts
          where ts.tutor_id = tutor_resources.tutor_id
            and ts.student_id = auth.uid()
        )
        and (
          (class_id is null and student_id is null)
          or (
            class_id is not null
            and exists (
              select 1 from public.tutor_class_members cm
              where cm.class_id = tutor_resources.class_id
                and cm.student_id = auth.uid()
            )
          )
        )
      )
    )
  );

-- ============================================================================
-- Storage bucket for uploaded class files (private; 100 MB cap).
-- Recordings are expected to be shared as links rather than uploaded here.
-- ============================================================================
insert into storage.buckets (id, name, public, file_size_limit)
values (
  'tutor-resources',
  'tutor-resources',
  false,
  104857600  -- 100 MB
)
on conflict (id) do nothing;

-- Tutors may upload into their own folder: tutor-resources/<tutor_id>/<file>.
-- Download access is brokered server-side via signed URLs (service role), so no
-- client-side SELECT policy is required.
drop policy if exists "Tutors upload class resources" on storage.objects;
create policy "Tutors upload class resources" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'tutor-resources'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (select 1 from public.profiles where id = auth.uid() and is_tutor = true)
  );
