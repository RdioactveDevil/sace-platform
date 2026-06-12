// Exam-track definitions for the simulator. Each track has presentation
// metadata plus a demo paper (sections with a handful of mixed-format
// questions) so the simulator is fully runnable today. Real, full-length
// content per track is sourced from the question bank later via buildPaper's
// `pick` descriptors.

export const EXAM_TRACKS = [
  {
    id: 'mixed-mock',
    title: 'Mixed Skills Mock',
    short: 'Mock',
    icon: '🎯',
    accent: '#f1be43',
    blurb: 'A short, timed two-section paper that shows off every question format with deferred marking and a full report.',
    sections: [
      {
        id: 'reasoning',
        name: 'Section 1 · Reasoning',
        durationSec: 5 * 60,
        instructions: 'Answer all questions. You can flag questions to revisit. No feedback is shown until you finish the whole paper.',
        questions: [
          { id: 'mm-1', question_type: 'mcq', question: 'If $3x - 7 = 11$, what is $x$?', options: ['4', '6', '9', '18'], answer_index: 1, solution: '$3x = 18$, so $x = 6$.' },
          { id: 'mm-2', question_type: 'numeric', question: 'A train travels 240 km in 3 hours. What is its average speed in km/h?', answer: 80, tolerance: 0, unit: 'km/h', solution: '$240 \\div 3 = 80$ km/h.' },
          { id: 'mm-3', question_type: 'order', question: 'Order these numbers from smallest to largest.', items: ['0.3', '0.45', '0.5', '0.75'], solution: 'Compare decimal place values.' },
        ],
      },
      {
        id: 'science',
        name: 'Section 2 · Science',
        durationSec: 5 * 60,
        instructions: 'Apply core science concepts. Some questions accept more than one answer.',
        questions: [
          { id: 'mm-4', question_type: 'multi_select', question: 'Which of these are noble gases? (Select all that apply.)', options: ['Helium', 'Oxygen', 'Argon', 'Nitrogen'], answer_indices: [0, 2], solution: 'Helium and Argon are in Group 18.' },
          { id: 'mm-5', question_type: 'short_text', question: 'What is the chemical symbol for sodium?', accept: ['Na'], case_sensitive: true, solution: 'Sodium’s symbol is Na (from Latin natrium).' },
          { id: 'mm-6', question_type: 'mcq', question: 'Photosynthesis primarily occurs in which organelle?', options: ['Mitochondrion', 'Chloroplast', 'Nucleus', 'Ribosome'], answer_index: 1, solution: 'Chloroplasts contain chlorophyll and carry out photosynthesis.' },
        ],
      },
    ],
  },
  {
    id: 'ucat',
    title: 'UCAT-style Drill',
    short: 'UCAT',
    icon: '🩺',
    accent: '#60a5fa',
    blurb: 'Fast, timed quantitative and verbal reasoning under pressure — the format used for undergraduate medicine admission.',
    comingSoon: true,
    sections: [
      {
        id: 'quant',
        name: 'Quantitative Reasoning',
        durationSec: 3 * 60,
        instructions: 'Short calculations against the clock. Use the on-screen calculator from the tools dock if you need it.',
        questions: [
          { id: 'uc-1', question_type: 'numeric', question: 'A jacket costs $80 and is reduced by 35%. What is the sale price in dollars?', answer: 52, tolerance: 0, unit: '$', solution: '$80 \\times 0.65 = 52$.' },
          { id: 'uc-2', question_type: 'numeric', question: 'A recipe needs 250 g of flour for 10 biscuits. How many grams are needed for 14 biscuits?', answer: 350, tolerance: 0, unit: 'g', solution: '$250 \\div 10 \\times 14 = 350$ g.' },
          { id: 'uc-3', question_type: 'mcq', question: 'Which is largest?', options: ['$\\frac{3}{5}$', '0.58', '$\\frac{11}{20}$', '0.62'], answer_index: 3, solution: '0.62 > 0.60 > 0.58 > 0.55.' },
        ],
      },
    ],
  },
  {
    id: 'gamsat',
    title: 'GAMSAT Practice Paper',
    short: 'GAMSAT',
    icon: '🧬',
    accent: '#a78bfa',
    blurb: 'Graduate medicine entry test: reasoning across humanities, social sciences, and biological/physical sciences. Stimulus-based unit sets with passages, graphs, and data tables.',
    sections: [
      // ── Section I — Reasoning in Humanities & Social Sciences ───────────────
      {
        id: 's1',
        name: 'Section I · Humanities & Social Sciences',
        durationSec: 8 * 60,
        instructions: 'Each unit set presents a passage (poetry, prose, or social commentary). Read the stimulus carefully, then answer all questions in the set. No feedback is shown until the paper is complete.',

        // Keyed by stimulus_id — rendered in the left pane alongside each question.
        stimuli: {
          'poem-blackened-branch': {
            title: 'Unit Set A  ·  Poem',
            text:
`The Blackened Branch

The blackened branch once bore a leaf of green,
Before the chimneys rose to claim the sky.
We built our towers tall and proud and keen,
Then watched the rivers choke and songbirds die.

Progress, they called it — smoke against the blue,
The hum of engines drowning nature's song.
And yet we pause at dusk to wonder who
Gave us the right to choose what can't be wrong.

The coal was dug from futures yet unborn,
The warmth was bought by debts not yet recalled.
One day the blackened branch will be reborn —
Or will it stand alone, forever stalled?`,
          },

          'prose-digital-age': {
            title: 'Unit Set B  ·  Prose',
            text:
`Social media platforms, engineered to maximise engagement, have paradoxically deepened the very isolation they promised to cure. A decade of longitudinal research indicates that passive consumption — scrolling through curated portraits of others' lives — correlates inversely with self-reported wellbeing. Yet the architects of these systems respond to such findings not with restraint but with refinement: more personalised feeds, more persuasive notifications. The late Steve Jobs was reported to prohibit his own children from using iPads, a detail that invites an unsettling inference: those who build the architecture of attention perhaps understand its hazards most clearly.

The paradox is not new. Aldous Huxley foresaw that tyranny in the modern age would not wear a jackboot but a smile; that people would be sedated not by force but by pleasure. The contemporary scroll offers precisely this — a frictionless, addictive comfort that leaves its users intellectually passive, emotionally reactive, and, above all, commercially legible.`,
          },
        },

        questions: [
          // ── Unit Set A: The Blackened Branch (3 questions) ──────────────────
          {
            id: 'gs1-1', stimulus_id: 'poem-blackened-branch', question_type: 'mcq',
            question: 'The dominant mood of the poem is best described as:',
            options: [
              'Triumphant celebration of industrial achievement',
              'Elegiac and questioning',
              'Bitter satirical attack on capitalism',
              'Fearful and despairing about the future',
            ],
            answer_index: 1,
            solution: 'The poem mourns what industrialisation has cost (elegiac) but ends with an open question rather than despair or satire, making B the best fit. The final couplet\'s question form signals uncertainty, not triumph or bitterness.',
          },
          {
            id: 'gs1-2', stimulus_id: 'poem-blackened-branch', question_type: 'mcq',
            question: '"The coal was dug from futures yet unborn" primarily suggests that:',
            options: [
              'Children were employed in coal mining',
              'Present consumption depletes resources needed by future generations',
              'Coal reserves are rapidly running out',
              'Future generations are unaware of current environmental damage',
            ],
            answer_index: 1,
            solution: 'The metaphor positions coal as belonging to people not yet alive — a resource borrowed (or stolen) from the future. This is a direct image of intergenerational resource depletion, not child labour (A) or simple scarcity (C).',
          },
          {
            id: 'gs1-3', stimulus_id: 'poem-blackened-branch', question_type: 'mcq',
            question: 'Which best describes the effect of ending the poem with a question?',
            options: [
              'It provides a definitive resolution to the poem\'s central conflict',
              'It shifts moral responsibility directly onto the reader',
              'It invites reflection without committing to a single outcome',
              'It implies the poet believes environmental recovery is impossible',
            ],
            answer_index: 2,
            solution: 'The closing question ("Or will it stand alone, forever stalled?") is genuinely open — the poem does not resolve whether recovery will occur. This creates ambiguity that invites the reader\'s own reflection (C), rather than forcing blame (B) or despair (D).',
          },

          // ── Unit Set B: Digital Age prose (3 questions) ─────────────────────
          {
            id: 'gs1-4', stimulus_id: 'prose-digital-age', question_type: 'mcq',
            question: 'The author\'s primary purpose in citing Steve Jobs\' parenting choices is to:',
            options: [
              'Celebrate a technology pioneer\'s personal values',
              'Suggest that platform designers are aware of their products\' harms',
              'Establish that social media is particularly harmful to children',
              'Contrast personal and professional behaviour in Silicon Valley',
            ],
            answer_index: 1,
            solution: 'The passage explicitly draws the inference: "those who build the architecture of attention perhaps understand its hazards most clearly." Jobs\' behaviour is used as evidence that designers know the risks — not as a story about parenting or hypocrisy per se.',
          },
          {
            id: 'gs1-5', stimulus_id: 'prose-digital-age', question_type: 'mcq',
            question: 'The reference to Huxley in the second paragraph primarily serves to:',
            options: [
              'Introduce a counterargument that the author then refutes',
              'Contextualise the argument within a broader intellectual tradition',
              'Provide empirical evidence for the author\'s central claim',
              'Suggest that social media is more harmful than totalitarian regimes',
            ],
            answer_index: 1,
            solution: 'Huxley\'s prediction is used to show that the author\'s observation is not novel — it fits a long tradition of critique about pleasure-based control. This is a contextualising move (B), not a counterargument (A) or empirical data (C).',
          },
          {
            id: 'gs1-6', stimulus_id: 'prose-digital-age', question_type: 'mcq',
            question: 'Which word in the final sentence most clearly signals the author\'s critique of the commercial dimension of social media?',
            options: ['"frictionless"', '"addictive"', '"legible"', '"passive"'],
            answer_index: 2,
            solution: '"Commercially legible" frames users as data readable by advertisers — their attention and behaviour converted into commercial signals. Of the four options, "legible" carries the sharpest critique of commodification, as "addictive" and "frictionless" describe user experience rather than commercial extraction.',
          },
        ],
      },

      // ── Section III — Reasoning in Biological & Physical Sciences ───────────
      {
        id: 's3',
        name: 'Section III · Biological & Physical Sciences',
        durationSec: 12 * 60,
        instructions: 'Each unit set provides a scientific passage with data (graphs and/or tables). Read the stimulus carefully before answering. No calculators. Work to the nearest whole number where required.',

        stimuli: {
          // ── Stimulus A: Carbonic Anhydrase Kinetics ───────────────────────
          'carbonic-anhydrase': {
            title: 'Unit Set A  ·  Biochemistry',
            text:
`Carbonic anhydrase (CA) is a zinc-containing metalloenzyme that catalyses the reversible hydration of carbon dioxide:

CO₂ + H₂O ⇌ HCO₃⁻ + H⁺

The enzyme is abundant in red blood cells, where it converts CO₂ from metabolising tissues into bicarbonate for transport to the lungs. At the lungs the reaction runs in reverse, releasing CO₂ for exhalation. CA obeys Michaelis–Menten kinetics under physiological conditions.

Figure 1 plots reaction velocity against CO₂ concentration at pH 7.4. The Michaelis constant is Km = 4 mM; maximum velocity is Vmax = 10 μmol s⁻¹. Table 1 compares kinetic parameters in the absence and presence of acetazolamide, a CA inhibitor used clinically as a diuretic and to prevent altitude sickness.`,
            figures: [
              {
                type: 'graph',
                caption: 'Figure 1. Michaelis–Menten kinetics of carbonic anhydrase at pH 7.4. [CA] is held constant; [CO₂] is varied.',
                data: {
                  functions: [{ expr: '10 * x / (4 + x)', color: '#4f8ef7' }],
                  points: [
                    { x: 4,  y: 5,  label: 'Km = 4 mM' },
                    { x: 40, y: 9.1, label: 'Vmax → 10' },
                  ],
                  xRange: [0, 44],
                  yRange: [0, 11],
                  xLabel: '[CO₂] (mM)',
                  yLabel: 'v (μmol s⁻¹)',
                },
              },
              {
                type: 'table',
                data: {
                  headers: ['Condition', 'Km (mM)', 'Vmax (μmol s⁻¹)'],
                  rows: [
                    ['Control (no inhibitor)', '4', '10'],
                    ['+ Acetazolamide (1 μM)', '20', '10'],
                  ],
                  caption: 'Table 1. Kinetic parameters of carbonic anhydrase ± acetazolamide.',
                },
              },
            ],
          },

          // ── Stimulus B: Nernst Equation & Membrane Potential ─────────────
          'nernst-membrane': {
            title: 'Unit Set B  ·  Physiology / Physics',
            text:
`The resting membrane potential of a typical mammalian neuron is approximately −70 mV, maintained by differential ion permeability and the Na⁺/K⁺-ATPase. For a membrane permeable to a single ion species, the equilibrium potential E is given by the Nernst equation:

E = (RT / zF) × ln([ion]out / [ion]in)

At 37 °C, RT/F ≈ 26.7 mV. For K⁺ (z = +1) in a typical neuron, [K⁺]in = 140 mM.

Figure 2 plots the K⁺ equilibrium potential (EK) as extracellular [K⁺] varies from 1 to 40 mM, with [K⁺]in held constant at 140 mM. Note: the natural logarithm (ln) is used throughout.`,
            figures: [
              {
                type: 'graph',
                caption: 'Figure 2. K⁺ equilibrium potential (EK) as a function of extracellular [K⁺]. Intracellular [K⁺] = 140 mM; T = 37 °C.',
                data: {
                  functions: [{ expr: '26.7 * log(x / 140)', color: '#a78bfa' }],
                  points: [
                    { x: 5,  y: -88.9, label: 'Normal [K⁺]out = 5 mM' },
                    { x: 40, y: -32.6, label: 'Hyperkalaemia' },
                  ],
                  xRange: [1, 42],
                  yRange: [-115, -20],
                  xLabel: '[K⁺]out (mM)',
                  yLabel: 'EK (mV)',
                },
              },
            ],
          },
        },

        questions: [
          // ── Unit Set A: Carbonic Anhydrase (4 questions) ────────────────────
          {
            id: 'gs3-1', stimulus_id: 'carbonic-anhydrase', question_type: 'mcq',
            question: 'According to Figure 1, what is the reaction velocity when [CO₂] equals the Km?',
            options: ['10 μmol s⁻¹', '8 μmol s⁻¹', '5 μmol s⁻¹', '2 μmol s⁻¹'],
            answer_index: 2,
            solution: 'By definition, at [S] = Km the velocity equals Vmax / 2 = 10 / 2 = 5 μmol s⁻¹. This is confirmed by Figure 1: the curve reaches half its maximum at [CO₂] = 4 mM.',
          },
          {
            id: 'gs3-2', stimulus_id: 'carbonic-anhydrase', question_type: 'mcq',
            question: 'Based on Table 1, what type of inhibitor is acetazolamide?',
            options: ['Non-competitive', 'Competitive', 'Uncompetitive', 'Irreversible'],
            answer_index: 1,
            solution: 'Competitive inhibition increases apparent Km (inhibitor competes with substrate at the active site) while leaving Vmax unchanged — exactly what Table 1 shows (Km: 4 → 20 mM; Vmax: 10 μmol s⁻¹ in both conditions). Non-competitive inhibition leaves Km unchanged but reduces Vmax.',
          },
          {
            id: 'gs3-3', stimulus_id: 'carbonic-anhydrase', question_type: 'mcq',
            question: 'Which best explains the therapeutic benefit of acetazolamide in preventing altitude sickness?',
            options: [
              'It raises Vmax, accelerating CO₂ clearance from the blood',
              'By inhibiting CA in red blood cells, it raises arterial CO₂, stimulating breathing',
              'By inhibiting CA in renal tubule cells, it reduces HCO₃⁻ reabsorption, causing mild metabolic acidosis that drives deeper ventilation',
              'It increases HCO₃⁻ production, buffering the respiratory alkalosis caused by hyperventilation',
            ],
            answer_index: 2,
            solution: 'Acetazolamide inhibits CA in the proximal tubule of the kidney. This prevents HCO₃⁻ reabsorption, producing a mild metabolic acidosis. The resulting drop in blood pH stimulates the peripheral and central chemoreceptors to increase ventilation rate and depth — mimicking acclimatisation. Option A is wrong (Vmax is unchanged per Table 1); D is the opposite of what occurs.',
          },
          {
            id: 'gs3-4', stimulus_id: 'carbonic-anhydrase', question_type: 'mcq',
            question: 'A researcher finds a novel compound that both increases Km and decreases Vmax. This inhibitor is most consistent with:',
            options: ['Competitive inhibition at a higher dose', 'Non-competitive inhibition', 'Mixed inhibition', 'Uncompetitive inhibition'],
            answer_index: 2,
            solution: 'Mixed inhibition (where the inhibitor binds both free enzyme and the enzyme–substrate complex) typically increases Km and decreases Vmax. Competitive inhibition only raises Km; non-competitive inhibition only decreases Vmax; uncompetitive inhibition decreases both Km and Vmax.',
          },

          // ── Unit Set B: Nernst Equation (4 questions) ───────────────────────
          {
            id: 'gs3-5', stimulus_id: 'nernst-membrane', question_type: 'mcq',
            question: 'Using the Nernst equation and the data given, what is EK when [K⁺]out = 5 mM? (ln 0.036 ≈ −3.33)',
            options: ['−70 mV', '−89 mV', '+27 mV', '−27 mV'],
            answer_index: 1,
            solution: 'EK = 26.7 × ln(5/140) = 26.7 × (−3.33) ≈ −89 mV. The resting potential (−70 mV) is more positive than EK because the membrane is not exclusively permeable to K⁺.',
          },
          {
            id: 'gs3-6', stimulus_id: 'nernst-membrane', question_type: 'mcq',
            question: 'Based on Figure 2, increasing extracellular [K⁺] from 5 mM to 40 mM would:',
            options: [
              'Hyperpolarise the neuron (resting potential becomes more negative)',
              'Depolarise the neuron (resting potential becomes less negative)',
              'Have no effect because K⁺ does not cross the resting membrane',
              'Increase the threshold for action potential generation',
            ],
            answer_index: 1,
            solution: 'As [K⁺]out increases, the ratio [K⁺]out/[K⁺]in increases, making ln([K⁺]out/[K⁺]in) less negative, so EK shifts toward zero (less negative). The resting potential follows EK upward — depolarisation. A depolarised resting membrane lowers the threshold for action potentials (not raises it), making D incorrect.',
          },
          {
            id: 'gs3-7', stimulus_id: 'nernst-membrane', question_type: 'mcq',
            question: 'A patient with severe hyperkalaemia has [K⁺]out = 8 mM. Compared to a normal [K⁺]out of 5 mM, their cardiac muscle resting potential is:',
            options: [
              'More negative, which decreases excitability',
              'More negative, which increases excitability',
              'Less negative, which increases excitability',
              'Less negative, which decreases excitability',
            ],
            answer_index: 2,
            solution: 'EK at 8 mM ≈ 26.7 × ln(8/140) ≈ 26.7 × (−2.86) ≈ −76 mV, compared to −89 mV at 5 mM. The resting potential is therefore less negative (shifted toward zero — depolarised). A depolarised resting potential reduces the gap to the action potential threshold, increasing excitability and risking arrhythmia.',
          },
          {
            id: 'gs3-8', stimulus_id: 'nernst-membrane', question_type: 'mcq',
            question: 'If intracellular [K⁺] increases from 140 mM to 280 mM while [K⁺]out remains at 5 mM, EK would:',
            options: [
              'Become more negative (approximately −108 mV)',
              'Become less negative (approximately −70 mV)',
              'Double in magnitude to approximately −178 mV',
              'Remain approximately the same because only the ratio matters',
            ],
            answer_index: 0,
            solution: 'EK = 26.7 × ln(5/280) = 26.7 × (−4.03) ≈ −108 mV — more negative than the −89 mV at normal [K⁺]in. Doubling [K⁺]in halves the ratio, adding one ln(0.5) ≈ −0.69 term: 26.7 × (−0.69) ≈ −18 mV more negative. D is wrong — the ratio does change (5/280 ≠ 5/140).',
          },
        ],
      },
    ],
  },
  {
    id: 'selective',
    title: 'Selective Entry',
    short: 'Selective',
    icon: '🎓',
    accent: '#34d399',
    blurb: 'Reading, mathematical reasoning and thinking skills for selective-school and scholarship entry tests.',
    comingSoon: true,
    sections: [
      {
        id: 'maths',
        name: 'Mathematical Reasoning',
        durationSec: 4 * 60,
        instructions: 'Solve each problem. Working it out on paper is encouraged before you answer.',
        questions: [
          { id: 'se-1', question_type: 'numeric', question: 'What is the next number in the sequence 2, 6, 12, 20, 30, …?', answer: 42, tolerance: 0, unit: '', solution: 'Differences increase by 2: +4, +6, +8, +10, +12 → 42.' },
          { id: 'se-2', question_type: 'mcq', question: 'A box holds 3 red and 5 blue balls. What is the probability of drawing a red ball?', options: ['$\\frac{3}{8}$', '$\\frac{5}{8}$', '$\\frac{3}{5}$', '$\\frac{1}{3}$'], answer_index: 0, solution: '3 red out of 8 total = 3/8.' },
          { id: 'se-3', question_type: 'order', question: 'Order these fractions from smallest to largest.', items: ['$\\frac{1}{4}$', '$\\frac{1}{3}$', '$\\frac{1}{2}$', '$\\frac{2}{3}$'], solution: 'Convert to a common denominator to compare.' },
        ],
      },
    ],
  },
]

export function getTrack(id) {
  return EXAM_TRACKS.find((t) => t.id === id) || null
}
