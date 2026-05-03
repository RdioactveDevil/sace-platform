// Victorian Curriculum F–10 Version 2.0 — Year 10 & Year 10A Mathematics
// Source: victoriancurriculum.vcaa.vic.edu.au (Mathematics F–10 v2.0)
// Topic codes: N = Number, A = Algebra, M = Measurement, SP = Space, ST = Statistics, P = Probability
// 10A codes are prefixed with 'X' to distinguish from Year 10 standard codes.

// ─── Year 10 ──────────────────────────────────────────────────────────────────

export const VIC_MATHS_Y10_TOPICS = [
  // Number (VC2M10N)
  { code: 'N1', name: 'Percentages, errors and approximations with real numbers' },
  { code: 'N2', name: 'Simple and compound interest' },
  // Algebra (VC2M10A)
  { code: 'A1', name: 'Expanding, factorising and simplifying algebraic expressions' },
  { code: 'A2', name: 'Solving linear equations and inequalities' },
  { code: 'A3', name: 'Solving quadratic equations' },
  { code: 'A4', name: 'Linear, quadratic and simple exponential functions and graphs' },
  { code: 'A5', name: 'Direct and inverse proportion' },
  { code: 'A6', name: 'Simultaneous linear equations' },
  // Measurement (VC2M10M)
  { code: 'M1', name: 'Surface area and volume of pyramids, cones and spheres' },
  { code: 'M2', name: 'Similarity and scale factors' },
  { code: 'M3', name: 'Trigonometry — right-angled triangles (sin, cos, tan)' },
  { code: 'M4', name: 'Applications of Pythagoras\u2019 theorem and trigonometry' },
  // Space (VC2M10SP)
  { code: 'SP1', name: 'Geometric reasoning and proofs with plane shapes' },
  { code: 'SP2', name: 'Congruence and similarity of triangles' },
  { code: 'SP3', name: 'Circle geometry — chord, tangent and angle properties' },
  // Statistics (VC2M10ST)
  { code: 'ST1', name: 'Data distributions — displaying and comparing with statistical measures' },
  { code: 'ST2', name: 'Bivariate numerical data — scatter plots and lines of best fit' },
  { code: 'ST3', name: 'Evaluating statistical reports and media claims' },
  // Probability (VC2M10P)
  { code: 'P1', name: 'Conditional probability and independence' },
  { code: 'P2', name: 'Two-step and multi-step chance experiments — tables and tree diagrams' },
]

// ─── Year 10A ─────────────────────────────────────────────────────────────────
// Year 10A is the enrichment pathway for students aiming at higher mathematics.

export const VIC_MATHS_Y10A_TOPICS = [
  // Number (VC2M10AN)
  { code: 'XN1', name: 'The real number system — surds and irrational numbers' },
  { code: 'XN2', name: 'Logarithms — definition, laws and applications' },
  // Algebra (VC2M10AA)
  { code: 'XA1', name: 'Binomial expansion and Pascal\u2019s triangle' },
  { code: 'XA2', name: 'Polynomial functions — graphs, roots and factorisation' },
  { code: 'XA3', name: 'Exponential and logarithmic functions and equations' },
  { code: 'XA4', name: 'Inverse functions and function notation' },
  { code: 'XA5', name: 'Arithmetic and geometric sequences and series' },
  // Measurement (VC2M10AM)
  { code: 'XM1', name: 'Trigonometry — non-right-angled triangles (sine and cosine rules)' },
  { code: 'XM2', name: 'Trigonometric ratios of obtuse angles and exact values' },
  { code: 'XM3', name: 'Arc length, sectors and segments of circles' },
  // Space (VC2M10ASP)
  { code: 'XSP1', name: 'Proof — congruent and similar triangles, angle and chord theorems' },
  { code: 'XSP2', name: 'Vectors — representation, addition and scalar multiplication' },
  // Statistics (VC2M10AST)
  { code: 'XST1', name: 'Statistical inference — sampling distributions and variability' },
  { code: 'XST2', name: 'Correlation coefficient and lines of best fit — interpretation and use' },
  // Probability (VC2M10AP)
  { code: 'XP1', name: 'Counting techniques — permutations and combinations' },
  { code: 'XP2', name: 'Probability distributions — discrete random variables' },
]

// ─── Topic aliases ─────────────────────────────────────────────────────────────
// Maps non-canonical / informal names → canonical Victorian Curriculum topic name.

export const VIC_Y10_TOPIC_ALIASES = {
  // Number
  'Percentages':                          'Percentages, errors and approximations with real numbers',
  'Percentage Error':                     'Percentages, errors and approximations with real numbers',
  'Approximation':                        'Percentages, errors and approximations with real numbers',
  'Interest':                             'Simple and compound interest',
  'Compound Interest':                    'Simple and compound interest',
  'Simple Interest':                      'Simple and compound interest',
  // Algebra
  'Factorising':                          'Expanding, factorising and simplifying algebraic expressions',
  'Expanding':                            'Expanding, factorising and simplifying algebraic expressions',
  'Algebraic Fractions':                  'Expanding, factorising and simplifying algebraic expressions',
  'Index Laws':                           'Expanding, factorising and simplifying algebraic expressions',
  'Inequalities':                         'Solving linear equations and inequalities',
  'Linear Equations':                     'Solving linear equations and inequalities',
  'Quadratics':                           'Solving quadratic equations',
  'Quadratic Equations':                  'Solving quadratic equations',
  'Functions':                            'Linear, quadratic and simple exponential functions and graphs',
  'Graphs':                               'Linear, quadratic and simple exponential functions and graphs',
  'Parabolas':                            'Linear, quadratic and simple exponential functions and graphs',
  'Exponential Functions':                'Linear, quadratic and simple exponential functions and graphs',
  'Proportion':                           'Direct and inverse proportion',
  'Simultaneous Equations':               'Simultaneous linear equations',
  // Measurement
  'Surface Area':                         'Surface area and volume of pyramids, cones and spheres',
  'Volume':                               'Surface area and volume of pyramids, cones and spheres',
  'Pyramids and Cones':                   'Surface area and volume of pyramids, cones and spheres',
  'Spheres':                              'Surface area and volume of pyramids, cones and spheres',
  'Scale':                                'Similarity and scale factors',
  'Similar Figures':                      'Similarity and scale factors',
  'Trigonometry':                         'Trigonometry \u2014 right-angled triangles (sin, cos, tan)',
  'Sin Cos Tan':                          'Trigonometry \u2014 right-angled triangles (sin, cos, tan)',
  'SOH CAH TOA':                          'Trigonometry \u2014 right-angled triangles (sin, cos, tan)',
  'Pythagoras':                           'Applications of Pythagoras\u2019 theorem and trigonometry',
  "Pythagoras' Theorem":                  'Applications of Pythagoras\u2019 theorem and trigonometry',
  // Space
  'Geometry':                             'Geometric reasoning and proofs with plane shapes',
  'Proofs':                               'Geometric reasoning and proofs with plane shapes',
  'Congruent Triangles':                  'Congruence and similarity of triangles',
  'Similar Triangles':                    'Congruence and similarity of triangles',
  'Circle Theorems':                      'Circle geometry \u2014 chord, tangent and angle properties',
  'Circles':                              'Circle geometry \u2014 chord, tangent and angle properties',
  // Statistics
  'Data Distributions':                   'Data distributions \u2014 displaying and comparing with statistical measures',
  'Box Plots':                            'Data distributions \u2014 displaying and comparing with statistical measures',
  'Scatter Plots':                        'Bivariate numerical data \u2014 scatter plots and lines of best fit',
  'Bivariate Data':                       'Bivariate numerical data \u2014 scatter plots and lines of best fit',
  'Lines of Best Fit':                    'Bivariate numerical data \u2014 scatter plots and lines of best fit',
  'Statistical Reports':                  'Evaluating statistical reports and media claims',
  // Probability
  'Conditional Probability':              'Conditional probability and independence',
  'Independence':                         'Conditional probability and independence',
  'Tree Diagrams':                        'Two-step and multi-step chance experiments \u2014 tables and tree diagrams',
  'Two-Step Experiments':                 'Two-step and multi-step chance experiments \u2014 tables and tree diagrams',
}

export const VIC_Y10A_TOPIC_ALIASES = {
  // Number
  'Surds':                                'The real number system \u2014 surds and irrational numbers',
  'Irrational Numbers':                   'The real number system \u2014 surds and irrational numbers',
  'Real Numbers':                         'The real number system \u2014 surds and irrational numbers',
  'Logarithms':                           'Logarithms \u2014 definition, laws and applications',
  'Log Laws':                             'Logarithms \u2014 definition, laws and applications',
  // Algebra
  'Binomial Theorem':                     "Binomial expansion and Pascal\u2019s triangle",
  "Pascal's Triangle":                    "Binomial expansion and Pascal\u2019s triangle",
  'Polynomials':                          'Polynomial functions \u2014 graphs, roots and factorisation',
  'Polynomial Division':                  'Polynomial functions \u2014 graphs, roots and factorisation',
  'Exponential Equations':                'Exponential and logarithmic functions and equations',
  'Logarithmic Equations':                'Exponential and logarithmic functions and equations',
  'Inverse Functions':                    'Inverse functions and function notation',
  'Sequences':                            'Arithmetic and geometric sequences and series',
  'Series':                               'Arithmetic and geometric sequences and series',
  'Arithmetic Sequences':                 'Arithmetic and geometric sequences and series',
  'Geometric Sequences':                  'Arithmetic and geometric sequences and series',
  // Measurement
  'Sine Rule':                            'Trigonometry \u2014 non-right-angled triangles (sine and cosine rules)',
  'Cosine Rule':                          'Trigonometry \u2014 non-right-angled triangles (sine and cosine rules)',
  'Non-Right Triangles':                  'Trigonometry \u2014 non-right-angled triangles (sine and cosine rules)',
  'Exact Trig Values':                    'Trigonometric ratios of obtuse angles and exact values',
  'Obtuse Angles':                        'Trigonometric ratios of obtuse angles and exact values',
  'Arc Length':                           'Arc length, sectors and segments of circles',
  'Sectors':                              'Arc length, sectors and segments of circles',
  // Space
  'Geometric Proofs':                     'Proof \u2014 congruent and similar triangles, angle and chord theorems',
  'Vectors':                              'Vectors \u2014 representation, addition and scalar multiplication',
  // Statistics
  'Sampling Distributions':              'Statistical inference \u2014 sampling distributions and variability',
  'Statistical Inference':               'Statistical inference \u2014 sampling distributions and variability',
  'Correlation':                         'Correlation coefficient and lines of best fit \u2014 interpretation and use',
  'Regression':                          'Correlation coefficient and lines of best fit \u2014 interpretation and use',
  // Probability
  'Permutations':                        'Counting techniques \u2014 permutations and combinations',
  'Combinations':                        'Counting techniques \u2014 permutations and combinations',
  'Counting Principles':                 'Counting techniques \u2014 permutations and combinations',
  'Random Variables':                    'Probability distributions \u2014 discrete random variables',
  'Probability Distributions':           'Probability distributions \u2014 discrete random variables',
}

/**
 * Returns the canonical Victorian Curriculum Year 10 topic name for a given raw topic string,
 * or null if not recognised.
 */
export function normalizeVicY10Topic(topic) {
  if (!topic) return null
  const canonical = VIC_MATHS_Y10_TOPICS.map(t => t.name)
  if (canonical.includes(topic)) return topic
  return VIC_Y10_TOPIC_ALIASES[topic] ?? null
}

/**
 * Returns the canonical Victorian Curriculum Year 10A topic name for a given raw topic string,
 * or null if not recognised.
 */
export function normalizeVicY10ATopic(topic) {
  if (!topic) return null
  const canonical = VIC_MATHS_Y10A_TOPICS.map(t => t.name)
  if (canonical.includes(topic)) return topic
  return VIC_Y10A_TOPIC_ALIASES[topic] ?? null
}

// ─── Macro groups ─────────────────────────────────────────────────────────────

export const MACRO_GROUPS_VIC_Y10 = [
  { id: 'g1', num: 1, label: 'Number', topics: [
    'Percentages, errors and approximations with real numbers',
    'Simple and compound interest',
  ]},
  { id: 'g2', num: 2, label: 'Algebra', topics: [
    'Expanding, factorising and simplifying algebraic expressions',
    'Solving linear equations and inequalities',
    'Solving quadratic equations',
    'Simultaneous linear equations',
  ]},
  { id: 'g3', num: 3, label: 'Functions & Graphs', topics: [
    'Linear, quadratic and simple exponential functions and graphs',
    'Direct and inverse proportion',
  ]},
  { id: 'g4', num: 4, label: 'Measurement', topics: [
    'Surface area and volume of pyramids, cones and spheres',
    'Similarity and scale factors',
    'Trigonometry \u2014 right-angled triangles (sin, cos, tan)',
    'Applications of Pythagoras\u2019 theorem and trigonometry',
  ]},
  { id: 'g5', num: 5, label: 'Geometry', topics: [
    'Geometric reasoning and proofs with plane shapes',
    'Congruence and similarity of triangles',
    'Circle geometry \u2014 chord, tangent and angle properties',
  ]},
  { id: 'g6', num: 6, label: 'Statistics', topics: [
    'Data distributions \u2014 displaying and comparing with statistical measures',
    'Bivariate numerical data \u2014 scatter plots and lines of best fit',
    'Evaluating statistical reports and media claims',
  ]},
  { id: 'g7', num: 7, label: 'Probability', topics: [
    'Conditional probability and independence',
    'Two-step and multi-step chance experiments \u2014 tables and tree diagrams',
  ]},
]

export const MACRO_GROUPS_VIC_Y10A = [
  { id: 'g1', num: 1, label: 'Number', topics: [
    'The real number system \u2014 surds and irrational numbers',
    'Logarithms \u2014 definition, laws and applications',
  ]},
  { id: 'g2', num: 2, label: 'Algebra', topics: [
    "Binomial expansion and Pascal\u2019s triangle",
    'Polynomial functions \u2014 graphs, roots and factorisation',
    'Inverse functions and function notation',
    'Arithmetic and geometric sequences and series',
  ]},
  { id: 'g3', num: 3, label: 'Functions & Graphs', topics: [
    'Exponential and logarithmic functions and equations',
  ]},
  { id: 'g4', num: 4, label: 'Measurement', topics: [
    'Trigonometry \u2014 non-right-angled triangles (sine and cosine rules)',
    'Trigonometric ratios of obtuse angles and exact values',
    'Arc length, sectors and segments of circles',
  ]},
  { id: 'g5', num: 5, label: 'Geometry', topics: [
    'Proof \u2014 congruent and similar triangles, angle and chord theorems',
    'Vectors \u2014 representation, addition and scalar multiplication',
  ]},
  { id: 'g6', num: 6, label: 'Statistics', topics: [
    'Statistical inference \u2014 sampling distributions and variability',
    'Correlation coefficient and lines of best fit \u2014 interpretation and use',
  ]},
  { id: 'g7', num: 7, label: 'Probability', topics: [
    'Counting techniques \u2014 permutations and combinations',
    'Probability distributions \u2014 discrete random variables',
  ]},
]

// ─── Combined Year 10 (standard + 10A extension) ──────────────────────────────

export const Y10_ALL_TOPICS = [
  ...VIC_MATHS_Y10_TOPICS,
  ...VIC_MATHS_Y10A_TOPICS,
]

export const TOPIC_ALIASES_Y10 = {
  ...VIC_Y10_TOPIC_ALIASES,
  ...VIC_Y10A_TOPIC_ALIASES,
}

/**
 * Returns the canonical Year 10 Mathematics topic name for a given raw topic string,
 * checking both standard Year 10 and Year 10A extension topics, or null if not recognised.
 */
export function normalizeY10Topic(topic) {
  if (!topic) return null
  const canonical = Y10_ALL_TOPICS.map(t => t.name)
  if (canonical.includes(topic)) return topic
  return TOPIC_ALIASES_Y10[topic] ?? null
}

export const MACRO_GROUPS_Y10 = [
  { id: 'g1', num: 1, label: 'Number', topics: [
    'Percentages, errors and approximations with real numbers',
    'Simple and compound interest',
    'The real number system \u2014 surds and irrational numbers',
    'Logarithms \u2014 definition, laws and applications',
  ]},
  { id: 'g2', num: 2, label: 'Algebra', topics: [
    'Expanding, factorising and simplifying algebraic expressions',
    'Solving linear equations and inequalities',
    'Solving quadratic equations',
    'Simultaneous linear equations',
    "Binomial expansion and Pascal\u2019s triangle",
    'Polynomial functions \u2014 graphs, roots and factorisation',
    'Inverse functions and function notation',
    'Arithmetic and geometric sequences and series',
  ]},
  { id: 'g3', num: 3, label: 'Functions & Graphs', topics: [
    'Linear, quadratic and simple exponential functions and graphs',
    'Direct and inverse proportion',
    'Exponential and logarithmic functions and equations',
  ]},
  { id: 'g4', num: 4, label: 'Measurement', topics: [
    'Surface area and volume of pyramids, cones and spheres',
    'Similarity and scale factors',
    'Trigonometry \u2014 right-angled triangles (sin, cos, tan)',
    'Applications of Pythagoras\u2019 theorem and trigonometry',
    'Trigonometry \u2014 non-right-angled triangles (sine and cosine rules)',
    'Trigonometric ratios of obtuse angles and exact values',
    'Arc length, sectors and segments of circles',
  ]},
  { id: 'g5', num: 5, label: 'Geometry', topics: [
    'Geometric reasoning and proofs with plane shapes',
    'Congruence and similarity of triangles',
    'Circle geometry \u2014 chord, tangent and angle properties',
    'Proof \u2014 congruent and similar triangles, angle and chord theorems',
    'Vectors \u2014 representation, addition and scalar multiplication',
  ]},
  { id: 'g6', num: 6, label: 'Statistics', topics: [
    'Data distributions \u2014 displaying and comparing with statistical measures',
    'Bivariate numerical data \u2014 scatter plots and lines of best fit',
    'Evaluating statistical reports and media claims',
    'Statistical inference \u2014 sampling distributions and variability',
    'Correlation coefficient and lines of best fit \u2014 interpretation and use',
  ]},
  { id: 'g7', num: 7, label: 'Probability', topics: [
    'Conditional probability and independence',
    'Two-step and multi-step chance experiments \u2014 tables and tree diagrams',
    'Counting techniques \u2014 permutations and combinations',
    'Probability distributions \u2014 discrete random variables',
  ]},
]
