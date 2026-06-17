// VCE (Victorian Certificate of Education) — built-in subjects for the `vce.`
// version. Single source of truth shared with the VCE seed migration generator.
//
// Each subject is a DB curriculum (seeded by the VCE seed migration) so practice
// runs through the platform's full adaptive quiz engine via the normal Subject
// Picker → quiz pipeline — struggle tracking, remediation and AI bank top-up,
// exactly like every other subject. The starter bank below gives day-one content
// per subtopic; AI generation extends each subtopic from there.
//
// Scope: the four core Units 3 & 4 STEM subjects. English/Literature are better
// served by the AI writing module and can be added later. Questions use the
// shared multi-format schema so grading reuses questionTypes.gradeResponse.

export const VCE_LEVEL_LABEL = 'Units 3 & 4'

// ── Subjects ────────────────────────────────────────────────────────────────
// { id, name (= curriculum/questions.subject), short, accent,
//   topics: [{ name, subtopics: [...] }], questions: [{ ...multiformat }] }

const CHEMISTRY = {
  id: 'chemistry',
  name: 'VCE Chemistry',
  short: 'Chemistry',
  accent: '#34d399',
  blurb: 'Redox & electrochemistry, organic chemistry, reaction rates and energy.',
  topics: [
    { name: 'Redox reactions and electrochemistry', subtopics: ['Galvanic cells', 'Electrolysis'] },
    { name: 'Organic chemistry', subtopics: ['Functional groups', 'Reaction pathways'] },
    { name: 'Rates and energy', subtopics: ['Calorimetry', 'Equilibrium'] },
  ],
  questions: [
    { id: 'vce-chem-1', question_type: 'mcq', topic: 'Redox reactions and electrochemistry', subtopic: 'Galvanic cells', difficulty: 2,
      question: 'In a galvanic (voltaic) cell, oxidation takes place at the:',
      options: ['anode', 'cathode', 'salt bridge', 'electrolyte'], answer_index: 0,
      solution: 'Oxidation always occurs at the anode (in a galvanic cell the anode is the negative electrode).' },
    { id: 'vce-chem-2', question_type: 'numeric', topic: 'Redox reactions and electrochemistry', subtopic: 'Electrolysis', difficulty: 4,
      question: 'A current of 5.0 A is passed through molten NaCl for 1930 s. Calculate the amount of charge that passes, in coulombs (Q = It).',
      answer: 9650, tolerance: 5, unit: 'C',
      solution: 'Q = I × t = 5.0 × 1930 = 9650 C.' },
    { id: 'vce-chem-3', question_type: 'mcq', topic: 'Organic chemistry', subtopic: 'Functional groups', difficulty: 2,
      question: 'Which functional group characterises a carboxylic acid?',
      options: ['hydroxyl, –OH', 'carboxyl, –COOH', 'carbonyl, –CHO', 'amino, –NH₂'], answer_index: 1,
      solution: 'A carboxylic acid contains the carboxyl group, –COOH.' },
    { id: 'vce-chem-4', question_type: 'mcq', topic: 'Organic chemistry', subtopic: 'Reaction pathways', difficulty: 3,
      question: 'Reacting an alkene with water (steam) in the presence of an acid catalyst to form an alcohol is an example of a(n):',
      options: ['addition reaction', 'substitution reaction', 'condensation reaction', 'oxidation reaction'], answer_index: 0,
      solution: 'The C=C double bond opens and water adds across it — hydration is an addition reaction.' },
    { id: 'vce-chem-5', question_type: 'numeric', topic: 'Rates and energy', subtopic: 'Calorimetry', difficulty: 3,
      question: '100 g of water (c = 4.18 J g⁻¹ °C⁻¹) is heated from 25 °C to 55 °C. Calculate the energy absorbed, in kJ (q = mcΔT).',
      answer: 12.54, tolerance: 0.2, unit: 'kJ',
      solution: 'q = 100 × 4.18 × 30 = 12 540 J = 12.54 kJ.' },
    { id: 'vce-chem-6', question_type: 'mcq', topic: 'Rates and energy', subtopic: 'Equilibrium', difficulty: 3,
      question: 'For the exothermic forward reaction N₂ + 3H₂ ⇌ 2NH₃, increasing the temperature shifts the equilibrium position towards the:',
      options: ['reactants (left)', 'products (right)', 'it does not shift', 'solid phase'], answer_index: 0,
      solution: 'By Le Chatelier, raising temperature favours the endothermic (reverse) direction, shifting equilibrium left.' },
  ],
}

const PHYSICS = {
  id: 'physics',
  name: 'VCE Physics',
  short: 'Physics',
  accent: '#60a5fa',
  blurb: 'Fields, motion, momentum and energy, light and matter.',
  topics: [
    { name: 'Fields', subtopics: ['Gravitational fields', 'Magnetic fields'] },
    { name: 'Motion', subtopics: ['Projectile motion', 'Momentum and energy'] },
    { name: 'Light and matter', subtopics: ['Photoelectric effect', 'Interference'] },
  ],
  questions: [
    { id: 'vce-phys-1', question_type: 'numeric', topic: 'Fields', subtopic: 'Gravitational fields', difficulty: 1,
      question: 'A 2.0 kg mass sits in a gravitational field of strength 9.8 N kg⁻¹. Calculate the gravitational force on it, in N (F = mg).',
      answer: 19.6, tolerance: 0.2, unit: 'N',
      solution: 'F = mg = 2.0 × 9.8 = 19.6 N.' },
    { id: 'vce-phys-2', question_type: 'mcq', topic: 'Fields', subtopic: 'Magnetic fields', difficulty: 2,
      question: 'A charged particle moves parallel to a uniform magnetic field. The magnetic force on the particle is:',
      options: ['zero', 'maximum', 'directed along its motion', 'directed opposite to its motion'], answer_index: 0,
      solution: 'F = qvB sinθ; when motion is parallel to B, θ = 0 and sinθ = 0, so the force is zero.' },
    { id: 'vce-phys-3', question_type: 'numeric', topic: 'Motion', subtopic: 'Projectile motion', difficulty: 3,
      question: 'A ball is launched horizontally from a height of 20 m (g = 9.8 m s⁻²). How long does it take to reach the ground, in seconds? (t = √(2h/g))',
      answer: 2.02, tolerance: 0.1, unit: 's',
      solution: 't = √(2 × 20 / 9.8) = √4.08 ≈ 2.02 s.' },
    { id: 'vce-phys-4', question_type: 'numeric', topic: 'Motion', subtopic: 'Momentum and energy', difficulty: 1,
      question: 'A 1500 kg car travels at 20 m s⁻¹. Calculate its momentum, in kg m s⁻¹ (p = mv).',
      answer: 30000, tolerance: 0, unit: 'kg m s⁻¹',
      solution: 'p = mv = 1500 × 20 = 30 000 kg m s⁻¹.' },
    { id: 'vce-phys-5', question_type: 'mcq', topic: 'Light and matter', subtopic: 'Photoelectric effect', difficulty: 3,
      question: 'In a photoelectric experiment, increasing the intensity of light (at a fixed frequency above the threshold) increases the:',
      options: ['number of photoelectrons emitted per second', 'maximum kinetic energy of photoelectrons', 'work function of the metal', 'threshold frequency'], answer_index: 0,
      solution: 'Greater intensity means more photons per second, so more photoelectrons; max KE depends only on frequency.' },
    { id: 'vce-phys-6', question_type: 'mcq', topic: 'Light and matter', subtopic: 'Interference', difficulty: 3,
      question: 'In Young’s double-slit experiment, destructive interference (dark fringes) occurs where the path difference equals:',
      options: ['nλ', '(n + ½)λ', '2nλ', 'λ ⁄ n'], answer_index: 1,
      solution: 'Dark fringes occur at path differences of a half-integer number of wavelengths, (n + ½)λ.' },
  ],
}

const BIOLOGY = {
  id: 'biology',
  name: 'VCE Biology',
  short: 'Biology',
  accent: '#f59e0b',
  blurb: 'Molecular biology, energy in cells, immunity and change over time.',
  topics: [
    { name: 'Molecular biology', subtopics: ['Nucleic acids and proteins', 'Enzymes'] },
    { name: 'Energy in cells', subtopics: ['Photosynthesis', 'Cellular respiration'] },
    { name: 'Immunity and change', subtopics: ['Immune response', 'Natural selection'] },
  ],
  questions: [
    { id: 'vce-bio-1', question_type: 'mcq', topic: 'Molecular biology', subtopic: 'Nucleic acids and proteins', difficulty: 2,
      question: 'The synthesis of a messenger RNA molecule using a DNA template is called:',
      options: ['transcription', 'translation', 'replication', 'transformation'], answer_index: 0,
      solution: 'Transcription produces mRNA from a DNA template; translation then builds the protein.' },
    { id: 'vce-bio-2', question_type: 'mcq', topic: 'Molecular biology', subtopic: 'Enzymes', difficulty: 2,
      question: 'Enzymes increase the rate of a biochemical reaction by:',
      options: ['lowering the activation energy', 'raising the activation energy', 'increasing the temperature', 'being consumed in the reaction'], answer_index: 0,
      solution: 'Enzymes provide an alternative pathway with a lower activation energy; they are not consumed.' },
    { id: 'vce-bio-3', question_type: 'mcq', topic: 'Energy in cells', subtopic: 'Photosynthesis', difficulty: 3,
      question: 'In the light-dependent stage of photosynthesis, the source of electrons that replaces those lost by chlorophyll is:',
      options: ['water', 'carbon dioxide', 'glucose', 'oxygen'], answer_index: 0,
      solution: 'Photolysis splits water, supplying electrons (and releasing O₂ as a by-product).' },
    { id: 'vce-bio-4', question_type: 'mcq', topic: 'Energy in cells', subtopic: 'Cellular respiration', difficulty: 3,
      question: 'In aerobic cellular respiration, the final electron acceptor in the electron transport chain is:',
      options: ['oxygen', 'carbon dioxide', 'water', 'NAD⁺'], answer_index: 0,
      solution: 'Oxygen accepts electrons at the end of the chain, forming water.' },
    { id: 'vce-bio-5', question_type: 'mcq', topic: 'Immunity and change', subtopic: 'Immune response', difficulty: 2,
      question: 'Antibodies are produced and secreted by:',
      options: ['plasma cells (B lymphocytes)', 'cytotoxic T cells', 'macrophages', 'mast cells'], answer_index: 0,
      solution: 'Activated B lymphocytes differentiate into plasma cells, which secrete antibodies.' },
    { id: 'vce-bio-6', question_type: 'mcq', topic: 'Immunity and change', subtopic: 'Natural selection', difficulty: 3,
      question: 'Which of the following is a requirement for natural selection to occur?',
      options: ['heritable variation in a trait affecting survival or reproduction', 'all individuals being genetically identical', 'a constant, unchanging environment', 'organisms choosing to adapt'], answer_index: 0,
      solution: 'Natural selection needs heritable variation that affects fitness; selection then changes allele frequencies.' },
  ],
}

const METHODS = {
  id: 'methods',
  name: 'VCE Mathematical Methods',
  short: 'Methods',
  accent: '#a78bfa',
  blurb: 'Calculus, functions and graphs, and probability.',
  topics: [
    { name: 'Calculus', subtopics: ['Differentiation', 'Integration'] },
    { name: 'Functions and graphs', subtopics: ['Polynomial functions', 'Exponential and logarithmic'] },
    { name: 'Probability', subtopics: ['Discrete random variables', 'Normal distribution'] },
  ],
  questions: [
    { id: 'vce-meth-1', question_type: 'numeric', topic: 'Calculus', subtopic: 'Differentiation', difficulty: 2,
      question: 'If $f(x) = 3x^2 + 2x$, find $f\'(1)$.',
      answer: 8, tolerance: 0,
      solution: '$f\'(x) = 6x + 2$, so $f\'(1) = 6 + 2 = 8$.' },
    { id: 'vce-meth-2', question_type: 'numeric', topic: 'Calculus', subtopic: 'Integration', difficulty: 3,
      question: 'Evaluate $\\int_{0}^{2} 2x \\, dx$.',
      answer: 4, tolerance: 0,
      solution: '$\\int 2x\\,dx = x^2$; evaluated from 0 to 2 gives $4 - 0 = 4$.' },
    { id: 'vce-meth-3', question_type: 'mcq', topic: 'Functions and graphs', subtopic: 'Polynomial functions', difficulty: 2,
      question: 'The graph of $y = (x - 1)(x + 3)$ crosses the $x$-axis at:',
      options: ['$x = 1$ and $x = -3$', '$x = -1$ and $x = 3$', '$x = 1$ and $x = 3$', '$x = -1$ and $x = -3$'], answer_index: 0,
      solution: 'The factors are zero at $x = 1$ and $x = -3$.' },
    { id: 'vce-meth-4', question_type: 'numeric', topic: 'Functions and graphs', subtopic: 'Exponential and logarithmic', difficulty: 3,
      question: 'Solve for $x$: $2^x = 32$.',
      answer: 5, tolerance: 0,
      solution: '$32 = 2^5$, so $x = 5$.' },
    { id: 'vce-meth-5', question_type: 'numeric', topic: 'Probability', subtopic: 'Discrete random variables', difficulty: 3,
      question: 'A discrete random variable $X$ has $P(X{=}1)=0.2$, $P(X{=}2)=0.5$, $P(X{=}3)=0.3$. Find $E(X)$.',
      answer: 2.1, tolerance: 0.01,
      solution: '$E(X) = 1(0.2) + 2(0.5) + 3(0.3) = 0.2 + 1.0 + 0.9 = 2.1$.' },
    { id: 'vce-meth-6', question_type: 'mcq', topic: 'Probability', subtopic: 'Normal distribution', difficulty: 2,
      question: 'For a normally distributed variable, approximately what percentage of values lie within one standard deviation of the mean?',
      options: ['50%', '68%', '95%', '99.7%'], answer_index: 1,
      solution: 'About 68% of values lie within ±1 standard deviation (the empirical 68–95–99.7 rule).' },
  ],
}

export const VCE_SUBJECTS = [CHEMISTRY, PHYSICS, BIOLOGY, METHODS]

export function getVceSubject(id) {
  return VCE_SUBJECTS.find((s) => s.id === id) || null
}

/** Built-in subjects in the version-registry shape: { name, level, subjectId }. */
export function vceBuiltInSubjects() {
  return VCE_SUBJECTS.map((s) => ({ name: s.name, level: VCE_LEVEL_LABEL, subjectId: s.id }))
}

/** Seed data for the VCE migration generator. */
export function vceCurriculaSeed() {
  return VCE_SUBJECTS.map((s) => ({
    name: s.name,
    level_label: VCE_LEVEL_LABEL,
    subject_description: `${s.name} (${VCE_LEVEL_LABEL}). ${s.blurb}`,
    topics: s.topics,
    questions: s.questions.map((q) => ({ ...q, subject: s.name })),
  }))
}
