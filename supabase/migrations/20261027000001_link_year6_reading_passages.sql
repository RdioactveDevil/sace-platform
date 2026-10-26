-- Year 6 question bank clean-up, part 2 (data only).
--
-- 1. Thirty Year 6 English reading questions were saved without their
--    passage, so students saw "In paragraph 2…" with nothing to read. They
--    came in six sets of five, each set with the same subtopic as one of six
--    passages that had no questions, and every phrase the questions quote is
--    in that passage. This links each set to its passage.
-- 2. A grammar question (t7d66u) called "outside" in "played outside happily"
--    a preposition; it's an adverb there, so no option was right. The
--    sentence now has a real preposition ("in the park"), which makes the
--    marked answer (1 of each) correct.
--
-- Every row is copied to backup.questions_fix_20261027 first (not exposed to
-- the API), so a change can be undone with an update from that table. Safe to
-- run twice.

create schema if not exists backup;
revoke all on schema backup from public, anon, authenticated;
create table if not exists backup.questions_fix_20261027 as select * from public.questions where false;
insert into backup.questions_fix_20261027 select * from public.questions where id in (
  'admin_1792655787808_iidd95','admin_1792655788634_eqh1fe','admin_1792655789355_w9lp04','admin_1792655790062_5a99e0','admin_1792655790791_gw1yv3',
  'admin_1792655791577_0ttz2y','admin_1792655792341_bj4x9k','admin_1792655793104_x8po6e','admin_1792655793889_utj9wj','admin_1792655794741_llxxra',
  'admin_1792655795543_pa9mj3','admin_1792655796295_667be5','admin_1792655796991_wu85lh','admin_1792655797695_tsm0be','admin_1792655798472_ehhbra',
  'admin_1792655799228_bnq8v4','admin_1792655800016_etovkw','admin_1792655800768_ig28rj','admin_1792655801496_psdrs8','admin_1792655802301_nddglq',
  'admin_1792655803037_rb0hp7','admin_1792655803793_w66ijz','admin_1792655804480_3ddu95','admin_1792655805203_a370l5','admin_1792655805979_kkyi2w',
  'admin_1792655806732_tuiiuw','admin_1792655807529_94tqyj','admin_1792655808252_v9clf5','admin_1792655809069_c699rb','admin_1792655809780_0smh5g',
  'ai_1792046062834_t7d66u'
) and id not in (select id from backup.questions_fix_20261027);

-- Letters from Wren Island (Theo's letter)
update public.questions set passage_id = '984e27e4-65f3-4054-9f3c-f873fe3065ff' where passage_id is null and id in (
  'admin_1792655787808_iidd95','admin_1792655788634_eqh1fe','admin_1792655789355_w9lp04','admin_1792655790062_5a99e0','admin_1792655790791_gw1yv3');
-- The Smallest Screw (Ellie and Mr Okafor)
update public.questions set passage_id = '6716d1d6-8db6-43b4-bafa-a5f619ba7522' where passage_id is null and id in (
  'admin_1792655791577_0ttz2y','admin_1792655792341_bj4x9k','admin_1792655793104_x8po6e','admin_1792655793889_utj9wj','admin_1792655794741_llxxra');
-- The Names Beneath the Paint (Leo and Grandad)
update public.questions set passage_id = '1c5a3acc-f808-40ad-be0b-a0c1a340def7' where passage_id is null and id in (
  'admin_1792655795543_pa9mj3','admin_1792655796295_667be5','admin_1792655796991_wu85lh','admin_1792655797695_tsm0be','admin_1792655798472_ehhbra');
-- The Girl Who Read the Cliffs (Mary Anning; the 2026-10-18 version)
update public.questions set passage_id = '96694750-1433-48ee-b511-f26917433529' where passage_id is null and id in (
  'admin_1792655799228_bnq8v4','admin_1792655800016_etovkw','admin_1792655800768_ig28rj','admin_1792655801496_psdrs8','admin_1792655802301_nddglq');
-- The Shed at the End of the Garden (poem)
update public.questions set passage_id = 'ba40f4ac-5387-4cd9-806d-61185911dd43' where passage_id is null and id in (
  'admin_1792655803037_rb0hp7','admin_1792655803793_w66ijz','admin_1792655804480_3ddu95','admin_1792655805203_a370l5','admin_1792655805979_kkyi2w');
-- The Quiet Partnership: Life on the Face of a Rock (lichens)
update public.questions set passage_id = '17f0a277-b0d3-47ac-9781-bff8550f9036' where passage_id is null and id in (
  'admin_1792655806732_tuiiuw','admin_1792655807529_94tqyj','admin_1792655808252_v9clf5','admin_1792655809069_c699rb','admin_1792655809780_0smh5g');

update public.questions set
  question = $F$Read this sentence: 'Although it was cold, the children played happily in the park.' How many prepositions, conjunctions and adverbs does it have?$F$,
  solution = $F$'Although' is a conjunction: it joins the clause 'it was cold' to the rest of the sentence. 'Happily' is an adverb: it tells us how the children played. 'In' is a preposition: it shows where they played ('in the park'). There are no others, so the sentence has 1 of each.$F$
where id = 'ai_1792046062834_t7d66u';
