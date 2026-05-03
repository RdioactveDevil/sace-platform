// ─── Stage 1 ──────────────────────────────────────────────────────────────────

// Official SACE Stage 1 Chemistry topics — in curriculum order
export const SACE_STAGE1_TOPICS = [
  'Properties and uses of materials',
  'Atomic structure',
  'Quantities of atoms',
  'The periodic table',
  'Types of materials',
  'Bonding between atoms',
  'Quantities of molecules and ions',
  'Molecule polarity',
  'Interactions between molecules',
  'Hydrocarbons',
  'Polymers',
  'Miscibility and solutions',
  'Solutions of ionic substances',
  'Quantities in reactions',
  'Energy in reactions',
  'Acid–base concepts',
  'Reactions of acids and bases',
  'The pH scale',
  'Concepts of oxidation and reduction',
  'Metal reactivity',
  'Electrochemistry',
]

// Maps non-canonical / legacy topic names → canonical SACE Stage 1 name.
// Any topic not in this map and not already canonical is treated as unknown and filtered out.
export const TOPIC_ALIASES = {
  // Atomic structure
  'Atomic Theory':                           'Atomic structure',
  'Atomic Structure':                        'Atomic structure',
  'Atomic Structure and Periodic Table':     'Atomic structure',
  'Periodicity':                             'Atomic structure',
  // Quantities of atoms
  'Measurement':                             'Quantities of atoms',
  'Moles and Formulae':                      'Quantities of atoms',
  // Periodic table
  'The Periodic Table':                       'The periodic table',
  // Bonding
  'Chemical Bonding':                        'Bonding between atoms',
  'Bonding':                                 'Bonding between atoms',
  'Covalent Bonding':                        'Bonding between atoms',
  'Ionic Bonding':                           'Bonding between atoms',
  // Quantities of molecules/ions
  'Molar Mass':                              'Quantities of molecules and ions',
  // Interactions
  'Intermolecular Forces':                   'Interactions between molecules',
  'Molecular Interactions':                  'Interactions between molecules',
  // Organic / Hydrocarbons
  'Organic Chemistry':                       'Hydrocarbons',
  'Carbon Chemistry':                        'Hydrocarbons',
  // Solutions
  'Solutions':                               'Solutions of ionic substances',
  'Miscibility':                             'Miscibility and solutions',
  // Quantities in reactions
  'Stoichiometry':                           'Quantities in reactions',
  'Chemical Calculations':                   'Quantities in reactions',
  'Reaction Stoichiometry':                  'Quantities in reactions',
  // Energy
  'Thermochemistry':                         'Energy in reactions',
  'Thermodynamics':                          'Energy in reactions',
  'Enthalpy':                                'Energy in reactions',
  // Acid-base
  'Acids and Bases':                         'Acid–base concepts',
  'Acid/Base Chemistry':                     'Acid–base concepts',
  'Acid Base Chemistry':                     'Acid–base concepts',
  'Acid-Base Chemistry':                     'Acid–base concepts',
  'Reactions of Acids and Bases':            'Reactions of acids and bases',
  'pH':                                      'The pH scale',
  'pH Scale':                                'The pH scale',
  // Redox
  'Redox':                                   'Concepts of oxidation and reduction',
  'Oxidation and Reduction':                 'Concepts of oxidation and reduction',
  'Oxidation-Reduction':                     'Concepts of oxidation and reduction',
  'Redox Reactions':                         'Concepts of oxidation and reduction',
  // Metal reactivity
  'Metal Reactivity':                        'Metal reactivity',
  'Reactivity Series':                       'Metal reactivity',
  // Materials
  'Properties of Materials':                 'Properties and uses of materials',
  'Materials Science':                       'Properties and uses of materials',
  'Materials':                               'Properties and uses of materials',
  // Types of materials
  'Types of Substances':                     'Types of materials',
  'Classification of Matter':                'Types of materials',
  // Title-case variants found in DB
  'Quantities of Atoms':                     'Quantities of atoms',
  'The Periodic Table':                      'The periodic table',
  'Solutions of Ionic Substances':           'Solutions of ionic substances',
  'Mixtures and Solutions':                  'Miscibility and solutions',
  'Quantities of Molecules and Ions':        'Quantities of molecules and ions',
  'Interactions Between Molecules':          'Interactions between molecules',
  'Miscibility and Solutions':               'Miscibility and solutions',
  'Energy In Reactions':                     'Energy in reactions',
  'Concepts of Oxidation and Reduction':     'Concepts of oxidation and reduction',
  // Common informal names
  'Analytical Chemistry':                    'Quantities in reactions',
  'Environmental Chemistry':                 'Miscibility and solutions',
}

/**
 * Returns the canonical SACE Stage 1 topic name for a given raw topic string,
 * or null if the topic does not belong to the Stage 1 curriculum.
 */
export function normalizeTopic(topic) {
  if (!topic) return null
  if (SACE_STAGE1_TOPICS.includes(topic)) return topic
  return TOPIC_ALIASES[topic] ?? null
}

// ─── Stage 2 ──────────────────────────────────────────────────────────────────
// Official SACE Stage 2 Chemistry curriculum topics

export const SACE_STAGE2_TOPICS = [
  // Topic 1: Monitoring the Environment
  'Global warming and climate change',
  'Photochemical smog',
  'Volumetric analysis',
  'Chromatography',
  'Atomic spectroscopy',
  // Topic 2: Managing Chemical Processes
  'Rates of reactions',
  'Equilibrium and yield',
  'Optimising production',
  // Topic 3: Organic and Biological Chemistry
  'Introduction to organic chemistry',
  'Alcohols',
  'Aldehydes and ketones',
  'Carbohydrates',
  'Carboxylic acids',
  'Amines',
  'Esters',
  'Amides',
  'Triglycerides',
  'Proteins',
  // Topic 4: Managing Resources
  'Energy resources',
  'Water',
  'Soil',
  'Materials resources',
]

export const TOPIC_ALIASES_STAGE2 = {
  // ── Topic 1 aliases ──────────────────────────────────────────────────────────
  'Climate Change':                        'Global warming and climate change',
  'Global Warming':                        'Global warming and climate change',
  'Global Warming and Climate Change':     'Global warming and climate change',
  'Environmental Chemistry':               'Global warming and climate change',
  'Smog':                                  'Photochemical smog',
  'Photochemical Smog':                    'Photochemical smog',
  'Volumetric Analysis':                   'Volumetric analysis',
  'Titration':                             'Volumetric analysis',
  'Titrations':                            'Volumetric analysis',
  'Analytical Chemistry':                  'Volumetric analysis',
  'Spectroscopy':                          'Atomic spectroscopy',
  'Atomic Spectroscopy':                   'Atomic spectroscopy',
  'Atomic structure':                      'Atomic spectroscopy',
  'Atomic Structure':                      'Atomic spectroscopy',
  // ── Topic 2 aliases ──────────────────────────────────────────────────────────
  'Rates of Reactions':                    'Rates of reactions',
  'Rate of Reaction':                      'Rates of reactions',
  'Reaction Rates':                        'Rates of reactions',
  'Reaction Kinetics':                     'Rates of reactions',
  'Equilibrium':                           'Equilibrium and yield',
  'Equilibrium and Yield':                 'Equilibrium and yield',
  'Chemical Equilibrium':                  'Equilibrium and yield',
  'Optimising Production':                 'Optimising production',
  'Haber Process':                         'Optimising production',
  // ── Topic 3 aliases ──────────────────────────────────────────────────────────
  'Introduction':                          'Introduction to organic chemistry',
  'Organic Chemistry Introduction':        'Introduction to organic chemistry',
  'Organic Chemistry':                     'Introduction to organic chemistry',
  'Hydrocarbons':                          'Introduction to organic chemistry',
  'Carbon Chemistry':                      'Introduction to organic chemistry',
  'Alcohols':                              'Alcohols',
  'Aldehydes and Ketones':                 'Aldehydes and ketones',
  'Aldehydes':                             'Aldehydes and ketones',
  'Ketones':                               'Aldehydes and ketones',
  'Carbohydrates':                         'Carbohydrates',
  'Carboxylic Acids':                      'Carboxylic acids',
  'Amines':                                'Amines',
  'Esters':                                'Esters',
  'Amides':                                'Amides',
  'Triglycerides':                         'Triglycerides',
  'Fats and Oils':                         'Triglycerides',
  'Lipids':                                'Triglycerides',
  'Proteins':                              'Proteins',
  'Amino Acids':                           'Proteins',
  'Polymers':                              'Introduction to organic chemistry',
  // ── Topic 4 aliases ──────────────────────────────────────────────────────────
  'Energy':                                'Energy resources',
  'Energy in reactions':                   'Energy resources',
  'Energy in Reactions':                   'Energy resources',
  'Thermochemistry':                       'Energy resources',
  'Electrochemistry':                      'Optimising production',
  'Water':                                 'Water',
  'Soil':                                  'Soil',
  'Materials':                             'Materials resources',
  'Materials resources':                   'Materials resources',
  // ── Topic 2 catch-all aliases ─────────────────────────────────────────────
  'Quantities in reactions':               'Rates of reactions',
  'Quantities of reactions':               'Rates of reactions',
  'Types of reactions':                    'Rates of reactions',
  'Types of Reactions':                    'Rates of reactions',
  'Acid–base concepts':                    'Equilibrium and yield',
  'Acid-base concepts':                    'Equilibrium and yield',
  'Acids and Bases':                       'Equilibrium and yield',
  'pH Scale':                              'Equilibrium and yield',
  // ── Topic 1 extra analytical aliases ─────────────────────────────────────
  'Quantities of atoms':                   'Volumetric analysis',
  'Quantities of Atoms':                   'Volumetric analysis',
  'Mole Calculations':                     'Volumetric analysis',
  'Significant Figures':                   'Volumetric analysis',
}

export function normalizeTopicStage2(topic) {
  if (!topic) return null
  if (SACE_STAGE2_TOPICS.includes(topic)) return topic
  return TOPIC_ALIASES_STAGE2[topic] ?? null
}

// ─── Macro groups ─────────────────────────────────────────────────────────────

export const MACRO_GROUPS_STAGE1 = [
  { id: 'g1', num: 1, label: 'Materials and their atoms', topics: [
    'Properties and uses of materials', 'Atomic structure', 'Quantities of atoms', 'The periodic table',
  ]},
  { id: 'g2', num: 2, label: 'Combinations of atoms', topics: [
    'Types of materials', 'Bonding between atoms', 'Quantities of molecules and ions',
  ]},
  { id: 'g3', num: 3, label: 'Molecules', topics: [
    'Molecule polarity', 'Interactions between molecules', 'Hydrocarbons', 'Polymers',
  ]},
  { id: 'g4', num: 4, label: 'Mixtures and solutions', topics: [
    'Miscibility and solutions', 'Solutions of ionic substances', 'Quantities in reactions', 'Energy in reactions',
  ]},
  { id: 'g5', num: 5, label: 'Acids and bases', topics: [
    'Acid\u2013base concepts', 'Reactions of acids and bases', 'The pH scale',
  ]},
  { id: 'g6', num: 6, label: 'Redox reactions', topics: [
    'Concepts of oxidation and reduction', 'Metal reactivity', 'Electrochemistry',
  ]},
]

export const MACRO_GROUPS_STAGE2 = [
  { id: 'g1', num: 1, label: 'Monitoring the environment', topics: [
    'Global warming and climate change', 'Photochemical smog', 'Volumetric analysis', 'Chromatography', 'Atomic spectroscopy',
  ]},
  { id: 'g2', num: 2, label: 'Managing chemical processes', topics: [
    'Rates of reactions', 'Equilibrium and yield', 'Optimising production',
  ]},
  { id: 'g3', num: 3, label: 'Organic and biological chemistry', topics: [
    'Introduction to organic chemistry', 'Alcohols', 'Aldehydes and ketones', 'Carbohydrates',
    'Carboxylic acids', 'Amines', 'Esters', 'Amides', 'Triglycerides', 'Proteins',
  ]},
  { id: 'g4', num: 4, label: 'Managing resources', topics: [
    'Energy resources', 'Water', 'Soil', 'Materials resources',
  ]},
]

/**
 * Returns the macro groups and normalise function for the given stage.
 */
export function getTopicConfig(stage) {
  if (stage === 'Stage 2') {
    return { macroGroups: MACRO_GROUPS_STAGE2, normFn: normalizeTopicStage2 }
  }
  return { macroGroups: MACRO_GROUPS_STAGE1, normFn: normalizeTopic }
}
