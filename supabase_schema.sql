-- ─────────────────────────────────────────────────────────────────────────────
-- GRADEFARM / SACE PLATFORM — SUPABASE SCHEMA (IDEMPOTENT)
-- Safe to re-run on an existing database
-- ─────────────────────────────────────────────────────────────────────────────

-- =========================
-- EXTENSIONS
-- =========================
create extension if not exists pgcrypto;

-- =========================
-- PROFILES
-- =========================
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Student',
  school       text,
  xp           integer not null default 0,
  level        integer not null default 1,
  streak       integer not null default 0,
  best_streak  integer not null default 0,
  last_active  timestamptz,
  created_at   timestamptz default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', 'Student'))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =========================
-- QUESTIONS
-- =========================
create table if not exists public.questions (
  id           text primary key,
  subject      text not null default 'Chemistry',
  topic        text not null,
  subtopic     text not null,
  concept_tag  text,
  difficulty   integer not null check (difficulty between 1 and 5),
  question     text not null,
  options      jsonb not null,
  answer_index integer not null,
  solution     text not null,
  tip          text,
  sace_code    text,
  created_at   timestamptz default now()
);

alter table public.questions
  add column if not exists concept_tag text;

create index if not exists idx_questions_subject on public.questions(subject);
create index if not exists idx_questions_topic on public.questions(topic);
create index if not exists idx_questions_subtopic on public.questions(subtopic);
create index if not exists idx_questions_concept_tag on public.questions(concept_tag);

-- =========================
-- QUESTION VARIANTS (REMEDIATION)
-- =========================
create table if not exists public.question_variants (
  id                 uuid primary key default gen_random_uuid(),
  parent_question_id text not null references public.questions(id) on delete cascade,
  variant_type       text not null default 'direct',
  subject            text not null default 'Chemistry',
  topic              text not null,
  subtopic           text not null,
  concept_tag        text,
  difficulty         integer not null check (difficulty between 1 and 5),
  question           text not null,
  options            jsonb not null,
  answer_index       integer not null,
  solution           text not null,
  tip                text,
  source             text not null default 'prebuilt',
  usage_count        integer not null default 0,
  last_seen_at       timestamptz,
  created_at         timestamptz default now(),
  constraint question_variants_source_check check (source in ('prebuilt', 'ai_generated')),
  constraint question_variants_variant_type_check check (variant_type in ('direct', 'concept', 'generated'))
);

create index if not exists idx_qv_parent_question_id on public.question_variants(parent_question_id);
create index if not exists idx_qv_concept_tag on public.question_variants(concept_tag);
create index if not exists idx_qv_source on public.question_variants(source);
create index if not exists idx_qv_usage_count on public.question_variants(usage_count);

-- =========================
-- STRUGGLE PROFILES
-- =========================
create table if not exists public.struggle_profiles (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  question_id  text not null references public.questions(id) on delete cascade,
  attempts     integer not null default 0,
  wrong        integer not null default 0,
  last_seen    timestamptz default now(),
  next_review  timestamptz default now(),
  unique(user_id, question_id)
);

create index if not exists idx_struggle_user_id on public.struggle_profiles(user_id);
create index if not exists idx_struggle_question_id on public.struggle_profiles(question_id);

-- =========================
-- SESSIONS
-- =========================
create table if not exists public.sessions (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles(id) on delete cascade,
  subject             text not null default 'Chemistry',
  questions_attempted integer default 0,
  questions_correct   integer default 0,
  xp_earned           integer default 0,
  started_at          timestamptz default now(),
  ended_at            timestamptz
);

create index if not exists idx_sessions_user_id on public.sessions(user_id);

-- =========================
-- ANSWER LOG
-- =========================
create table if not exists public.answer_log (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  session_id    uuid references public.sessions(id) on delete cascade,
  question_id   text not null,
  selected      integer not null,
  correct       boolean not null,
  time_taken_ms integer,
  answered_at   timestamptz default now()
);

create index if not exists idx_answer_log_user_id on public.answer_log(user_id);
create index if not exists idx_answer_log_session_id on public.answer_log(session_id);
create index if not exists idx_answer_log_question_id on public.answer_log(question_id);

-- =========================
-- LEARN SESSIONS
-- =========================
create table if not exists public.learn_sessions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  topic      text not null,
  interests  text default 'sport',
  messages   jsonb not null default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_learn_sessions_user_id on public.learn_sessions(user_id);

-- =========================
-- RPC FUNCTIONS
-- =========================
create or replace function public.increment_xp(uid uuid, amount integer)
returns integer
language plpgsql
security definer
as $$
declare
  new_xp integer;
begin
  update public.profiles
  set xp = coalesce(xp, 0) + coalesce(amount, 0)
  where id = uid
  returning xp into new_xp;

  return coalesce(new_xp, 0);
end;
$$;

create or replace function public.increment_variant_usage(vid uuid)
returns void
language plpgsql
security definer
as $$
begin
  update public.question_variants
  set
    usage_count = coalesce(usage_count, 0) + 1,
    last_seen_at = now()
  where id = vid;
end;
$$;

-- =========================
-- RLS
-- =========================
alter table public.profiles enable row level security;
alter table public.questions enable row level security;
alter table public.question_variants enable row level security;
alter table public.struggle_profiles enable row level security;
alter table public.sessions enable row level security;
alter table public.answer_log enable row level security;
alter table public.learn_sessions enable row level security;

-- PROFILES
drop policy if exists "profiles_read_all" on public.profiles;
create policy "profiles_read_all"
  on public.profiles
  for select
  using (true);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles
  for update
  using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles
  for insert
  with check (auth.uid() = id);

-- QUESTIONS
drop policy if exists "questions_read_all" on public.questions;
create policy "questions_read_all"
  on public.questions
  for select
  using (true);

-- QUESTION VARIANTS
drop policy if exists "question_variants_read_all" on public.question_variants;
create policy "question_variants_read_all"
  on public.question_variants
  for select
  using (true);

drop policy if exists "question_variants_insert_authenticated" on public.question_variants;
create policy "question_variants_insert_authenticated"
  on public.question_variants
  for insert
  with check (auth.uid() is not null);

drop policy if exists "question_variants_update_authenticated" on public.question_variants;
create policy "question_variants_update_authenticated"
  on public.question_variants
  for update
  using (auth.uid() is not null);

-- STRUGGLE PROFILES
drop policy if exists "struggle_own" on public.struggle_profiles;
create policy "struggle_own"
  on public.struggle_profiles
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- SESSIONS
drop policy if exists "sessions_own" on public.sessions;
create policy "sessions_own"
  on public.sessions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ANSWER LOG
drop policy if exists "answers_own" on public.answer_log;
create policy "answers_own"
  on public.answer_log
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- LEARN SESSIONS
drop policy if exists "learn_sessions_own" on public.learn_sessions;
create policy "learn_sessions_own"
  on public.learn_sessions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- =========================
-- LEADERBOARD VIEW
-- =========================
create or replace view public.leaderboard as
select
  id,
  display_name,
  school,
  xp,
  level,
  streak,
  rank() over (order by xp desc) as position
from public.profiles
order by xp desc
limit 100;

-- =========================
-- SAMPLE QUESTIONS
-- =========================
insert into public.questions
  (id, subject, topic, subtopic, concept_tag, difficulty, question, options, answer_index, solution, tip, sace_code)
values
  (
    'chem_001',
    'Chemistry',
    'Atomic Theory',
    'Electronic Configuration',
    'chemistry|atomic theory|electronic configuration',
    1,
    'What is the electronic configuration of a neutral carbon atom?',
    '["1s² 2s² 2p²","1s² 2s² 2p⁴","1s² 2s¹ 2p³","1s² 2s² 2p⁶"]'::jsonb,
    0,
    'Carbon has 6 electrons. Fill orbitals in order: 1s², 2s², 2p².',
    'Remember the Aufbau principle: fill lowest energy orbitals first.',
    'AT1'
  ),
  (
    'chem_004',
    'Chemistry',
    'Acid/Base Chemistry',
    'pH Calculations',
    'chemistry|acid/base chemistry|ph calculations',
    3,
    'What is the pH of a 0.01 mol/L HCl solution?',
    '["1","2","3","7"]'::jsonb,
    1,
    'HCl is a strong acid, fully dissociates. [H⁺] = 0.01 = 10⁻², so pH = 2.',
    'pH = −log[H⁺]. Strong acids fully dissociate.',
    'AB1'
  ),
  (
    'chem_007',
    'Chemistry',
    'Organic Chemistry',
    'Naming',
    'chemistry|organic chemistry|naming',
    2,
    'What is the IUPAC name for CH₃CH₂CH₂COOH?',
    '["Propanoic acid","Butanoic acid","Pentanoic acid","Ethanoic acid"]'::jsonb,
    1,
    'There are 4 carbons including the carboxyl carbon, so the name is butanoic acid.',
    'Count all carbons including the carbon in –COOH.',
    'OC2'
  )
on conflict (id) do update set
  subject      = excluded.subject,
  topic        = excluded.topic,
  subtopic     = excluded.subtopic,
  concept_tag  = excluded.concept_tag,
  difficulty   = excluded.difficulty,
  question     = excluded.question,
  options      = excluded.options,
  answer_index = excluded.answer_index,
  solution     = excluded.solution,
  tip          = excluded.tip,
  sace_code    = excluded.sace_code;

-- =========================
-- SAMPLE REMEDIATION VARIANTS
-- =========================
insert into public.question_variants
  (parent_question_id, variant_type, subject, topic, subtopic, concept_tag, difficulty, question, options, answer_index, solution, tip, source)
values
  (
    'chem_004',
    'direct',
    'Chemistry',
    'Acid/Base Chemistry',
    'pH Calculations',
    'chemistry|acid/base chemistry|ph calculations',
    3,
    'What is the pH of a 0.001 mol/L HCl solution?',
    '["1","2","3","4"]'::jsonb,
    2,
    'HCl is a strong acid. [H⁺] = 10⁻³, so pH = 3.',
    'For powers of ten, the pH is the positive value of the exponent.',
    'prebuilt'
  ),
  (
    'chem_004',
    'direct',
    'Chemistry',
    'Acid/Base Chemistry',
    'pH Calculations',
    'chemistry|acid/base chemistry|ph calculations',
    3,
    'A strong acid has [H⁺] = 10⁻⁴ mol/L. What is its pH?',
    '["2","3","4","5"]'::jsonb,
    2,
    'pH = −log(10⁻⁴) = 4.',
    'Negative log turns 10⁻⁴ into 4.',
    'prebuilt'
  ),
  (
    'chem_007',
    'direct',
    'Chemistry',
    'Organic Chemistry',
    'Naming',
    'chemistry|organic chemistry|naming',
    2,
    'What is the IUPAC name for CH₃CH₂COOH?',
    '["Ethanoic acid","Propanoic acid","Butanoic acid","Pentanoic acid"]'::jsonb,
    1,
    'There are 3 carbons including the carboxyl carbon, so it is propanoic acid.',
    'Always count the acid carbon as part of the main chain.',
    'prebuilt'
  ),
  (
    'chem_007',
    'direct',
    'Chemistry',
    'Organic Chemistry',
    'Naming',
    'chemistry|organic chemistry|naming',
    2,
    'How many carbons are in the parent chain of CH₃CH₂CH₂COOH?',
    '["3","4","5","2"]'::jsonb,
    1,
    'The carboxyl carbon is included, giving a total of 4 carbons.',
    'The carbon in –COOH still counts.',
    'prebuilt'
  )
on conflict do nothing;