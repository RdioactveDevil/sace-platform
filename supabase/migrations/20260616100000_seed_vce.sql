-- Seed: VCE (Units 3 & 4) curricula + starter question bank.
-- Generated from artifacts/gradefarm/src/lib/vce.js (single source of truth).
-- Idempotent: safe to re-run. Makes the core VCE subjects real DB curricula
-- so practice runs through the full adaptive quiz engine (Subject Picker →
-- quiz), and seeds a starter bank per subtopic so there is content from day
-- one. AI generation (admin or on-demand bank top-up) extends from here.

-- ── VCE Chemistry ──────────────────────────────────────────────────────
do $$
declare cid uuid; tid uuid;
begin
  select id into cid from curricula where name = 'VCE Chemistry' limit 1;
  if cid is null then
    insert into curricula (name, level_label, subject_description, generation_flags, status)
    values ('VCE Chemistry', 'Units 3 & 4', 'VCE Chemistry (Units 3 & 4). Redox & electrochemistry, organic chemistry, reaction rates and energy.', '{}'::jsonb, 'live')
    returning id into cid;
  end if;
  -- topic: Redox reactions and electrochemistry
  select id into tid from curriculum_topics where curriculum_id = cid and name = 'Redox reactions and electrochemistry' limit 1;
  if tid is null then
    insert into curriculum_topics (curriculum_id, name, order_index) values (cid, 'Redox reactions and electrochemistry', 0) returning id into tid;
  end if;
  insert into curriculum_subtopics (topic_id, curriculum_id, name, order_index, gen_status, questions_generated)
  select tid, cid, v.name, v.ord, 'done', v.cnt
  from (values
      ('Galvanic cells', 0, 1),
      ('Electrolysis', 1, 1)
  ) as v(name, ord, cnt)
  where not exists (select 1 from curriculum_subtopics s where s.topic_id = tid and s.name = v.name);
  -- topic: Organic chemistry
  select id into tid from curriculum_topics where curriculum_id = cid and name = 'Organic chemistry' limit 1;
  if tid is null then
    insert into curriculum_topics (curriculum_id, name, order_index) values (cid, 'Organic chemistry', 1) returning id into tid;
  end if;
  insert into curriculum_subtopics (topic_id, curriculum_id, name, order_index, gen_status, questions_generated)
  select tid, cid, v.name, v.ord, 'done', v.cnt
  from (values
      ('Functional groups', 0, 1),
      ('Reaction pathways', 1, 1)
  ) as v(name, ord, cnt)
  where not exists (select 1 from curriculum_subtopics s where s.topic_id = tid and s.name = v.name);
  -- topic: Rates and energy
  select id into tid from curriculum_topics where curriculum_id = cid and name = 'Rates and energy' limit 1;
  if tid is null then
    insert into curriculum_topics (curriculum_id, name, order_index) values (cid, 'Rates and energy', 2) returning id into tid;
  end if;
  insert into curriculum_subtopics (topic_id, curriculum_id, name, order_index, gen_status, questions_generated)
  select tid, cid, v.name, v.ord, 'done', v.cnt
  from (values
      ('Calorimetry', 0, 1),
      ('Equilibrium', 1, 1)
  ) as v(name, ord, cnt)
  where not exists (select 1 from curriculum_subtopics s where s.topic_id = tid and s.name = v.name);
end $$;

insert into questions (id, subject, topic, subtopic, difficulty, question, solution, question_type, options, answer_index, answer, tolerance, unit, items)
values ('vce-chem-1', 'VCE Chemistry', 'Redox reactions and electrochemistry', 'Galvanic cells', 2, 'In a galvanic (voltaic) cell, oxidation takes place at the:', 'Oxidation always occurs at the anode (in a galvanic cell the anode is the negative electrode).', 'mcq', '["anode","cathode","salt bridge","electrolyte"]'::jsonb, 0, null, null, null, null)
on conflict (id) do nothing;
insert into questions (id, subject, topic, subtopic, difficulty, question, solution, question_type, options, answer_index, answer, tolerance, unit, items)
values ('vce-chem-2', 'VCE Chemistry', 'Redox reactions and electrochemistry', 'Electrolysis', 4, 'A current of 5.0 A is passed through molten NaCl for 1930 s. Calculate the amount of charge that passes, in coulombs (Q = It).', 'Q = I × t = 5.0 × 1930 = 9650 C.', 'numeric', null, null, 9650, 5, 'C', null)
on conflict (id) do nothing;
insert into questions (id, subject, topic, subtopic, difficulty, question, solution, question_type, options, answer_index, answer, tolerance, unit, items)
values ('vce-chem-3', 'VCE Chemistry', 'Organic chemistry', 'Functional groups', 2, 'Which functional group characterises a carboxylic acid?', 'A carboxylic acid contains the carboxyl group, –COOH.', 'mcq', '["hydroxyl, –OH","carboxyl, –COOH","carbonyl, –CHO","amino, –NH₂"]'::jsonb, 1, null, null, null, null)
on conflict (id) do nothing;
insert into questions (id, subject, topic, subtopic, difficulty, question, solution, question_type, options, answer_index, answer, tolerance, unit, items)
values ('vce-chem-4', 'VCE Chemistry', 'Organic chemistry', 'Reaction pathways', 3, 'Reacting an alkene with water (steam) in the presence of an acid catalyst to form an alcohol is an example of a(n):', 'The C=C double bond opens and water adds across it — hydration is an addition reaction.', 'mcq', '["addition reaction","substitution reaction","condensation reaction","oxidation reaction"]'::jsonb, 0, null, null, null, null)
on conflict (id) do nothing;
insert into questions (id, subject, topic, subtopic, difficulty, question, solution, question_type, options, answer_index, answer, tolerance, unit, items)
values ('vce-chem-5', 'VCE Chemistry', 'Rates and energy', 'Calorimetry', 3, '100 g of water (c = 4.18 J g⁻¹ °C⁻¹) is heated from 25 °C to 55 °C. Calculate the energy absorbed, in kJ (q = mcΔT).', 'q = 100 × 4.18 × 30 = 12 540 J = 12.54 kJ.', 'numeric', null, null, 12.54, 0.2, 'kJ', null)
on conflict (id) do nothing;
insert into questions (id, subject, topic, subtopic, difficulty, question, solution, question_type, options, answer_index, answer, tolerance, unit, items)
values ('vce-chem-6', 'VCE Chemistry', 'Rates and energy', 'Equilibrium', 3, 'For the exothermic forward reaction N₂ + 3H₂ ⇌ 2NH₃, increasing the temperature shifts the equilibrium position towards the:', 'By Le Chatelier, raising temperature favours the endothermic (reverse) direction, shifting equilibrium left.', 'mcq', '["reactants (left)","products (right)","it does not shift","solid phase"]'::jsonb, 0, null, null, null, null)
on conflict (id) do nothing;

-- ── VCE Physics ──────────────────────────────────────────────────────
do $$
declare cid uuid; tid uuid;
begin
  select id into cid from curricula where name = 'VCE Physics' limit 1;
  if cid is null then
    insert into curricula (name, level_label, subject_description, generation_flags, status)
    values ('VCE Physics', 'Units 3 & 4', 'VCE Physics (Units 3 & 4). Fields, motion, momentum and energy, light and matter.', '{}'::jsonb, 'live')
    returning id into cid;
  end if;
  -- topic: Fields
  select id into tid from curriculum_topics where curriculum_id = cid and name = 'Fields' limit 1;
  if tid is null then
    insert into curriculum_topics (curriculum_id, name, order_index) values (cid, 'Fields', 0) returning id into tid;
  end if;
  insert into curriculum_subtopics (topic_id, curriculum_id, name, order_index, gen_status, questions_generated)
  select tid, cid, v.name, v.ord, 'done', v.cnt
  from (values
      ('Gravitational fields', 0, 1),
      ('Magnetic fields', 1, 1)
  ) as v(name, ord, cnt)
  where not exists (select 1 from curriculum_subtopics s where s.topic_id = tid and s.name = v.name);
  -- topic: Motion
  select id into tid from curriculum_topics where curriculum_id = cid and name = 'Motion' limit 1;
  if tid is null then
    insert into curriculum_topics (curriculum_id, name, order_index) values (cid, 'Motion', 1) returning id into tid;
  end if;
  insert into curriculum_subtopics (topic_id, curriculum_id, name, order_index, gen_status, questions_generated)
  select tid, cid, v.name, v.ord, 'done', v.cnt
  from (values
      ('Projectile motion', 0, 1),
      ('Momentum and energy', 1, 1)
  ) as v(name, ord, cnt)
  where not exists (select 1 from curriculum_subtopics s where s.topic_id = tid and s.name = v.name);
  -- topic: Light and matter
  select id into tid from curriculum_topics where curriculum_id = cid and name = 'Light and matter' limit 1;
  if tid is null then
    insert into curriculum_topics (curriculum_id, name, order_index) values (cid, 'Light and matter', 2) returning id into tid;
  end if;
  insert into curriculum_subtopics (topic_id, curriculum_id, name, order_index, gen_status, questions_generated)
  select tid, cid, v.name, v.ord, 'done', v.cnt
  from (values
      ('Photoelectric effect', 0, 1),
      ('Interference', 1, 1)
  ) as v(name, ord, cnt)
  where not exists (select 1 from curriculum_subtopics s where s.topic_id = tid and s.name = v.name);
end $$;

insert into questions (id, subject, topic, subtopic, difficulty, question, solution, question_type, options, answer_index, answer, tolerance, unit, items)
values ('vce-phys-1', 'VCE Physics', 'Fields', 'Gravitational fields', 1, 'A 2.0 kg mass sits in a gravitational field of strength 9.8 N kg⁻¹. Calculate the gravitational force on it, in N (F = mg).', 'F = mg = 2.0 × 9.8 = 19.6 N.', 'numeric', null, null, 19.6, 0.2, 'N', null)
on conflict (id) do nothing;
insert into questions (id, subject, topic, subtopic, difficulty, question, solution, question_type, options, answer_index, answer, tolerance, unit, items)
values ('vce-phys-2', 'VCE Physics', 'Fields', 'Magnetic fields', 2, 'A charged particle moves parallel to a uniform magnetic field. The magnetic force on the particle is:', 'F = qvB sinθ; when motion is parallel to B, θ = 0 and sinθ = 0, so the force is zero.', 'mcq', '["zero","maximum","directed along its motion","directed opposite to its motion"]'::jsonb, 0, null, null, null, null)
on conflict (id) do nothing;
insert into questions (id, subject, topic, subtopic, difficulty, question, solution, question_type, options, answer_index, answer, tolerance, unit, items)
values ('vce-phys-3', 'VCE Physics', 'Motion', 'Projectile motion', 3, 'A ball is launched horizontally from a height of 20 m (g = 9.8 m s⁻²). How long does it take to reach the ground, in seconds? (t = √(2h/g))', 't = √(2 × 20 / 9.8) = √4.08 ≈ 2.02 s.', 'numeric', null, null, 2.02, 0.1, 's', null)
on conflict (id) do nothing;
insert into questions (id, subject, topic, subtopic, difficulty, question, solution, question_type, options, answer_index, answer, tolerance, unit, items)
values ('vce-phys-4', 'VCE Physics', 'Motion', 'Momentum and energy', 1, 'A 1500 kg car travels at 20 m s⁻¹. Calculate its momentum, in kg m s⁻¹ (p = mv).', 'p = mv = 1500 × 20 = 30 000 kg m s⁻¹.', 'numeric', null, null, 30000, 0, 'kg m s⁻¹', null)
on conflict (id) do nothing;
insert into questions (id, subject, topic, subtopic, difficulty, question, solution, question_type, options, answer_index, answer, tolerance, unit, items)
values ('vce-phys-5', 'VCE Physics', 'Light and matter', 'Photoelectric effect', 3, 'In a photoelectric experiment, increasing the intensity of light (at a fixed frequency above the threshold) increases the:', 'Greater intensity means more photons per second, so more photoelectrons; max KE depends only on frequency.', 'mcq', '["number of photoelectrons emitted per second","maximum kinetic energy of photoelectrons","work function of the metal","threshold frequency"]'::jsonb, 0, null, null, null, null)
on conflict (id) do nothing;
insert into questions (id, subject, topic, subtopic, difficulty, question, solution, question_type, options, answer_index, answer, tolerance, unit, items)
values ('vce-phys-6', 'VCE Physics', 'Light and matter', 'Interference', 3, 'In Young’s double-slit experiment, destructive interference (dark fringes) occurs where the path difference equals:', 'Dark fringes occur at path differences of a half-integer number of wavelengths, (n + ½)λ.', 'mcq', '["nλ","(n + ½)λ","2nλ","λ ⁄ n"]'::jsonb, 1, null, null, null, null)
on conflict (id) do nothing;

-- ── VCE Biology ──────────────────────────────────────────────────────
do $$
declare cid uuid; tid uuid;
begin
  select id into cid from curricula where name = 'VCE Biology' limit 1;
  if cid is null then
    insert into curricula (name, level_label, subject_description, generation_flags, status)
    values ('VCE Biology', 'Units 3 & 4', 'VCE Biology (Units 3 & 4). Molecular biology, energy in cells, immunity and change over time.', '{}'::jsonb, 'live')
    returning id into cid;
  end if;
  -- topic: Molecular biology
  select id into tid from curriculum_topics where curriculum_id = cid and name = 'Molecular biology' limit 1;
  if tid is null then
    insert into curriculum_topics (curriculum_id, name, order_index) values (cid, 'Molecular biology', 0) returning id into tid;
  end if;
  insert into curriculum_subtopics (topic_id, curriculum_id, name, order_index, gen_status, questions_generated)
  select tid, cid, v.name, v.ord, 'done', v.cnt
  from (values
      ('Nucleic acids and proteins', 0, 1),
      ('Enzymes', 1, 1)
  ) as v(name, ord, cnt)
  where not exists (select 1 from curriculum_subtopics s where s.topic_id = tid and s.name = v.name);
  -- topic: Energy in cells
  select id into tid from curriculum_topics where curriculum_id = cid and name = 'Energy in cells' limit 1;
  if tid is null then
    insert into curriculum_topics (curriculum_id, name, order_index) values (cid, 'Energy in cells', 1) returning id into tid;
  end if;
  insert into curriculum_subtopics (topic_id, curriculum_id, name, order_index, gen_status, questions_generated)
  select tid, cid, v.name, v.ord, 'done', v.cnt
  from (values
      ('Photosynthesis', 0, 1),
      ('Cellular respiration', 1, 1)
  ) as v(name, ord, cnt)
  where not exists (select 1 from curriculum_subtopics s where s.topic_id = tid and s.name = v.name);
  -- topic: Immunity and change
  select id into tid from curriculum_topics where curriculum_id = cid and name = 'Immunity and change' limit 1;
  if tid is null then
    insert into curriculum_topics (curriculum_id, name, order_index) values (cid, 'Immunity and change', 2) returning id into tid;
  end if;
  insert into curriculum_subtopics (topic_id, curriculum_id, name, order_index, gen_status, questions_generated)
  select tid, cid, v.name, v.ord, 'done', v.cnt
  from (values
      ('Immune response', 0, 1),
      ('Natural selection', 1, 1)
  ) as v(name, ord, cnt)
  where not exists (select 1 from curriculum_subtopics s where s.topic_id = tid and s.name = v.name);
end $$;

insert into questions (id, subject, topic, subtopic, difficulty, question, solution, question_type, options, answer_index, answer, tolerance, unit, items)
values ('vce-bio-1', 'VCE Biology', 'Molecular biology', 'Nucleic acids and proteins', 2, 'The synthesis of a messenger RNA molecule using a DNA template is called:', 'Transcription produces mRNA from a DNA template; translation then builds the protein.', 'mcq', '["transcription","translation","replication","transformation"]'::jsonb, 0, null, null, null, null)
on conflict (id) do nothing;
insert into questions (id, subject, topic, subtopic, difficulty, question, solution, question_type, options, answer_index, answer, tolerance, unit, items)
values ('vce-bio-2', 'VCE Biology', 'Molecular biology', 'Enzymes', 2, 'Enzymes increase the rate of a biochemical reaction by:', 'Enzymes provide an alternative pathway with a lower activation energy; they are not consumed.', 'mcq', '["lowering the activation energy","raising the activation energy","increasing the temperature","being consumed in the reaction"]'::jsonb, 0, null, null, null, null)
on conflict (id) do nothing;
insert into questions (id, subject, topic, subtopic, difficulty, question, solution, question_type, options, answer_index, answer, tolerance, unit, items)
values ('vce-bio-3', 'VCE Biology', 'Energy in cells', 'Photosynthesis', 3, 'In the light-dependent stage of photosynthesis, the source of electrons that replaces those lost by chlorophyll is:', 'Photolysis splits water, supplying electrons (and releasing O₂ as a by-product).', 'mcq', '["water","carbon dioxide","glucose","oxygen"]'::jsonb, 0, null, null, null, null)
on conflict (id) do nothing;
insert into questions (id, subject, topic, subtopic, difficulty, question, solution, question_type, options, answer_index, answer, tolerance, unit, items)
values ('vce-bio-4', 'VCE Biology', 'Energy in cells', 'Cellular respiration', 3, 'In aerobic cellular respiration, the final electron acceptor in the electron transport chain is:', 'Oxygen accepts electrons at the end of the chain, forming water.', 'mcq', '["oxygen","carbon dioxide","water","NAD⁺"]'::jsonb, 0, null, null, null, null)
on conflict (id) do nothing;
insert into questions (id, subject, topic, subtopic, difficulty, question, solution, question_type, options, answer_index, answer, tolerance, unit, items)
values ('vce-bio-5', 'VCE Biology', 'Immunity and change', 'Immune response', 2, 'Antibodies are produced and secreted by:', 'Activated B lymphocytes differentiate into plasma cells, which secrete antibodies.', 'mcq', '["plasma cells (B lymphocytes)","cytotoxic T cells","macrophages","mast cells"]'::jsonb, 0, null, null, null, null)
on conflict (id) do nothing;
insert into questions (id, subject, topic, subtopic, difficulty, question, solution, question_type, options, answer_index, answer, tolerance, unit, items)
values ('vce-bio-6', 'VCE Biology', 'Immunity and change', 'Natural selection', 3, 'Which of the following is a requirement for natural selection to occur?', 'Natural selection needs heritable variation that affects fitness; selection then changes allele frequencies.', 'mcq', '["heritable variation in a trait affecting survival or reproduction","all individuals being genetically identical","a constant, unchanging environment","organisms choosing to adapt"]'::jsonb, 0, null, null, null, null)
on conflict (id) do nothing;

-- ── VCE Mathematical Methods ──────────────────────────────────────────────────────
do $$
declare cid uuid; tid uuid;
begin
  select id into cid from curricula where name = 'VCE Mathematical Methods' limit 1;
  if cid is null then
    insert into curricula (name, level_label, subject_description, generation_flags, status)
    values ('VCE Mathematical Methods', 'Units 3 & 4', 'VCE Mathematical Methods (Units 3 & 4). Calculus, functions and graphs, and probability.', '{}'::jsonb, 'live')
    returning id into cid;
  end if;
  -- topic: Calculus
  select id into tid from curriculum_topics where curriculum_id = cid and name = 'Calculus' limit 1;
  if tid is null then
    insert into curriculum_topics (curriculum_id, name, order_index) values (cid, 'Calculus', 0) returning id into tid;
  end if;
  insert into curriculum_subtopics (topic_id, curriculum_id, name, order_index, gen_status, questions_generated)
  select tid, cid, v.name, v.ord, 'done', v.cnt
  from (values
      ('Differentiation', 0, 1),
      ('Integration', 1, 1)
  ) as v(name, ord, cnt)
  where not exists (select 1 from curriculum_subtopics s where s.topic_id = tid and s.name = v.name);
  -- topic: Functions and graphs
  select id into tid from curriculum_topics where curriculum_id = cid and name = 'Functions and graphs' limit 1;
  if tid is null then
    insert into curriculum_topics (curriculum_id, name, order_index) values (cid, 'Functions and graphs', 1) returning id into tid;
  end if;
  insert into curriculum_subtopics (topic_id, curriculum_id, name, order_index, gen_status, questions_generated)
  select tid, cid, v.name, v.ord, 'done', v.cnt
  from (values
      ('Polynomial functions', 0, 1),
      ('Exponential and logarithmic', 1, 1)
  ) as v(name, ord, cnt)
  where not exists (select 1 from curriculum_subtopics s where s.topic_id = tid and s.name = v.name);
  -- topic: Probability
  select id into tid from curriculum_topics where curriculum_id = cid and name = 'Probability' limit 1;
  if tid is null then
    insert into curriculum_topics (curriculum_id, name, order_index) values (cid, 'Probability', 2) returning id into tid;
  end if;
  insert into curriculum_subtopics (topic_id, curriculum_id, name, order_index, gen_status, questions_generated)
  select tid, cid, v.name, v.ord, 'done', v.cnt
  from (values
      ('Discrete random variables', 0, 1),
      ('Normal distribution', 1, 1)
  ) as v(name, ord, cnt)
  where not exists (select 1 from curriculum_subtopics s where s.topic_id = tid and s.name = v.name);
end $$;

insert into questions (id, subject, topic, subtopic, difficulty, question, solution, question_type, options, answer_index, answer, tolerance, unit, items)
values ('vce-meth-1', 'VCE Mathematical Methods', 'Calculus', 'Differentiation', 2, 'If $f(x) = 3x^2 + 2x$, find $f''(1)$.', '$f''(x) = 6x + 2$, so $f''(1) = 6 + 2 = 8$.', 'numeric', null, null, 8, 0, null, null)
on conflict (id) do nothing;
insert into questions (id, subject, topic, subtopic, difficulty, question, solution, question_type, options, answer_index, answer, tolerance, unit, items)
values ('vce-meth-2', 'VCE Mathematical Methods', 'Calculus', 'Integration', 3, 'Evaluate $\int_{0}^{2} 2x \, dx$.', '$\int 2x\,dx = x^2$; evaluated from 0 to 2 gives $4 - 0 = 4$.', 'numeric', null, null, 4, 0, null, null)
on conflict (id) do nothing;
insert into questions (id, subject, topic, subtopic, difficulty, question, solution, question_type, options, answer_index, answer, tolerance, unit, items)
values ('vce-meth-3', 'VCE Mathematical Methods', 'Functions and graphs', 'Polynomial functions', 2, 'The graph of $y = (x - 1)(x + 3)$ crosses the $x$-axis at:', 'The factors are zero at $x = 1$ and $x = -3$.', 'mcq', '["$x = 1$ and $x = -3$","$x = -1$ and $x = 3$","$x = 1$ and $x = 3$","$x = -1$ and $x = -3$"]'::jsonb, 0, null, null, null, null)
on conflict (id) do nothing;
insert into questions (id, subject, topic, subtopic, difficulty, question, solution, question_type, options, answer_index, answer, tolerance, unit, items)
values ('vce-meth-4', 'VCE Mathematical Methods', 'Functions and graphs', 'Exponential and logarithmic', 3, 'Solve for $x$: $2^x = 32$.', '$32 = 2^5$, so $x = 5$.', 'numeric', null, null, 5, 0, null, null)
on conflict (id) do nothing;
insert into questions (id, subject, topic, subtopic, difficulty, question, solution, question_type, options, answer_index, answer, tolerance, unit, items)
values ('vce-meth-5', 'VCE Mathematical Methods', 'Probability', 'Discrete random variables', 3, 'A discrete random variable $X$ has $P(X{=}1)=0.2$, $P(X{=}2)=0.5$, $P(X{=}3)=0.3$. Find $E(X)$.', '$E(X) = 1(0.2) + 2(0.5) + 3(0.3) = 0.2 + 1.0 + 0.9 = 2.1$.', 'numeric', null, null, 2.1, 0.01, null, null)
on conflict (id) do nothing;
insert into questions (id, subject, topic, subtopic, difficulty, question, solution, question_type, options, answer_index, answer, tolerance, unit, items)
values ('vce-meth-6', 'VCE Mathematical Methods', 'Probability', 'Normal distribution', 2, 'For a normally distributed variable, approximately what percentage of values lie within one standard deviation of the mean?', 'About 68% of values lie within ±1 standard deviation (the empirical 68–95–99.7 rule).', 'mcq', '["50%","68%","95%","99.7%"]'::jsonb, 1, null, null, null, null)
on conflict (id) do nothing;

