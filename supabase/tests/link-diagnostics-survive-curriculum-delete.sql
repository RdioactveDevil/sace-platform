-- Deleting a curriculum keeps tutors' link (prospect) diagnostics, unlinked,
-- and still drops students' own diagnostics on it.
--
-- Runs against a scratch Postgres with just the tables involved:
--   psql -v ON_ERROR_STOP=1 -f <this file> -v migration=<path to the migration>
-- Fails (raises) if a link diagnostic is lost.

create table curricula (id uuid primary key);
create table diagnostic_assessments (
  id uuid primary key,
  student_id uuid,
  curriculum_id uuid references curricula (id) on delete cascade,
  subtopic_ids uuid[] not null default '{}'
);

\i :migration

insert into curricula values ('00000000-0000-0000-0000-00000000000c');
insert into diagnostic_assessments (id, student_id, curriculum_id, subtopic_ids) values
  ('00000000-0000-0000-0000-0000000000a1', null, '00000000-0000-0000-0000-00000000000c', '{00000000-0000-0000-0000-0000000000f1}'),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-00000000000c', '{}');

delete from curricula where id = '00000000-0000-0000-0000-00000000000c';

do $$
begin
  if not exists (select 1 from diagnostic_assessments
                  where id = '00000000-0000-0000-0000-0000000000a1' and curriculum_id is null and subtopic_ids = '{}') then
    raise exception 'FAIL: the link diagnostic was lost or still linked';
  end if;
  if exists (select 1 from diagnostic_assessments where id = '00000000-0000-0000-0000-0000000000a2') then
    raise exception 'FAIL: the student''s own diagnostic should go with the curriculum';
  end if;
  raise notice 'PASS';
end $$;
