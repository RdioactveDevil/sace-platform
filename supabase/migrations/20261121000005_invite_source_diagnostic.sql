-- Signing a prospect up after a consultation call: the invite remembers the
-- prospect's diagnostic, and on accept it becomes the student's diagnostic for
-- that subject.
--
--   tutor_invites.source_diagnostic_id   the diagnostic the invite carries
--                                        across (null = none; set null if the
--                                        diagnostic is deleted)

set local lock_timeout = '10s';

alter table public.tutor_invites
  add column if not exists source_diagnostic_id uuid
    references public.diagnostic_assessments (id) on delete set null;

create index if not exists tutor_invites_source_diagnostic_idx
  on public.tutor_invites (source_diagnostic_id) where source_diagnostic_id is not null;
