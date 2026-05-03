// Australian Curriculum v9 — Year 7 topic canonical data.
// Single source of truth: topic lists live in adminTopics.js; this file
// re-exports them and adds normalisation helpers and Learn-screen macro groups.

import { Y7_MATHS_TOPICS, Y7_ENGLISH_TOPICS } from './adminTopics.js'

export { Y7_MATHS_TOPICS, Y7_ENGLISH_TOPICS }

export const AC_Y7_MATHS_TOPIC_NAMES   = Y7_MATHS_TOPICS.map(t => t.name)
export const AC_Y7_ENGLISH_TOPIC_NAMES = Y7_ENGLISH_TOPICS.map(t => t.name)

// Aliases map common alternative labels to the canonical AC v9 name
const _m = (code) => Y7_MATHS_TOPICS.find(t => t.code === code).name
export const AC_Y7_MATHS_ALIASES = {
  'Perfect squares':                      _m('N1'),
  'Square roots':                         _m('N1'),
  'Squares and square roots':             _m('N1'),
  'Prime factorisation':                  _m('N2'),
  'Index notation':                       _m('N2'),
  'Exponent notation':                    _m('N2'),
  'Expanded notation':                    _m('N3'),
  'Place value and powers of 10':         _m('N3'),
  'Rational numbers':                     _m('N4'),
  'Fractions on a number line':           _m('N4'),
  'Equivalent fractions':                 _m('N4'),
  'Rounding decimals':                    _m('N5'),
  'Estimation':                           _m('N5'),
  'Fractions and decimals':               _m('N6'),
  'Percentages':                          _m('N6'),
  'Four operations':                      _m('N6'),
  'Integers':                             _m('N7'),
  'Directed numbers':                     _m('N7'),
  'Negative numbers':                     _m('N7'),
  'Ratios':                               _m('N8'),
  'Financial mathematics':                _m('N9'),
  'Mathematical modelling (Number)':      _m('N9'),
  'Variables':                            _m('A1'),
  'Substitution':                         _m('A1'),
  'Formulas':                             _m('A1'),
  'Algebraic expressions':                _m('A2'),
  'Linear equations':                     _m('A3'),
  'Solving equations':                    _m('A3'),
  'Graphs of functions':                  _m('A4'),
  'Functions':                            _m('A4'),
  'Tables of values':                     _m('A5'),
  'Patterns on the Cartesian plane':      _m('A5'),
  'Cartesian plane':                      _m('A5'),
  'Systematic variation':                 _m('A6'),
  'Area of triangles':                    _m('M1'),
  'Area of parallelograms':               _m('M1'),
  'Area':                                 _m('M1'),
  'Volume of prisms':                     _m('M2'),
  'Volume':                               _m('M2'),
  'Circles':                              _m('M3'),
  'Circumference':                        _m('M3'),
  'Pi':                                   _m('M3'),
  'Parallel lines and transversals':      _m('M4'),
  'Angles':                               _m('M4'),
  'Co-interior angles':                   _m('M4'),
  'Angle sum of triangles':               _m('M5'),
  'Interior angles':                      _m('M5'),
  'Mathematical modelling (Measurement)': _m('M6'),
  '2D representations':                   _m('SP1'),
  '3D objects':                           _m('SP1'),
  'Classifying shapes':                   _m('SP2'),
  'Triangles':                            _m('SP2'),
  'Quadrilaterals':                       _m('SP2'),
  'Polygons':                             _m('SP2'),
  'Transformations':                      _m('SP3'),
  'Reflections':                          _m('SP3'),
  'Rotations':                            _m('SP3'),
  'Translations':                         _m('SP3'),
  'Mean, median, mode':                   _m('ST1'),
  'Measures of centre':                   _m('ST1'),
  'Range':                                _m('ST1'),
  'Stem-and-leaf plots':                  _m('ST2'),
  'Dot plots':                            _m('ST2'),
  'Data displays':                        _m('ST2'),
  'Statistical investigations':           _m('ST3'),
  'Data distributions':                   _m('ST3'),
  'Probability':                          _m('P1'),
  'Sample spaces':                        _m('P1'),
  'Relative frequency':                   _m('P2'),
  'Repeated experiments':                 _m('P2'),
}

export function normalizeY7MathsTopic(topic) {
  if (!topic) return null
  if (AC_Y7_MATHS_TOPIC_NAMES.includes(topic)) return topic
  return AC_Y7_MATHS_ALIASES[topic] ?? null
}

// Macro groups per AC v9 strand for the Learn screen
export const MACRO_GROUPS_Y7_MATHS = [
  { id: 'g1', num: 1, label: 'Number',      topics: Y7_MATHS_TOPICS.filter(t => t.code.match(/^N\d/)).map(t => t.name) },
  { id: 'g2', num: 2, label: 'Algebra',     topics: Y7_MATHS_TOPICS.filter(t => t.code.match(/^A\d/)).map(t => t.name) },
  { id: 'g3', num: 3, label: 'Measurement', topics: Y7_MATHS_TOPICS.filter(t => t.code.match(/^M\d/)).map(t => t.name) },
  { id: 'g4', num: 4, label: 'Space',       topics: Y7_MATHS_TOPICS.filter(t => t.code.startsWith('SP')).map(t => t.name) },
  { id: 'g5', num: 5, label: 'Statistics',  topics: Y7_MATHS_TOPICS.filter(t => t.code.startsWith('ST')).map(t => t.name) },
  { id: 'g6', num: 6, label: 'Probability', topics: Y7_MATHS_TOPICS.filter(t => t.code.startsWith('P')).map(t => t.name) },
]

// ─── Year 7 English ───────────────────────────────────────────────────────────

const _e = (code) => Y7_ENGLISH_TOPICS.find(t => t.code === code).name
export const AC_Y7_ENGLISH_ALIASES = {
  'Personal identity':                    _e('L1'),
  'Social identity':                      _e('L1'),
  'Evaluative language':                  _e('L2'),
  'Evaluating texts':                     _e('L2'),
  'Text structure':                       _e('L3'),
  'Text organisation':                    _e('L3'),
  'Language features':                    _e('L3'),
  'Cohesive devices':                     _e('L4'),
  'Text cohesion':                        _e('L4'),
  'Complex sentences':                    _e('L5'),
  'Compound-complex sentences':           _e('L5'),
  'Sentence structure':                   _e('L5'),
  'Verb tense':                           _e('L6'),
  'Tense consistency':                    _e('L6'),
  'Visual texts':                         _e('L7'),
  'Multimodal texts':                     _e('L7'),
  'Vectors and angle in images':          _e('L7'),
  'Vocabulary':                           _e('L8'),
  'Technical vocabulary':                 _e('L8'),
  'Specialist vocabulary':                _e('L8'),
  'Punctuation':                          _e('L9'),
  'Colons and brackets':                  _e('L9'),
  'Literary texts and context':           _e('LT1'),
  'Context in literature':                _e('LT1'),
  'Opinions about texts':                 _e('LT2'),
  'Responding to literature':             _e('LT2'),
  'Literary devices':                     _e('LT3'),
  'Character':                            _e('LT3'),
  'Dialogue':                             _e('LT3'),
  'Metalanguage':                         _e('LT4'),
  'Aesthetic value':                      _e('LT4'),
  'Narrative structure':                  _e('LT5'),
  'Characters, settings and events':      _e('LT5'),
  'Poetry':                               _e('LT6'),
  'Layers of meaning':                    _e('LT6'),
  'Creating literary texts':              _e('LT7'),
  'Technology and texts':                 _e('LC1'),
  'Media texts':                          _e('LC1'),
  'Interaction skills':                   _e('LC2'),
  'Spoken texts':                         _e('LC2'),
  'Language and meaning':                 _e('LC3'),
  'Audience and purpose':                 _e('LC3'),
  'Structure of ideas':                   _e('LC4'),
  'Cause and effect':                     _e('LC4'),
  'Comprehension':                        _e('LC5'),
  'Comprehension strategies':             _e('LC5'),
  'Writing':                              _e('LC6'),
  'Creating and publishing texts':        _e('LC6'),
  'Presentations':                        _e('LC7'),
  'Spoken presentations':                 _e('LC7'),
  'Spelling':                             _e('LC8'),
  'Word origins':                         _e('LC8'),
  'Spelling rules':                       _e('LC8'),
}

export function normalizeY7EnglishTopic(topic) {
  if (!topic) return null
  if (AC_Y7_ENGLISH_TOPIC_NAMES.includes(topic)) return topic
  return AC_Y7_ENGLISH_ALIASES[topic] ?? null
}

export const MACRO_GROUPS_Y7_ENGLISH = [
  { id: 'g1', num: 1, label: 'Language',   topics: Y7_ENGLISH_TOPICS.filter(t => /^L\d/.test(t.code)).map(t => t.name) },
  { id: 'g2', num: 2, label: 'Literature', topics: Y7_ENGLISH_TOPICS.filter(t => t.code.startsWith('LT')).map(t => t.name) },
  { id: 'g3', num: 3, label: 'Literacy',   topics: Y7_ENGLISH_TOPICS.filter(t => t.code.startsWith('LC')).map(t => t.name) },
]

export function getY7TopicConfig(subjectId) {
  if (subjectId === 'maths_y7') {
    return { macroGroups: MACRO_GROUPS_Y7_MATHS, normFn: normalizeY7MathsTopic }
  }
  if (subjectId === 'english_y7') {
    return { macroGroups: MACRO_GROUPS_Y7_ENGLISH, normFn: normalizeY7EnglishTopic }
  }
  return null
}
