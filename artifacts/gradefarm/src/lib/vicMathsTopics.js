// Year 10 Mathematics — combined standard + 10A extension topics, aliases and macro groups.
// Topic codes: standard (N/A/M/SP/ST/P) and X-prefix (XN/XA/XM/XSP/XST/XP) for 10A extension.

import { Y10_MATHS_TOPICS } from './adminTopics.js'

export { Y10_MATHS_TOPICS }

// ─── Topic aliases ─────────────────────────────────────────────────────────────
// Maps non-canonical / informal names → canonical Year 10 Mathematics topic name.

export const Y10_TOPIC_ALIASES = {
  // Number — standard
  'Percentages':                          'Percentages, errors and approximations with real numbers',
  'Percentage Error':                     'Percentages, errors and approximations with real numbers',
  'Approximation':                        'Percentages, errors and approximations with real numbers',
  'Interest':                             'Simple and compound interest',
  'Compound Interest':                    'Simple and compound interest',
  'Simple Interest':                      'Simple and compound interest',
  // Algebra — standard
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
  // Measurement — standard
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
  // Space — standard
  'Geometry':                             'Geometric reasoning and proofs with plane shapes',
  'Proofs':                               'Geometric reasoning and proofs with plane shapes',
  'Congruent Triangles':                  'Congruence and similarity of triangles',
  'Similar Triangles':                    'Congruence and similarity of triangles',
  'Circle Theorems':                      'Circle geometry \u2014 chord, tangent and angle properties',
  'Circles':                              'Circle geometry \u2014 chord, tangent and angle properties',
  // Statistics — standard
  'Data Distributions':                   'Data distributions \u2014 displaying and comparing with statistical measures',
  'Box Plots':                            'Data distributions \u2014 displaying and comparing with statistical measures',
  'Scatter Plots':                        'Bivariate numerical data \u2014 scatter plots and lines of best fit',
  'Bivariate Data':                       'Bivariate numerical data \u2014 scatter plots and lines of best fit',
  'Lines of Best Fit':                    'Bivariate numerical data \u2014 scatter plots and lines of best fit',
  'Statistical Reports':                  'Evaluating statistical reports and media claims',
  // Probability — standard
  'Conditional Probability':              'Conditional probability and independence',
  'Independence':                         'Conditional probability and independence',
  'Tree Diagrams':                        'Two-step and multi-step chance experiments \u2014 tables and tree diagrams',
  'Two-Step Experiments':                 'Two-step and multi-step chance experiments \u2014 tables and tree diagrams',
  // Number — extension
  'Surds':                                'The real number system \u2014 surds and irrational numbers',
  'Irrational Numbers':                   'The real number system \u2014 surds and irrational numbers',
  'Real Numbers':                         'The real number system \u2014 surds and irrational numbers',
  'Logarithms':                           'Logarithms \u2014 definition, laws and applications',
  'Log Laws':                             'Logarithms \u2014 definition, laws and applications',
  // Algebra — extension
  'Binomial Theorem':                     'Binomial expansion and Pascal\u2019s triangle',
  "Pascal's Triangle":                    'Binomial expansion and Pascal\u2019s triangle',
  'Polynomials':                          'Polynomial functions \u2014 graphs, roots and factorisation',
  'Polynomial Division':                  'Polynomial functions \u2014 graphs, roots and factorisation',
  'Exponential Equations':                'Exponential and logarithmic functions and equations',
  'Logarithmic Equations':                'Exponential and logarithmic functions and equations',
  'Inverse Functions':                    'Inverse functions and function notation',
  'Sequences':                            'Arithmetic and geometric sequences and series',
  'Series':                               'Arithmetic and geometric sequences and series',
  'Arithmetic Sequences':                 'Arithmetic and geometric sequences and series',
  'Geometric Sequences':                  'Arithmetic and geometric sequences and series',
  // Measurement — extension
  'Sine Rule':                            'Trigonometry \u2014 non-right-angled triangles (sine and cosine rules)',
  'Cosine Rule':                          'Trigonometry \u2014 non-right-angled triangles (sine and cosine rules)',
  'Non-Right Triangles':                  'Trigonometry \u2014 non-right-angled triangles (sine and cosine rules)',
  'Exact Trig Values':                    'Trigonometric ratios of obtuse angles and exact values',
  'Obtuse Angles':                        'Trigonometric ratios of obtuse angles and exact values',
  'Arc Length':                           'Arc length, sectors and segments of circles',
  'Sectors':                              'Arc length, sectors and segments of circles',
  // Space — extension
  'Geometric Proofs':                     'Proof \u2014 congruent and similar triangles, angle and chord theorems',
  'Vectors':                              'Vectors \u2014 representation, addition and scalar multiplication',
  // Statistics — extension
  'Sampling Distributions':               'Statistical inference \u2014 sampling distributions and variability',
  'Statistical Inference':                'Statistical inference \u2014 sampling distributions and variability',
  'Correlation':                          'Correlation coefficient and lines of best fit \u2014 interpretation and use',
  'Regression':                           'Correlation coefficient and lines of best fit \u2014 interpretation and use',
  // Probability — extension
  'Permutations':                         'Counting techniques \u2014 permutations and combinations',
  'Combinations':                         'Counting techniques \u2014 permutations and combinations',
  'Counting Principles':                  'Counting techniques \u2014 permutations and combinations',
  'Random Variables':                     'Probability distributions \u2014 discrete random variables',
  'Probability Distributions':            'Probability distributions \u2014 discrete random variables',
}

const _Y10_CANONICAL_NAMES = Y10_MATHS_TOPICS.map(t => t.name)

/**
 * Returns the canonical Year 10 Mathematics topic name for a given raw topic string,
 * checking both standard Year 10 and Year 10A extension topics, or null if not recognised.
 */
export function normalizeY10Topic(topic) {
  if (!topic) return null
  if (_Y10_CANONICAL_NAMES.includes(topic)) return topic
  return Y10_TOPIC_ALIASES[topic] ?? null
}

// ─── Macro groups ─────────────────────────────────────────────────────────────

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
    'Binomial expansion and Pascal\u2019s triangle',
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
