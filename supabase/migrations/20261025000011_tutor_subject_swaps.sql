-- Starter tutors can't swap their subjects.
--
-- Tutor plans (platform_settings.pricing.tutor_plans) gain subject_swaps:
-- whether a tutor can drop a subject from their plan to take another. Without
-- it (Starter) the subjects a tutor starts with are theirs until they upgrade
-- or an admin takes one off in Admin → Tutors. A plan bought is recorded in
-- tutor_billing with it, like its other limits (api-server/src/lib/tutor-plan.ts).

set local lock_timeout = '10s';

alter table public.tutor_billing
  add column if not exists subject_swaps boolean not null default true;

-- Starter (the first plan) can't swap; the others can. A value an admin
-- already set is kept.
update public.platform_settings
  set value = jsonb_set(value, '{tutor_plans}', (
    select jsonb_agg(
      (case when ord = 1 then '{"subject_swaps": false}' else '{"subject_swaps": true}' end)::jsonb || plan
      order by ord)
    from jsonb_array_elements(value -> 'tutor_plans') with ordinality as p(plan, ord)
  ))
  where key = 'pricing' and jsonb_typeof(value -> 'tutor_plans') = 'array';
