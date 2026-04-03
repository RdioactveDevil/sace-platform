-- ─────────────────────────────────────────────────────────────────────────────
-- SACE PLATFORM — Supabase Schema
-- Run this entire file in your Supabase SQL Editor (supabase.com → SQL Editor)
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. USER PROFILES
-- Extends Supabase auth.users with display name, XP, streaks etc.
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

-- Auto-create profile when user signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', 'Student'));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 2. QUESTIONS
-- Pre-generated question bank (you populate this from past papers)
create table if not exists public.questions (
  id           text primary key,          -- e.g. "chem_001"
  subject      text not null default 'Chemistry',
  topic        text not null,             -- e.g. "Organic Chemistry"
  subtopic     text not null,             -- e.g. "Functional Groups"
  difficulty   integer not null check (difficulty between 1 and 5),
  question     text not null,
  options      jsonb not null,            -- ["A","B","C","D"]
  answer_index integer not null,          -- 0-based
  solution     text not null,
  tip          text,
  sace_code    text,                      -- e.g. "OC1" for SACE descriptor
  created_at   timestamptz default now()
);

-- 3. STRUGGLE PROFILES
-- One row per user per question — the core adaptive engine
create table if not exists public.struggle_profiles (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  question_id  text not null references public.questions(id) on delete cascade,
  attempts     integer not null default 0,
  wrong        integer not null default 0,
  last_seen    timestamptz default now(),
  next_review  timestamptz default now(), -- spaced repetition target date
  unique(user_id, question_id)
);

-- 4. SESSIONS
-- Each practice session, for analytics and weekly summaries
create table if not exists public.sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  subject      text not null default 'Chemistry',
  questions_attempted integer default 0,
  questions_correct   integer default 0,
  xp_earned    integer default 0,
  started_at   timestamptz default now(),
  ended_at     timestamptz
);

-- 5. ANSWER LOG
-- Every individual answer, for detailed analytics later
create table if not exists public.answer_log (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  session_id   uuid references public.sessions(id) on delete cascade,
  question_id  text not null,
  selected     integer not null,
  correct      boolean not null,
  time_taken_ms integer,
  answered_at  timestamptz default now()
);

-- ─── ROW LEVEL SECURITY ───────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.struggle_profiles enable row level security;
alter table public.sessions enable row level security;
alter table public.answer_log enable row level security;

-- Profiles: users can read all (for leaderboard), only update own
create policy "profiles_read_all"   on public.profiles for select using (true);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);

-- Struggle profiles: only own data
create policy "struggle_own" on public.struggle_profiles
  for all using (auth.uid() = user_id);

-- Sessions: only own data
create policy "sessions_own" on public.sessions
  for all using (auth.uid() = user_id);

-- Answer log: only own data
create policy "answers_own" on public.answer_log
  for all using (auth.uid() = user_id);

-- Questions: everyone can read
alter table public.questions enable row level security;
create policy "questions_read_all" on public.questions for select using (true);

-- ─── LEADERBOARD VIEW ────────────────────────────────────────────────────────
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

-- ─── SAMPLE CHEMISTRY QUESTIONS ──────────────────────────────────────────────
-- Starter bank — replace/extend with your past-paper extractions
insert into public.questions (id, topic, subtopic, difficulty, question, options, answer_index, solution, tip, sace_code)
values
('chem_001','Atomic Theory','Electronic Configuration',1,
 'What is the electronic configuration of a neutral carbon atom?',
 '["1s² 2s² 2p²","1s² 2s² 2p⁴","1s² 2s¹ 2p³","1s² 2s² 2p⁶"]',
 0,'Carbon has 6 electrons. Fill orbitals in order: 1s²(2) 2s²(2) 2p²(2).','Remember the Aufbau principle: fill lowest energy orbitals first.','AT1'),

('chem_002','Atomic Theory','Isotopes',2,
 'Carbon-14 has how many neutrons?',
 '["6","8","14","12"]',
 1,'Mass number = protons + neutrons. Carbon has 6 protons. 14 − 6 = 8 neutrons.','Neutrons = mass number minus atomic number.','AT2'),

('chem_003','Compounds & Reactions','Types of Reactions',2,
 'Which of these is a redox reaction?',
 '["NaCl + AgNO₃ → AgCl + NaNO₃","Mg + 2HCl → MgCl₂ + H₂","NaOH + HCl → NaCl + H₂O","CaCO₃ → CaO + CO₂"]',
 1,'Mg is oxidised (0→+2), H is reduced (+1→0). Electron transfer = redox.','If oxidation states change, it''s redox.','CR1'),

('chem_004','Acid/Base Chemistry','pH Calculations',3,
 'What is the pH of a 0.01 mol/L HCl solution?',
 '["1","2","3","7"]',
 1,'HCl is a strong acid, fully dissociates. [H⁺]=0.01=10⁻². pH=−log(10⁻²)=2.','pH = −log[H⁺]. Strong acids fully dissociate.','AB1'),

('chem_005','Acid/Base Chemistry','Buffers',4,
 'A buffer solution resists pH change because it contains:',
 '["Only a strong acid","A weak acid and its conjugate base","Equal amounts of two strong acids","Only pure water"]',
 1,'Buffers use the weak acid to neutralise added base, and conjugate base to neutralise added acid.','Weak acid + conjugate base = buffer. This is the Henderson–Hasselbalch setup.','AB2'),

('chem_006','Organic Chemistry','Functional Groups',1,
 'Which functional group is present in ethanol (CH₃CH₂OH)?',
 '["Carboxyl","Hydroxyl","Carbonyl","Amino"]',
 1,'The –OH group is a hydroxyl group, present in all alcohols.','–OH = hydroxyl = alcohol family.','OC1'),

('chem_007','Organic Chemistry','Naming',2,
 'What is the IUPAC name for CH₃CH₂CH₂COOH?',
 '["Propanoic acid","Butanoic acid","Pentanoic acid","Ethanoic acid"]',
 1,'4 carbons including the carboxyl carbon = butane chain → butanoic acid.','Count ALL carbons including the one in –COOH.','OC2'),

('chem_008','Organic Chemistry','Reactions',3,
 'What type of reaction occurs when ethanol reacts with ethanoic acid to form ethyl ethanoate?',
 '["Addition","Substitution","Esterification","Saponification"]',
 2,'Alcohol + carboxylic acid → ester + water. This is esterification (a condensation reaction).','Acid + alcohol → ester. Always produces water as a byproduct.','OC3'),

('chem_009','Rates & Equilibrium','Le Chatelier''s Principle',3,
 'For N₂(g) + 3H₂(g) ⇌ 2NH₃(g), increasing pressure shifts equilibrium:',
 '["Left, towards more moles of gas","Right, towards fewer moles of gas","No effect","Right, because NH₃ is more stable"]',
 1,'Left side: 4 moles gas. Right side: 2 moles. Increasing pressure favours fewer moles → shifts right.','Increased pressure → shift toward fewer moles of gas.','RE1'),

('chem_010','Rates & Equilibrium','Equilibrium Constants',4,
 'For the reaction A + 2B ⇌ C, what is the correct expression for Keq?',
 '["[A][B]²/[C]","[C]/[A][B]","[C]/[A][B]²","[A][B]/[C]²"]',
 2,'Keq = products over reactants, each raised to stoichiometric coefficient. [C]¹/([A]¹[B]²).','Coefficients become powers in the Keq expression.','RE2'),

('chem_011','Redox & Electrochemistry','Oxidation States',2,
 'What is the oxidation state of sulfur in H₂SO₄?',
 '["+4","+6","+2","-2"]',
 1,'H₂SO₄: 2(+1) + S + 4(−2) = 0 → 2 + S − 8 = 0 → S = +6.','Set up the equation: all oxidation states sum to overall charge.','RX1'),

('chem_012','Redox & Electrochemistry','Galvanic Cells',4,
 'In a galvanic cell, oxidation occurs at the:',
 '["Cathode","Anode","Salt bridge","Electrolyte"]',
 1,'Oxidation = Anode. Reduction = Cathode. Remember: AN OX, RED CAT.','AN OX RED CAT — Anode Oxidation, Reduction Cathode.','RX2'),

('chem_013','Measurement','Significant Figures',1,
 'How many significant figures are in 0.00450?',
 '["5","3","2","6"]',
 1,'Leading zeros are not significant. 4, 5, and the trailing 0 after 5 are significant = 3.','Leading zeros never count. Trailing zeros after a decimal point always count.','MD1'),

('chem_014','Measurement','Mole Calculations',2,
 'How many moles are in 44g of CO₂? (Molar mass = 44 g/mol)',
 '["44","0.5","2","1"]',
 3,'n = m/M = 44/44 = 1 mol.','n = m ÷ M. The three-way triangle: n, m, M.','MD2'),

('chem_015','Periodicity','Periodic Trends',2,
 'Which of these elements has the highest electronegativity?',
 '["Oxygen","Sodium","Fluorine","Chlorine"]',
 2,'Electronegativity increases across a period and up a group. Fluorine (top-right) is highest.','Electronegativity: up and to the right on the periodic table.','PT1')

on conflict (id) do nothing;
