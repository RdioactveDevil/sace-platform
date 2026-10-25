-- What each tutor plan includes, and parent progress reports.
--
-- Tutor plans (platform_settings.pricing.tutor_plans) gain:
--   subjects       – how many subjects the tutor can tutor in (999 = all)
--   recordings     – recording live lessons
--   parent_reports – the weekly progress email to a student's parent
-- A plan bought is recorded in tutor_billing with these as they were then
-- (like student_limit), plus the subjects the tutor has used so far. See
-- api-server/src/lib/tutor-plan.ts.
--
-- Parent reports: a tutor adds a parent's email to a student on their roster
-- (tutor_students.parent_email) and the automated email job sends the parent
-- a summary of the student's week every Sunday evening, Adelaide time
-- (lib/parent-reports.ts). parent_report_week is the last week sent, which
-- also claims the send; the parent's unsubscribe link sets
-- parent_reports_stopped_at.

set local lock_timeout = '10s';

alter table public.tutor_billing
  add column if not exists subject_limit integer,                 -- null = unlimited
  add column if not exists recordings boolean not null default true,
  add column if not exists parent_reports boolean not null default true,
  add column if not exists subjects text[] not null default '{}';

alter table public.tutor_students
  add column if not exists parent_email text,
  add column if not exists parent_name text,
  add column if not exists parent_report_week date,
  add column if not exists parent_reports_stopped_at timestamptz;

-- The plans on offer: Starter covers one subject without recordings or parent
-- reports, Pro three subjects with both, Agency everything. Keys an admin
-- already set are kept.
update public.platform_settings
  set value = jsonb_set(value, '{tutor_plans}', (
    select jsonb_agg(
      (case ord
         when 1 then '{"subjects": 1, "recordings": false, "parent_reports": false}'
         when 2 then '{"subjects": 3, "recordings": true, "parent_reports": true}'
         else '{"subjects": 999, "recordings": true, "parent_reports": true}'
       end)::jsonb || plan
      order by ord)
    from jsonb_array_elements(value -> 'tutor_plans') with ordinality as p(plan, ord)
  ))
  where key = 'pricing' and jsonb_typeof(value -> 'tutor_plans') = 'array';
