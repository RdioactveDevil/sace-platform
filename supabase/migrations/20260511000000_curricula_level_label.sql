-- Cohort label (Stage 1/2, Year 7–12) for managed curricula — required at creation in admin UI.
alter table public.curricula
  add column if not exists level_label text not null default '';

comment on column public.curricula.level_label is
  'Cohort for UI and subscriptions, e.g. Stage 2 or Year 10. Canonical subject string remains in name.';
