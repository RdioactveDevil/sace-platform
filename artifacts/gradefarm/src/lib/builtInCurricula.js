/**
 * Single source of truth for all built-in curriculum-backed subjects.
 *
 * To add a new built-in subject:
 *   1. Add one entry to BUILT_IN_CURRICULA below.
 *   2. Add the subject tile (id, name, stage, icon, color) to subjects.js.
 *
 * Everything else — DB seeding, admin generate screen topic fallback,
 * and the question-bank curriculum loader — derives from this file automatically.
 *
 * Shape per entry:
 *   name            — must match curricula.name in DB (canonical, used as lookup key)
 *   subjectId       — matches the id field in subjects.js
 *   aliases         — optional extra strings accepted by getTopicsBySubject (e.g. legacy names)
 *   description     — shown in admin UI and stored in curricula.subject_description
 *   generationFlags — { graphs, tables, latex } passed to the question-generation API
 *   topics          — array of { name, subtopics: [{ code, name, short? }] }
 *                     code  = short alphanumeric key used by the admin generate API
 *                     name  = canonical subtopic name (stored in DB and on questions)
 *                     short = optional short display label (used by Y7 UI components)
 */

export const BUILT_IN_CURRICULA = [
  // ─── SACE Mathematical Methods Stage 2 ───────────────────────────────────────
  {
    name: 'Mathematical Methods Stage 2',
    subjectId: 'maths_methods_s2',
    description: 'SACE Mathematical Methods Stage 2 — covering Functions, Differential and Integral Calculus, Statistics, Probability Distributions, and Statistical Inference.',
    generationFlags: { graphs: true, tables: false, latex: true },
    topics: [
      { name: 'Functions', subtopics: [
        { code: '1.1', name: 'Exponential functions' },
        { code: '1.2', name: 'Logarithms' },
        { code: '1.3', name: 'Logarithmic functions' },
        { code: '1.4', name: 'Trigonometric functions' },
      ]},
      { name: 'Differential Calculus', subtopics: [
        { code: '2.1', name: 'First principles' },
        { code: '2.2', name: 'Simple rules of differentiation' },
        { code: '2.3', name: 'The chain rule' },
        { code: '2.4', name: 'The product rule' },
        { code: '2.5', name: 'The quotient rule' },
        { code: '2.6', name: 'Derivatives of exponential, logarithmic and trigonometric functions' },
        { code: '2.7', name: 'Second derivatives' },
      ]},
      { name: 'Applications of Differential Calculus', subtopics: [
        { code: '3.1', name: 'Equations of tangents' },
        { code: '3.2', name: 'Increasing and decreasing functions' },
        { code: '3.3', name: 'Stationary points' },
        { code: '3.4', name: 'Inflections and shape' },
        { code: '3.5', name: 'Kinematics' },
        { code: '3.6', name: 'Rates of change' },
        { code: '3.7', name: 'Optimisation' },
      ]},
      { name: 'Integration', subtopics: [
        { code: '4.1', name: 'Antidifferentiation' },
        { code: '4.2', name: 'The Fundamental Theorem of Calculus' },
        { code: '4.3', name: 'Rules for integration' },
        { code: '4.4', name: 'Integrating f(ax + b)' },
        { code: '4.5', name: 'Definite integrals' },
      ]},
      { name: 'Applications of Integration', subtopics: [
        { code: '5.1', name: 'The area under a curve' },
        { code: '5.2', name: 'The area between two functions' },
        { code: '5.3', name: 'Kinematics' },
        { code: '5.4', name: 'Problem solving by integration' },
      ]},
      { name: 'Statistics', subtopics: [
        { code: '6.1', name: 'Key statistical concepts' },
        { code: '6.2', name: 'Measuring the centre of data' },
        { code: '6.3', name: 'Variance and standard deviation' },
      ]},
      { name: 'Discrete Random Variables', subtopics: [
        { code: '7.1', name: 'Random variables' },
        { code: '7.2', name: 'Discrete probability distributions' },
        { code: '7.3', name: 'Expected value' },
        { code: '7.4', name: 'Variance and standard deviation' },
        { code: '7.5', name: 'Properties of aX + b' },
        { code: '7.6', name: 'The Bernoulli and binomial distributions' },
      ]},
      { name: 'Continuous Random Variables', subtopics: [
        { code: '8.1', name: 'Continuous random variables' },
        { code: '8.2', name: 'Probability density functions' },
        { code: '8.3', name: 'The normal distribution' },
        { code: '8.4', name: 'The standard normal distribution (Z-distribution)' },
        { code: '8.5', name: 'Quantiles and probability calculations' },
      ]},
      { name: 'Sampling and Confidence Intervals', subtopics: [
        { code: '9.1', name: 'Sampling distributions' },
        { code: '9.2', name: 'Distributions of sample means' },
        { code: '9.3', name: 'The Central Limit Theorem' },
        { code: '9.4', name: 'Confidence intervals for means' },
        { code: '9.5', name: 'Sample proportions and confidence intervals for proportions' },
      ]},
    ],
  },

  // ─── SACE Chemistry Stage 1 ───────────────────────────────────────────────────
  {
    name: 'Chemistry Stage 1',
    subjectId: 'chemistry_s1',
    description: 'SACE Chemistry Stage 1 — Australian curriculum covering properties of matter, atomic structure, molecular materials, solutions, acid-base and redox chemistry.',
    generationFlags: { graphs: false, tables: false, latex: true },
    topics: [
      { name: 'Properties and Atomic Structure', subtopics: [
        { code: '1.1', name: 'Properties and uses of materials' },
        { code: '1.2', name: 'Atomic structure' },
        { code: '1.3', name: 'Quantities of atoms' },
      ]},
      { name: 'Types of Materials', subtopics: [
        { code: '2.1', name: 'Types of materials' },
        { code: '2.2', name: 'Bonding between atoms' },
        { code: '2.3', name: 'Quantities of molecules and ions' },
      ]},
      { name: 'Molecular Materials', subtopics: [
        { code: '3.1', name: 'Molecule polarity' },
        { code: '3.2', name: 'Interactions between molecules' },
        { code: '3.3', name: 'Hydrocarbons' },
        { code: '3.4', name: 'Polymers' },
      ]},
      { name: 'Solutions', subtopics: [
        { code: '4.1', name: 'Miscibility and solutions' },
        { code: '4.2', name: 'Solutions of ionic substances' },
        { code: '4.3', name: 'Quantities in reactions' },
        { code: '4.4', name: 'Energy in reactions' },
      ]},
      { name: 'Acid–Base Chemistry', subtopics: [
        { code: '5.1', name: 'Acid–base concepts' },
        { code: '5.2', name: 'Reactions of acids and bases' },
        { code: '5.3', name: 'The pH scale' },
      ]},
      { name: 'Redox Chemistry', subtopics: [
        { code: '6.1', name: 'Concepts of oxidation and reduction' },
        { code: '6.2', name: 'Metal reactivity' },
        { code: '6.3', name: 'Electrochemistry' },
      ]},
    ],
  },

  // ─── SACE Chemistry Stage 2 ───────────────────────────────────────────────────
  {
    name: 'Chemistry Stage 2',
    subjectId: 'chemistry_s2',
    description: 'SACE Chemistry Stage 2 — covering environmental chemistry, rates and equilibrium, organic chemistry, and sustainability.',
    generationFlags: { graphs: false, tables: false, latex: true },
    topics: [
      { name: 'Environmental Chemistry and Analysis', subtopics: [
        { code: '1.1', name: 'Global warming and climate change' },
        { code: '1.2', name: 'Photochemical smog' },
        { code: '1.3', name: 'Volumetric analysis' },
        { code: '1.4', name: 'Chromatography' },
        { code: '1.5', name: 'Atomic spectroscopy' },
      ]},
      { name: 'Rates and Equilibrium', subtopics: [
        { code: '2.1', name: 'Rates of reactions' },
        { code: '2.2', name: 'Equilibrium and yield' },
        { code: '2.3', name: 'Optimising production' },
      ]},
      { name: 'Organic Chemistry', subtopics: [
        { code: '3.1',  name: 'Introduction to organic chemistry' },
        { code: '3.2',  name: 'Alcohols' },
        { code: '3.3',  name: 'Aldehydes and ketones' },
        { code: '3.4',  name: 'Carbohydrates' },
        { code: '3.5',  name: 'Carboxylic acids' },
        { code: '3.6',  name: 'Amines' },
        { code: '3.7',  name: 'Esters' },
        { code: '3.8',  name: 'Amides' },
        { code: '3.9',  name: 'Triglycerides' },
        { code: '3.10', name: 'Proteins' },
      ]},
      { name: 'Sustainability', subtopics: [
        { code: '4.1', name: 'Energy resources' },
        { code: '4.2', name: 'Water' },
        { code: '4.3', name: 'Soil' },
        { code: '4.4', name: 'Materials resources' },
      ]},
    ],
  },

  // ─── Australian Curriculum v9 — Year 7 Mathematics ───────────────────────────
  // Names are verbatim from the official AC v9 content descriptions.
  // Source: australiancurriculum.edu.au/f-10-curriculum/learning-areas/mathematics/year-7
  // short = human-readable label used by UI components; name = canonical id for question tagging.
  {
    name: 'Year 7 Mathematics',
    subjectId: 'maths_y7',
    description: 'Australian Curriculum v9 — Year 7 Mathematics covering Number, Algebra, Measurement, Space, Statistics and Probability.',
    generationFlags: { graphs: true, tables: true, latex: true },
    topics: [
      { name: 'Number', subtopics: [
        { code: 'N1',  short: 'Square numbers and roots',                           name: 'describe the relationship between perfect square numbers and square roots, and use squares of numbers and square roots of perfect square numbers to solve problems' },
        { code: 'N2',  short: 'Prime factorisation with exponents',                 name: 'represent natural numbers as products of powers of prime numbers using exponent notation' },
        { code: 'N3',  short: 'Expanded notation and powers of 10',                 name: 'represent natural numbers in expanded notation using place value and powers of 10' },
        { code: 'N4',  short: 'Rational numbers on a number line',                  name: 'find equivalent representations of rational numbers and represent rational numbers on a number line' },
        { code: 'N5',  short: 'Rounding decimals and estimation',                   name: 'round decimals to a given accuracy appropriate to the context and use appropriate rounding and estimation to check the reasonableness of solutions' },
        { code: 'N6',  short: 'Operations with fractions, decimals & percentages',  name: 'use the 4 operations with positive rational numbers including fractions, decimals and percentages to solve problems using efficient calculation strategies' },
        { code: 'N7',  short: 'Adding and subtracting integers',                    name: 'compare, order and solve problems involving addition and subtraction of integers' },
        { code: 'N8',  short: 'Ratios',                                             name: 'recognise, represent and solve problems involving ratios' },
        { code: 'N9',  short: 'Modelling with rationals and percentages',           name: 'use mathematical modelling to solve practical problems, involving rational numbers and percentages, including financial contexts; formulate problems, choosing representations and efficient calculation strategies, using digital tools as appropriate; interpret and communicate solutions in terms of the situation, justifying choices made about the representation' },
      ]},
      { name: 'Algebra', subtopics: [
        { code: 'A1',  short: 'Variables, formulas and substitution',               name: 'recognise and use variables to represent everyday formulas algebraically and substitute values into formulas to determine an unknown' },
        { code: 'A2',  short: 'Algebraic expressions',                              name: 'formulate algebraic expressions using constants, variables, operations and brackets' },
        { code: 'A3',  short: 'Linear equations in one variable',                   name: 'solve one-variable linear equations with natural number solutions; verify the solution by substitution' },
        { code: 'A4',  short: 'Reading graphs of functions',                        name: 'describe relationships between variables represented in graphs of functions from authentic data' },
        { code: 'A5',  short: 'Patterns, tables and the Cartesian plane',           name: 'generate tables of values from visually growing patterns or the rule of a function; describe and plot these relationships on the Cartesian plane' },
        { code: 'A6',  short: 'Manipulating formulas with digital tools',           name: 'manipulate formulas involving several variables using digital tools, and describe the effect of systematic variation in the values of the variables' },
      ]},
      { name: 'Measurement', subtopics: [
        { code: 'M1',  short: 'Area of triangles and parallelograms',               name: 'solve problems involving the area of triangles and parallelograms using established formulas and appropriate units' },
        { code: 'M2',  short: 'Volume of prisms',                                   name: 'solve problems involving the volume of right prisms including rectangular and triangular prisms, using established formulas and appropriate units' },
        { code: 'M3',  short: 'Circles: π, radius and diameter',              name: 'describe the relationship between π and the features of circles including the circumference, radius and diameter' },
        { code: 'M4',  short: 'Parallel lines and transversal angles',              name: 'identify corresponding, alternate and co-interior relationships between angles formed when parallel lines are crossed by a transversal; use them to solve problems and explain reasons' },
        { code: 'M5',  short: 'Angle sum of triangles and polygons',                name: 'demonstrate that the interior angle sum of a triangle in the plane is 180° and apply this to determine the interior angle sum of other shapes and the size of unknown angles' },
        { code: 'M6',  short: 'Modelling with measurement',                         name: 'use mathematical modelling to solve practical problems involving measurement; formulate problems, interpret and communicate solutions in terms of the situation, justifying choices made about the representation' },
      ]},
      { name: 'Space', subtopics: [
        { code: 'SP1', short: '2D representations of objects',                      name: 'represent objects in 2 dimensions; discuss and reason about the advantages and disadvantages of different representations' },
        { code: 'SP2', short: 'Classifying triangles, quadrilaterals and polygons', name: 'classify triangles, quadrilaterals and other polygons according to their side and angle properties; identify and reason about relationships' },
        { code: 'SP3', short: 'Transformations on the Cartesian plane',             name: 'describe transformations of a set of points using coordinates in the Cartesian plane, translations and reflections on an axis, and rotations of multiples of 90°' },
      ]},
      { name: 'Statistics', subtopics: [
        { code: 'ST1', short: 'Mean, median, mode and range',                       name: 'acquire data sets for discrete and continuous numerical variables and calculate the range, median, mean and mode; make and justify decisions about which measures of central tendency provide useful insights into the nature of the distribution of data' },
        { code: 'ST2', short: 'Data displays and stem-and-leaf plots',              name: 'create different types of numerical data displays including stem-and-leaf plots using software where appropriate; describe and compare the distribution of data, commenting on the shape, centre and spread including outliers and determining the range, median, mean and mode' },
        { code: 'ST3', short: 'Statistical investigations',                         name: 'plan and conduct statistical investigations involving data for discrete and continuous numerical variables; analyse and interpret distributions of data and report findings in terms of shape and summary statistics' },
      ]},
      { name: 'Probability', subtopics: [
        { code: 'P1',  short: 'Sample spaces and probability',                      name: 'identify the sample space for single-stage events; assign probabilities to the outcomes of these events and predict relative frequencies for related experiments' },
        { code: 'P2',  short: 'Repeated experiments and simulations',               name: 'conduct repeated chance experiments and run simulations with a large number of trials using digital tools; compare observations with predictions about the likelihood of outcomes, and identify the effect of sample size on the reliability of predictions' },
      ]},
    ],
  },

  // ─── Australian Curriculum v9 — Year 7 English ───────────────────────────────
  // Strand codes: Language (AC9E7LA), Literature (AC9E7LE), Literacy (AC9E7LY).
  {
    name: 'Year 7 English',
    subjectId: 'english_y7',
    description: 'Australian Curriculum v9 — Year 7 English covering Language, Literature and Literacy strands.',
    generationFlags: { graphs: false, tables: false, latex: false },
    topics: [
      { name: 'Language', subtopics: [
        { code: 'L1',  short: 'Language and identity',                          name: 'understand how language expresses and creates personal and social identities' },
        { code: 'L2',  short: 'Evaluative language in texts',                   name: 'recognise language used to evaluate texts including visual and multimodal texts, and how evaluations of a text can be substantiated by reference to the text and other sources' },
        { code: 'L3',  short: 'Text structure by purpose',                      name: 'identify and describe how texts are structured differently depending on their purpose and how language features vary in texts' },
        { code: 'L4',  short: 'Cohesive devices in texts',                      name: 'understand that the cohesion of texts relies on devices that signal structure and guide readers, such as overviews and initial and concluding paragraphs' },
        { code: 'L5',  short: 'Complex and compound-complex sentences',         name: 'understand how complex and compound-complex sentences can be used to elaborate, extend and explain ideas' },
        { code: 'L6',  short: 'Tense consistency',                              name: 'understand how consistency of tense through verbs and verb groups achieves clarity in sentences' },
        { code: 'L7',  short: 'Vectors, angle and perspective in visuals',      name: 'analyse how techniques such as vectors, angle and/or social distance in visual texts can be used to create a perspective' },
        { code: 'L8',  short: 'Specialist and technical vocabulary',            name: 'investigate the role of vocabulary in building specialist and technical knowledge, including terms that have both everyday and technical meanings' },
        { code: 'L9',  short: 'Punctuation: colons and brackets',               name: 'understand the use of punctuation including colons and brackets to support meaning' },
      ]},
      { name: 'Literature', subtopics: [
        { code: 'LT1', short: 'Literature across contexts and cultures',        name: 'identify and explore ideas, points of view, characters, events and/or issues in literary texts, drawn from historical, social and/or cultural contexts, by First Nations Australian, and wide-ranging Australian and world authors' },
        { code: ‘LT2’, short: ‘Forming opinions about texts’,                   name: ‘form an opinion about characters, settings and events in texts, identifying areas of agreement and difference with others’ opinions and justifying a response’ },
        { code: 'LT3', short: 'Literary devices and character',                 name: 'explain the ways that literary devices and language features such as dialogue, and images are used to create character, and to influence emotions and opinions in different types of texts' },
        { code: 'LT4', short: 'Aesthetic and social value of literature',       name: 'discuss the aesthetic and social value of literary texts using relevant and appropriate metalanguage' },
        { code: 'LT5', short: 'Characters, settings and events in narratives',  name: 'identify and explain the ways that characters, settings and events combine to create meaning in narratives' },
        { code: 'LT6', short: 'Layers of meaning in poetry',                    name: 'identify and explain how literary devices create layers of meaning in texts including poetry' },
        { code: 'LT7', short: 'Creating literary texts',                        name: 'create and edit literary texts that experiment with language features and literary devices encountered in texts' },
      ]},
      { name: 'Literacy', subtopics: [
        { code: 'LC1', short: 'Technology and media texts',                     name: 'explain the effect of current technology on reading, creating and responding to texts including media texts' },
        { code: 'LC2', short: 'Discussion and presentation skills',             name: 'use interaction skills when discussing and presenting ideas and information including evaluations of the features of spoken texts' },
        { code: 'LC3', short: 'Language for audience and purpose',              name: 'analyse the ways in which language features shape meaning and vary according to audience and purpose' },
        { code: 'LC4', short: 'Structuring ideas: cause, effect, metaphor',     name: 'explain the structure of ideas such as the use of taxonomies, cause and effect, extended metaphors and chronology' },
        { code: 'LC5', short: 'Comprehension strategies',                       name: 'use comprehension strategies such as visualising, predicting, connecting, summarising, monitoring, questioning and inferring to analyse and summarise information and ideas' },
        { code: 'LC6', short: 'Planning and creating written texts',            name: 'plan, create, edit and publish written and multimodal texts, selecting subject matter, and using text structures, language features, literary devices and visual features as appropriate to convey information, ideas and opinions in ways that may be imaginative, reflective, informative, persuasive and/or analytical' },
        { code: 'LC7', short: 'Planning and delivering presentations',          name: 'plan, create, rehearse and deliver presentations for purposes and audiences in ways that may be imaginative, reflective, informative, persuasive and/or analytical, by selecting text structures, language features, literary devices and visual features, and using features of voice including volume, tone, pitch and pace' },
        { code: 'LC8', short: 'Spelling rules and word origins',                name: 'understand how to use spelling rules and word origins; for example, Greek and Latin roots, base words, suffixes, prefixes and spelling patterns to learn new words and how to spell them' },
      ]},
    ],
  },

  // ─── Year 10 Mathematics (standard + 10A extension) ──────────────────────────
  {
    name: 'Year 10 Mathematics',
    subjectId: 'maths_y10',
    aliases: ['Victorian Year 10 Mathematics', 'Victorian Year 10A Mathematics'],
    description: 'Australian Curriculum — Year 10 and 10A Mathematics covering Number, Algebra, Measurement, Geometry, Statistics, Probability and extension topics.',
    generationFlags: { graphs: true, tables: true, latex: true },
    topics: [
      { name: 'Number', subtopics: [
        { code: 'N1',   name: 'Percentages, errors and approximations with real numbers' },
        { code: 'N2',   name: 'Simple and compound interest' },
      ]},
      { name: 'Algebra', subtopics: [
        { code: 'A1',   name: 'Expanding, factorising and simplifying algebraic expressions' },
        { code: 'A2',   name: 'Solving linear equations and inequalities' },
        { code: 'A3',   name: 'Solving quadratic equations' },
        { code: 'A4',   name: 'Linear, quadratic and simple exponential functions and graphs' },
        { code: 'A5',   name: 'Direct and inverse proportion' },
        { code: 'A6',   name: 'Simultaneous linear equations' },
      ]},
      { name: 'Measurement', subtopics: [
        { code: 'M1',   name: 'Surface area and volume of pyramids, cones and spheres' },
        { code: 'M2',   name: 'Similarity and scale factors' },
        { code: 'M3',   name: 'Trigonometry — right-angled triangles (sin, cos, tan)' },
        { code: ‘M4’,   name: ‘Applications of Pythagoras’ theorem and trigonometry’ },
      ]},
      { name: 'Geometry', subtopics: [
        { code: 'SP1',  name: 'Geometric reasoning and proofs with plane shapes' },
        { code: 'SP2',  name: 'Congruence and similarity of triangles' },
        { code: 'SP3',  name: 'Circle geometry — chord, tangent and angle properties' },
      ]},
      { name: 'Statistics', subtopics: [
        { code: 'ST1',  name: 'Data distributions — displaying and comparing with statistical measures' },
        { code: 'ST2',  name: 'Bivariate numerical data — scatter plots and lines of best fit' },
        { code: 'ST3',  name: 'Evaluating statistical reports and media claims' },
      ]},
      { name: 'Probability', subtopics: [
        { code: 'P1',   name: 'Conditional probability and independence' },
        { code: 'P2',   name: 'Two-step and multi-step chance experiments — tables and tree diagrams' },
      ]},
      { name: 'Year 10A — Number', subtopics: [
        { code: 'XN1',  name: 'The real number system — surds and irrational numbers' },
        { code: 'XN2',  name: 'Logarithms — definition, laws and applications' },
      ]},
      { name: 'Year 10A — Algebra', subtopics: [
        { code: ‘XA1’,  name: ‘Binomial expansion and Pascal’s triangle’ },
        { code: 'XA2',  name: 'Polynomial functions — graphs, roots and factorisation' },
        { code: 'XA3',  name: 'Exponential and logarithmic functions and equations' },
        { code: 'XA4',  name: 'Inverse functions and function notation' },
        { code: 'XA5',  name: 'Arithmetic and geometric sequences and series' },
      ]},
      { name: 'Year 10A — Measurement', subtopics: [
        { code: 'XM1',  name: 'Trigonometry — non-right-angled triangles (sine and cosine rules)' },
        { code: 'XM2',  name: 'Trigonometric ratios of obtuse angles and exact values' },
        { code: 'XM3',  name: 'Arc length, sectors and segments of circles' },
      ]},
      { name: 'Year 10A — Geometry', subtopics: [
        { code: 'XSP1', name: 'Proof — congruent and similar triangles, angle and chord theorems' },
        { code: 'XSP2', name: 'Vectors — representation, addition and scalar multiplication' },
      ]},
      { name: 'Year 10A — Statistics', subtopics: [
        { code: 'XST1', name: 'Statistical inference — sampling distributions and variability' },
        { code: 'XST2', name: 'Correlation coefficient and lines of best fit — interpretation and use' },
      ]},
      { name: 'Year 10A — Probability', subtopics: [
        { code: 'XP1',  name: 'Counting techniques — permutations and combinations' },
        { code: 'XP2',  name: 'Probability distributions — discrete random variables' },
      ]},
    ],
  },
]
