-- Seed: Victorian Select Entry curricula + starter question bank.
-- Generated from artifacts/gradefarm/src/lib/selectiveEntry.js (single source
-- of truth). Idempotent: safe to re-run. Makes the four selective components
-- real DB curricula so practice runs through the full adaptive quiz engine,
-- and seeds the starter bank so there is content from day one. AI generation
-- (admin or on-demand bank top-up) extends each subtopic from here.

-- ── Selective Reading Comprehension ──────────────────────────────────────────────────────
do $$
declare cid uuid; tid uuid;
begin
  select id into cid from curricula where name = 'Selective Reading Comprehension' limit 1;
  if cid is null then
    insert into curricula (name, level_label, subject_description, generation_flags, status)
    values ('Selective Reading Comprehension', 'Selective Entry', 'Reading Comprehension — Victorian Select Entry. Inference, main idea, vocabulary-in-context and author purpose across short passages.', '{}'::jsonb, 'live')
    returning id into cid;
  end if;
  select id into tid from curriculum_topics where curriculum_id = cid and name = 'Reading Comprehension' limit 1;
  if tid is null then
    insert into curriculum_topics (curriculum_id, name, order_index) values (cid, 'Reading Comprehension', 0) returning id into tid;
  end if;
  insert into curriculum_subtopics (topic_id, curriculum_id, name, order_index, gen_status, questions_generated)
  select tid, cid, v.name, v.ord, 'done', v.cnt
  from (values
      ('Vocabulary in context', 0, 2),
      ('Inference', 1, 2),
      ('Main idea & purpose', 2, 2),
      ('Detail & logic', 3, 2)
  ) as v(name, ord, cnt)
  where not exists (select 1 from curriculum_subtopics s where s.topic_id = tid and s.name = v.name);
end $$;

insert into questions (id, subject, topic, subtopic, difficulty, question, solution, question_type, options, answer_index, answer, tolerance, unit, items)
values ('se-rd-1', 'Selective Reading Comprehension', 'Reading Comprehension', 'Vocabulary in context', 2, 'Read the sentence: "The hikers were *elated* when they finally reached the summit after the gruelling climb." In this sentence, *elated* most nearly means:', 'Reaching the summit after a hard climb is a triumph, so "elated" means overjoyed/delighted.', 'mcq', '["exhausted","overjoyed","frightened","confused"]'::jsonb, 1, null, null, null, null)
on conflict (id) do nothing;
insert into questions (id, subject, topic, subtopic, difficulty, question, solution, question_type, options, answer_index, answer, tolerance, unit, items)
values ('se-rd-2', 'Selective Reading Comprehension', 'Reading Comprehension', 'Inference', 3, 'Passage: Maya checked her watch for the third time and tapped her foot. The bus was now twenty minutes late, and her interview started in fifteen. She pulled out her phone to book a taxi.

What can we best infer about Maya?', 'Checking her watch repeatedly, tapping her foot and booking a taxi all signal anxiety about being late.', 'mcq', '["She enjoys waiting for the bus","She is anxious about being late","She has cancelled her interview","She always travels by taxi"]'::jsonb, 1, null, null, null, null)
on conflict (id) do nothing;
insert into questions (id, subject, topic, subtopic, difficulty, question, solution, question_type, options, answer_index, answer, tolerance, unit, items)
values ('se-rd-3', 'Selective Reading Comprehension', 'Reading Comprehension', 'Main idea & purpose', 2, 'Passage: Honeybees share the location of food through a "waggle dance". The direction of the dance shows the angle to the food relative to the sun, while the length of the waggle shows the distance. Through this dance a single bee can guide the whole hive to a rich source of nectar.

The main idea of this passage is that:', 'Every sentence supports the central point: the waggle dance communicates the location of food.', 'mcq', '["Honeybees prefer nectar to pollen","Bees dance to entertain the hive","Bees use a dance to communicate where food is","The sun decides where bees build hives"]'::jsonb, 2, null, null, null, null)
on conflict (id) do nothing;
insert into questions (id, subject, topic, subtopic, difficulty, question, solution, question_type, options, answer_index, answer, tolerance, unit, items)
values ('se-rd-4', 'Selective Reading Comprehension', 'Reading Comprehension', 'Main idea & purpose', 3, 'Passage: Plastic waste is choking our oceans. Each year millions of tonnes wash into the sea, killing marine life and poisoning the food chain. We must act now — before it is too late.

The author''s main purpose is to:', 'Emotive language ("choking", "must act now") shows the author is persuading, not merely informing.', 'mcq', '["describe how plastic is manufactured","persuade readers to address plastic pollution","tell an entertaining story","compare oceans with rivers"]'::jsonb, 1, null, null, null, null)
on conflict (id) do nothing;
insert into questions (id, subject, topic, subtopic, difficulty, question, solution, question_type, options, answer_index, answer, tolerance, unit, items)
values ('se-rd-5', 'Selective Reading Comprehension', 'Reading Comprehension', 'Detail & logic', 1, 'Passage: The Wollemi pine was believed extinct for two million years, known only from fossils. Then, in 1994, a park ranger discovered a small grove of living trees in a remote canyon in Australia.

According to the passage, the living Wollemi pines were found:', 'The passage states the grove of living trees was discovered in 1994.', 'mcq', '["in a museum","in 1994","two million years ago","inside a fossil"]'::jsonb, 1, null, null, null, null)
on conflict (id) do nothing;
insert into questions (id, subject, topic, subtopic, difficulty, question, solution, question_type, options, answer_index, answer, tolerance, unit, items)
values ('se-rd-6', 'Selective Reading Comprehension', 'Reading Comprehension', 'Vocabulary in context', 3, 'Read: "Despite the *meagre* rations, the explorers pressed on." The word *meagre* most nearly means:', '"Despite" signals a hardship, and meagre rations are small/scarce supplies.', 'mcq', '["plentiful","scarce","delicious","frozen"]'::jsonb, 1, null, null, null, null)
on conflict (id) do nothing;
insert into questions (id, subject, topic, subtopic, difficulty, question, solution, question_type, options, answer_index, answer, tolerance, unit, items)
values ('se-rd-7', 'Selective Reading Comprehension', 'Reading Comprehension', 'Inference', 4, 'Passage: "Oh, wonderful," said Tom flatly, staring at the mountain of dishes in the sink. "Exactly how I wanted to spend my Saturday."

Tom most likely feels:', 'Saying "wonderful" *flatly* about a chore is verbal irony — Tom is being sarcastic and is annoyed.', 'mcq', '["genuinely delighted","sarcastic and annoyed","calm and grateful","surprised and excited"]'::jsonb, 1, null, null, null, null)
on conflict (id) do nothing;
insert into questions (id, subject, topic, subtopic, difficulty, question, solution, question_type, options, answer_index, answer, tolerance, unit, items)
values ('se-rd-8', 'Selective Reading Comprehension', 'Reading Comprehension', 'Detail & logic', 3, 'Passage: All members of the chess club must attend Friday practice. Priya is a member of the chess club.

Which conclusion must be true?', 'If all members must attend and Priya is a member, it follows that Priya must attend.', 'mcq', '["Priya dislikes chess","Priya must attend Friday practice","Priya is the best player in the club","Friday practice is optional"]'::jsonb, 1, null, null, null, null)
on conflict (id) do nothing;

-- ── Selective Verbal Reasoning ──────────────────────────────────────────────────────
do $$
declare cid uuid; tid uuid;
begin
  select id into cid from curricula where name = 'Selective Verbal Reasoning' limit 1;
  if cid is null then
    insert into curricula (name, level_label, subject_description, generation_flags, status)
    values ('Selective Verbal Reasoning', 'Selective Entry', 'Verbal Reasoning — Victorian Select Entry. Analogies, odd-one-out, synonyms and antonyms, codes and letter patterns.', '{}'::jsonb, 'live')
    returning id into cid;
  end if;
  select id into tid from curriculum_topics where curriculum_id = cid and name = 'Verbal Reasoning' limit 1;
  if tid is null then
    insert into curriculum_topics (curriculum_id, name, order_index) values (cid, 'Verbal Reasoning', 0) returning id into tid;
  end if;
  insert into curriculum_subtopics (topic_id, curriculum_id, name, order_index, gen_status, questions_generated)
  select tid, cid, v.name, v.ord, 'done', v.cnt
  from (values
      ('Analogies', 0, 3),
      ('Synonyms & antonyms', 1, 2),
      ('Odd one out', 2, 1),
      ('Codes & letter patterns', 3, 2)
  ) as v(name, ord, cnt)
  where not exists (select 1 from curriculum_subtopics s where s.topic_id = tid and s.name = v.name);
end $$;

insert into questions (id, subject, topic, subtopic, difficulty, question, solution, question_type, options, answer_index, answer, tolerance, unit, items)
values ('se-vb-1', 'Selective Verbal Reasoning', 'Verbal Reasoning', 'Analogies', 2, 'Choose the word that completes the analogy: Bird is to *flock* as wolf is to ___', 'A group of birds is a flock; a group of wolves is a pack.', 'mcq', '["pack","herd","school","swarm"]'::jsonb, 0, null, null, null, null)
on conflict (id) do nothing;
insert into questions (id, subject, topic, subtopic, difficulty, question, solution, question_type, options, answer_index, answer, tolerance, unit, items)
values ('se-vb-2', 'Selective Verbal Reasoning', 'Verbal Reasoning', 'Analogies', 3, '*Author* is to *book* as *composer* is to ___', 'An author creates a book; a composer creates a symphony.', 'mcq', '["orchestra","symphony","piano","audience"]'::jsonb, 1, null, null, null, null)
on conflict (id) do nothing;
insert into questions (id, subject, topic, subtopic, difficulty, question, solution, question_type, options, answer_index, answer, tolerance, unit, items)
values ('se-vb-3', 'Selective Verbal Reasoning', 'Verbal Reasoning', 'Odd one out', 2, 'Which word does NOT belong with the others?', 'Sparrow, eagle and robin are birds; a bat is a mammal.', 'mcq', '["Sparrow","Eagle","Bat","Robin"]'::jsonb, 2, null, null, null, null)
on conflict (id) do nothing;
insert into questions (id, subject, topic, subtopic, difficulty, question, solution, question_type, options, answer_index, answer, tolerance, unit, items)
values ('se-vb-4', 'Selective Verbal Reasoning', 'Verbal Reasoning', 'Synonyms & antonyms', 2, 'Choose the word closest in meaning to *abundant*.', '"Abundant" means existing in large quantities — plentiful.', 'mcq', '["rare","plentiful","empty","heavy"]'::jsonb, 1, null, null, null, null)
on conflict (id) do nothing;
insert into questions (id, subject, topic, subtopic, difficulty, question, solution, question_type, options, answer_index, answer, tolerance, unit, items)
values ('se-vb-5', 'Selective Verbal Reasoning', 'Verbal Reasoning', 'Synonyms & antonyms', 3, 'Choose the word most OPPOSITE in meaning to *expand*.', '"Expand" means to get bigger; its opposite is "contract".', 'mcq', '["grow","stretch","contract","widen"]'::jsonb, 2, null, null, null, null)
on conflict (id) do nothing;
insert into questions (id, subject, topic, subtopic, difficulty, question, solution, question_type, options, answer_index, answer, tolerance, unit, items)
values ('se-vb-6', 'Selective Verbal Reasoning', 'Verbal Reasoning', 'Codes & letter patterns', 3, 'Find the next pair in the series: AB, DE, GH, JK, ___', 'Each pair skips one letter: AB, (c) DE, (f) GH, (i) JK, (l) MN.', 'mcq', '["LM","MN","KL","NO"]'::jsonb, 1, null, null, null, null)
on conflict (id) do nothing;
insert into questions (id, subject, topic, subtopic, difficulty, question, solution, question_type, options, answer_index, answer, tolerance, unit, items)
values ('se-vb-7', 'Selective Verbal Reasoning', 'Verbal Reasoning', 'Codes & letter patterns', 4, 'In a code each letter is shifted forward by one (A→B, B→C, …). If FRIEND becomes GSJFOE, what does CAT become?', 'C→D, A→B, T→U, giving DBU.', 'mcq', '["DBU","DBT","EBV","CBU"]'::jsonb, 0, null, null, null, null)
on conflict (id) do nothing;
insert into questions (id, subject, topic, subtopic, difficulty, question, solution, question_type, options, answer_index, answer, tolerance, unit, items)
values ('se-vb-8', 'Selective Verbal Reasoning', 'Verbal Reasoning', 'Analogies', 2, '*Thermometer* is to *temperature* as *clock* is to ___', 'A thermometer measures temperature; a clock measures time.', 'mcq', '["speed","time","weight","distance"]'::jsonb, 1, null, null, null, null)
on conflict (id) do nothing;

-- ── Selective Numerical Reasoning ──────────────────────────────────────────────────────
do $$
declare cid uuid; tid uuid;
begin
  select id into cid from curricula where name = 'Selective Numerical Reasoning' limit 1;
  if cid is null then
    insert into curricula (name, level_label, subject_description, generation_flags, status)
    values ('Selective Numerical Reasoning', 'Selective Entry', 'Numerical Reasoning — Victorian Select Entry. Number sequences, patterns, ratios, averages and quantitative problem solving.', '{}'::jsonb, 'live')
    returning id into cid;
  end if;
  select id into tid from curriculum_topics where curriculum_id = cid and name = 'Numerical Reasoning' limit 1;
  if tid is null then
    insert into curriculum_topics (curriculum_id, name, order_index) values (cid, 'Numerical Reasoning', 0) returning id into tid;
  end if;
  insert into curriculum_subtopics (topic_id, curriculum_id, name, order_index, gen_status, questions_generated)
  select tid, cid, v.name, v.ord, 'done', v.cnt
  from (values
      ('Number sequences', 0, 2),
      ('Patterns', 1, 1),
      ('Ratios & proportion', 2, 3),
      ('Averages & data', 3, 2)
  ) as v(name, ord, cnt)
  where not exists (select 1 from curriculum_subtopics s where s.topic_id = tid and s.name = v.name);
end $$;

insert into questions (id, subject, topic, subtopic, difficulty, question, solution, question_type, options, answer_index, answer, tolerance, unit, items)
values ('se-nr-1', 'Selective Numerical Reasoning', 'Numerical Reasoning', 'Number sequences', 3, 'What is the next number in the sequence: 3, 6, 11, 18, 27, …?', 'The differences grow by 2 each time (+3, +5, +7, +9, +11), so 27 + 11 = 38.', 'numeric', null, null, 38, 0, null, null)
on conflict (id) do nothing;
insert into questions (id, subject, topic, subtopic, difficulty, question, solution, question_type, options, answer_index, answer, tolerance, unit, items)
values ('se-nr-2', 'Selective Numerical Reasoning', 'Numerical Reasoning', 'Number sequences', 2, 'What number is missing? 2, 4, 8, 16, __, 64', 'Each term doubles: 16 × 2 = 32.', 'numeric', null, null, 32, 0, null, null)
on conflict (id) do nothing;
insert into questions (id, subject, topic, subtopic, difficulty, question, solution, question_type, options, answer_index, answer, tolerance, unit, items)
values ('se-nr-3', 'Selective Numerical Reasoning', 'Numerical Reasoning', 'Patterns', 2, 'Which number completes the pattern: 1, 4, 9, 16, 25, ___?', 'These are square numbers (1², 2², 3², 4², 5²), so the next is 6² = 36.', 'mcq', '["30","36","35","49"]'::jsonb, 1, null, null, null, null)
on conflict (id) do nothing;
insert into questions (id, subject, topic, subtopic, difficulty, question, solution, question_type, options, answer_index, answer, tolerance, unit, items)
values ('se-nr-4', 'Selective Numerical Reasoning', 'Numerical Reasoning', 'Ratios & proportion', 2, 'A shop sold 120 ice creams on Monday and 25% more on Tuesday. How many did it sell on Tuesday?', '25% of 120 is 30, so Tuesday = 120 + 30 = 150.', 'numeric', null, null, 150, 0, null, null)
on conflict (id) do nothing;
insert into questions (id, subject, topic, subtopic, difficulty, question, solution, question_type, options, answer_index, answer, tolerance, unit, items)
values ('se-nr-5', 'Selective Numerical Reasoning', 'Numerical Reasoning', 'Ratios & proportion', 3, 'Half of a number is 18. What is one third of the same number?', 'If half the number is 18, the number is 36, and one third of 36 is 12.', 'numeric', null, null, 12, 0, null, null)
on conflict (id) do nothing;
insert into questions (id, subject, topic, subtopic, difficulty, question, solution, question_type, options, answer_index, answer, tolerance, unit, items)
values ('se-nr-6', 'Selective Numerical Reasoning', 'Numerical Reasoning', 'Averages & data', 4, 'The average of four numbers is 20. Three of them are 15, 22 and 18. What is the fourth number?', 'The four numbers total 4 × 20 = 80. The known three sum to 55, so the fourth is 80 − 55 = 25.', 'numeric', null, null, 25, 0, null, null)
on conflict (id) do nothing;
insert into questions (id, subject, topic, subtopic, difficulty, question, solution, question_type, options, answer_index, answer, tolerance, unit, items)
values ('se-nr-7', 'Selective Numerical Reasoning', 'Numerical Reasoning', 'Ratios & proportion', 3, 'In a class the ratio of girls to boys is 3 : 2. If there are 12 girls, how many boys are there?', '12 girls is 3 parts, so 1 part = 4. Boys are 2 parts = 8.', 'mcq', '["6","8","10","18"]'::jsonb, 1, null, null, null, null)
on conflict (id) do nothing;
insert into questions (id, subject, topic, subtopic, difficulty, question, solution, question_type, options, answer_index, answer, tolerance, unit, items)
values ('se-nr-8', 'Selective Numerical Reasoning', 'Numerical Reasoning', 'Averages & data', 2, 'If 3 pencils cost 90 cents, how much do 7 pencils cost, in cents?', 'One pencil costs 30 cents, so 7 pencils cost 7 × 30 = 210 cents.', 'numeric', null, null, 210, 0, null, null)
on conflict (id) do nothing;

-- ── Selective Mathematics ──────────────────────────────────────────────────────
do $$
declare cid uuid; tid uuid;
begin
  select id into cid from curricula where name = 'Selective Mathematics' limit 1;
  if cid is null then
    insert into curricula (name, level_label, subject_description, generation_flags, status)
    values ('Selective Mathematics', 'Selective Entry', 'Mathematics — Victorian Select Entry. Arithmetic, fractions, percentages, geometry, basic algebra and word problems.', '{}'::jsonb, 'live')
    returning id into cid;
  end if;
  select id into tid from curriculum_topics where curriculum_id = cid and name = 'Mathematics' limit 1;
  if tid is null then
    insert into curriculum_topics (curriculum_id, name, order_index) values (cid, 'Mathematics', 0) returning id into tid;
  end if;
  insert into curriculum_subtopics (topic_id, curriculum_id, name, order_index, gen_status, questions_generated)
  select tid, cid, v.name, v.ord, 'done', v.cnt
  from (values
      ('Number & percentages', 0, 3),
      ('Fractions & decimals', 1, 2),
      ('Geometry & measurement', 2, 1),
      ('Algebra & word problems', 3, 2)
  ) as v(name, ord, cnt)
  where not exists (select 1 from curriculum_subtopics s where s.topic_id = tid and s.name = v.name);
end $$;

insert into questions (id, subject, topic, subtopic, difficulty, question, solution, question_type, options, answer_index, answer, tolerance, unit, items)
values ('se-mt-1', 'Selective Mathematics', 'Mathematics', 'Number & percentages', 2, 'What is 15% of 240?', '10% of 240 is 24 and 5% is 12, so 15% = 36.', 'numeric', null, null, 36, 0, null, null)
on conflict (id) do nothing;
insert into questions (id, subject, topic, subtopic, difficulty, question, solution, question_type, options, answer_index, answer, tolerance, unit, items)
values ('se-mt-2', 'Selective Mathematics', 'Mathematics', 'Fractions & decimals', 3, 'Which fraction is the largest?', 'As decimals: 0.667, 0.600, 0.625, 0.583. The largest is 2/3.', 'mcq', '["$\\frac{2}{3}$","$\\frac{3}{5}$","$\\frac{5}{8}$","$\\frac{7}{12}$"]'::jsonb, 0, null, null, null, null)
on conflict (id) do nothing;
insert into questions (id, subject, topic, subtopic, difficulty, question, solution, question_type, options, answer_index, answer, tolerance, unit, items)
values ('se-mt-3', 'Selective Mathematics', 'Mathematics', 'Geometry & measurement', 1, 'A rectangle is 8 cm long and 5 cm wide. What is its area in square centimetres?', 'Area = length × width = 8 × 5 = 40 cm².', 'numeric', null, null, 40, 0, 'cm²', null)
on conflict (id) do nothing;
insert into questions (id, subject, topic, subtopic, difficulty, question, solution, question_type, options, answer_index, answer, tolerance, unit, items)
values ('se-mt-4', 'Selective Mathematics', 'Mathematics', 'Algebra & word problems', 2, 'Solve for $x$: $4x + 7 = 31$.', '$4x = 31 - 7 = 24$, so $x = 6$.', 'numeric', null, null, 6, 0, null, null)
on conflict (id) do nothing;
insert into questions (id, subject, topic, subtopic, difficulty, question, solution, question_type, options, answer_index, answer, tolerance, unit, items)
values ('se-mt-5', 'Selective Mathematics', 'Mathematics', 'Number & percentages', 3, 'A bag holds 4 red, 3 green and 5 blue marbles. What is the probability of drawing a green marble?', 'There are 12 marbles and 3 are green: 3/12 = 1/4.', 'mcq', '["$\\frac{1}{4}$","$\\frac{1}{3}$","$\\frac{3}{5}$","$\\frac{5}{12}$"]'::jsonb, 0, null, null, null, null)
on conflict (id) do nothing;
insert into questions (id, subject, topic, subtopic, difficulty, question, solution, question_type, options, answer_index, answer, tolerance, unit, items)
values ('se-mt-6', 'Selective Mathematics', 'Mathematics', 'Number & percentages', 3, 'A car travels 180 km in 2.5 hours. What is its average speed in km/h?', 'Speed = distance ÷ time = 180 ÷ 2.5 = 72 km/h.', 'numeric', null, null, 72, 0, 'km/h', null)
on conflict (id) do nothing;
insert into questions (id, subject, topic, subtopic, difficulty, question, solution, question_type, options, answer_index, answer, tolerance, unit, items)
values ('se-mt-7', 'Selective Mathematics', 'Mathematics', 'Algebra & word problems', 4, 'Sarah is twice as old as Tom. In 5 years, their combined age will be 40. How old is Tom now?', 'Let Tom be $t$ and Sarah $2t$. $(t+5)+(2t+5)=40 \Rightarrow 3t+10=40 \Rightarrow t=10$.', 'numeric', null, null, 10, 0, null, null)
on conflict (id) do nothing;
insert into questions (id, subject, topic, subtopic, difficulty, question, solution, question_type, options, answer_index, answer, tolerance, unit, items)
values ('se-mt-8', 'Selective Mathematics', 'Mathematics', 'Fractions & decimals', 3, 'Put these values in order from smallest to largest.', 'As decimals: 0.6, 0.667, 0.75, 0.8.', 'order', null, null, null, null, null, '["$0.6$","$\\frac{2}{3}$","$0.75$","$\\frac{4}{5}$"]'::jsonb)
on conflict (id) do nothing;

