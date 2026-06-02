-- Set generation_flags for built-in subjects seeded into the curricula table.
-- These subjects were seeded before generation_flags existed, so their flags are empty {}.
-- Now that all subjects read flags from DB, we need to set correct defaults.

update curricula set generation_flags = '{"graphs": true, "tables": true, "latex": true}'
  where name in ('Year 7 Mathematics', 'Year 10 Mathematics');

update curricula set generation_flags = '{"graphs": false, "tables": false, "latex": true}'
  where name in ('Chemistry Stage 1', 'Chemistry Stage 2');

update curricula set generation_flags = '{"graphs": false, "tables": false, "latex": false}'
  where name = 'Year 7 English';
