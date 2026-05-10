-- ─────────────────────────────────────────────────────────────────────────────
-- DIAGNOSTIC ASSESSMENTS — MIGRATION
-- Run in Supabase SQL editor (safe to re-run, idempotent)
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists pgcrypto;

-- =========================
-- DIAGNOSTIC ASSESSMENTS
-- =========================
create table if not exists public.diagnostic_assessments (
  id                uuid primary key default gen_random_uuid(),
  token             text unique not null default encode(gen_random_bytes(16), 'hex'),
  tutor_id          uuid not null references public.profiles(id) on delete cascade,
  student_name      text,
  year_level        text not null,
  subjects          jsonb not null default '[]',
  questions         jsonb not null default '[]',
  status            text not null default 'pending' check (status in ('pending', 'completed')),
  pre_call_form_url text,
  created_at        timestamptz default now(),
  completed_at      timestamptz,
  submitted_by_name text,
  student_answers   jsonb,
  report            jsonb,
  score_total       integer,
  score_max         integer default 30
);

-- RLS
alter table public.diagnostic_assessments enable row level security;

-- Tutors can see their own assessments
drop policy if exists "tutors_select_own_diagnostics" on public.diagnostic_assessments;
create policy "tutors_select_own_diagnostics" on public.diagnostic_assessments
  for select using (tutor_id = auth.uid());

-- Tutors can insert
drop policy if exists "tutors_insert_diagnostics" on public.diagnostic_assessments;
create policy "tutors_insert_diagnostics" on public.diagnostic_assessments
  for insert with check (tutor_id = auth.uid());

-- Tutors can update their own
drop policy if exists "tutors_update_own_diagnostics" on public.diagnostic_assessments;
create policy "tutors_update_own_diagnostics" on public.diagnostic_assessments
  for update using (tutor_id = auth.uid());

-- Service role (backend API) bypasses RLS — no extra policy needed.
-- The public GET /diagnostic/:token endpoint uses service key to read by token.
