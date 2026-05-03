export const S1_TOPICS = [
  { code: '1.1', name: 'Properties and uses of materials' },
  { code: '1.2', name: 'Atomic structure' },
  { code: '1.3', name: 'Quantities of atoms' },
  { code: '2.1', name: 'Types of materials' },
  { code: '2.2', name: 'Bonding between atoms' },
  { code: '2.3', name: 'Quantities of molecules and ions' },
  { code: '3.1', name: 'Molecule polarity' },
  { code: '3.2', name: 'Interactions between molecules' },
  { code: '3.3', name: 'Hydrocarbons' },
  { code: '3.4', name: 'Polymers' },
  { code: '4.1', name: 'Miscibility and solutions' },
  { code: '4.2', name: 'Solutions of ionic substances' },
  { code: '4.3', name: 'Quantities in reactions' },
  { code: '4.4', name: 'Energy in reactions' },
  { code: '5.1', name: 'Acid\u2013base concepts' },
  { code: '5.2', name: 'Reactions of acids and bases' },
  { code: '5.3', name: 'The pH scale' },
  { code: '6.1', name: 'Concepts of oxidation and reduction' },
  { code: '6.2', name: 'Metal reactivity' },
  { code: '6.3', name: 'Electrochemistry' },
]

export const S2_TOPICS = [
  { code: '1.1', name: 'Global warming and climate change' },
  { code: '1.2', name: 'Photochemical smog' },
  { code: '1.3', name: 'Volumetric analysis' },
  { code: '1.4', name: 'Chromatography' },
  { code: '1.5', name: 'Atomic spectroscopy' },
  { code: '2.1', name: 'Rates of reactions' },
  { code: '2.2', name: 'Equilibrium and yield' },
  { code: '2.3', name: 'Optimising production' },
  { code: '3.1', name: 'Introduction to organic chemistry' },
  { code: '3.2', name: 'Alcohols' },
  { code: '3.3', name: 'Aldehydes and ketones' },
  { code: '3.4', name: 'Carbohydrates' },
  { code: '3.5', name: 'Carboxylic acids' },
  { code: '3.6', name: 'Amines' },
  { code: '3.7', name: 'Esters' },
  { code: '3.8', name: 'Amides' },
  { code: '3.9', name: 'Triglycerides' },
  { code: '3.10', name: 'Proteins' },
  { code: '4.1', name: 'Energy resources' },
  { code: '4.2', name: 'Water' },
  { code: '4.3', name: 'Soil' },
  { code: '4.4', name: 'Materials resources' },
]

/**
 * @param {'s1'|'s2'} stage
 * @param {string} code  e.g. '2.2'
 * @returns {{ code: string, name: string } | null}
 */
export function getTopicByCode(stage, code) {
  const list = stage === 's1' ? S1_TOPICS : S2_TOPICS
  return list.find(t => t.code === code) ?? null
}

/**
 * Returns the topic list as a numbered string for use in AI prompts.
 * @param {'s1'|'s2'} stage
 * @returns {string}
 */
export function topicsAsPromptList(stage) {
  const list = stage === 's1' ? S1_TOPICS : S2_TOPICS
  return list.map(t => `${t.code}: ${t.name}`).join('\n')
}
