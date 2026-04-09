#!/usr/bin/env node
/**
 * import-exam-questions.js
 *
 * Generates SACE Stage 2 Chemistry MCQ questions based on concepts from
 * the 2020, 2023, 2024, and 2025 SACE Chemistry exam papers (which are all
 * extended response — so we AI-generate MCQs that test the same concepts).
 *
 * Each concept cluster → AI generates 5 MCQs → inserted into `questions`
 * table with subject='Chemistry' (Stage 2).
 *
 * Usage (Node 18+):
 *   ANTHROPIC_API_KEY=sk-ant-...  SUPABASE_SERVICE_KEY=ey...  node scripts/import-exam-questions.js
 *
 * Add --dry-run to generate without inserting (prints to console).
 */

'use strict'

const { createClient } = require('@supabase/supabase-js')

// ── Config ────────────────────────────────────────────────────────────────────
const SUPABASE_URL         = 'https://pslpxawrfpcuwnupdfbs.supabase.co'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
const ANTHROPIC_API_KEY    = process.env.ANTHROPIC_API_KEY
const QUESTIONS_PER_BATCH  = 5
const RATE_LIMIT_MS        = 2500
const DRY_RUN              = process.argv.includes('--dry-run')

// ── Guards ────────────────────────────────────────────────────────────────────
if (!SUPABASE_SERVICE_KEY && !DRY_RUN) {
  console.error('ERROR: SUPABASE_SERVICE_KEY is not set.')
  console.error('  Usage: ANTHROPIC_API_KEY=sk-... SUPABASE_SERVICE_KEY=ey... node scripts/import-exam-questions.js')
  process.exit(1)
}
if (!ANTHROPIC_API_KEY) {
  console.error('ERROR: ANTHROPIC_API_KEY is not set.')
  process.exit(1)
}
if (typeof fetch === 'undefined') {
  console.error('ERROR: This script requires Node.js 18 or newer (for native fetch).')
  process.exit(1)
}

const supabase = DRY_RUN ? null : createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// ── SACE Stage 2 Chemistry concept clusters (from 2020–2025 exams) ────────────
// Each entry maps to a batch of MCQs. topic/subtopic match the Stage 2 curriculum.
const EXAM_CONCEPTS = [
  // ── ATOMIC STRUCTURE & PERIODIC TABLE ──────────────────────────────────────
  {
    topic: 'Atomic Structure and Periodic Table',
    subtopic: 'Electron Configuration of Transition Metal Ions',
    difficulty: 2,
    context: 'Writing electron configurations for transition metal ions such as Mn2+, Fe2+, Fe3+, Cu2+ using subshell notation. Transition metals lose 4s electrons before 3d electrons when forming cations.',
  },
  {
    topic: 'Atomic Structure and Periodic Table',
    subtopic: 'Periodic Trends',
    difficulty: 2,
    context: 'Periodic trends in ionisation energy, atomic radius, electronegativity, and electron affinity across periods and down groups. Anomalies in ionisation energy trends.',
  },

  // ── ANALYTICAL CHEMISTRY ───────────────────────────────────────────────────
  {
    topic: 'Analytical Chemistry',
    subtopic: 'Atomic Absorption Spectroscopy (AAS)',
    difficulty: 3,
    context: 'AAS principles: element-specific hollow cathode lamps, ground state atom absorption, calibration curves. Why AAS is selective for a specific metal even in mixtures. Concentration from absorbance.',
  },
  {
    topic: 'Analytical Chemistry',
    subtopic: 'HPLC and Chromatography',
    difficulty: 3,
    context: 'HPLC with non-polar stationary phase and polar mobile phase (reverse phase). Retention time and polarity relationship. Identifying compounds from chromatograms. Rf values and normal-phase vs reverse-phase.',
  },
  {
    topic: 'Analytical Chemistry',
    subtopic: 'Redox Titrations',
    difficulty: 3,
    context: 'Redox titrations using potassium permanganate (KMnO4) or dichromate as oxidising agents. Half-equations, overall ionic equations, endpoint detection, calculating concentration and percentage composition of samples. Application to food analysis (e.g., ethanol in wine, ascorbic acid).',
  },
  {
    topic: 'Analytical Chemistry',
    subtopic: 'Spectroscopy and Structure Determination',
    difficulty: 3,
    context: 'Using IR spectroscopy to identify functional groups. UV-Vis spectroscopy for coloured compounds. Mass spectrometry fragmentation patterns and molecular ion peaks.',
  },

  // ── ACIDS AND BASES ────────────────────────────────────────────────────────
  {
    topic: 'Acids and Bases',
    subtopic: 'pH, Ka, and Buffer Systems',
    difficulty: 3,
    context: 'Calculating pH of weak acids/bases using Ka or Kb. Buffer solutions: composition, how they resist pH change, Henderson-Hasselbalch equation. Acid-base equilibria in biological systems (blood, ocean).',
  },
  {
    topic: 'Acids and Bases',
    subtopic: 'Acid-Base Titrations and Indicators',
    difficulty: 2,
    context: 'Titration curves for strong acid/strong base, weak acid/strong base. Equivalence point vs endpoint. Selecting appropriate indicators. Calculating concentration from titration data.',
  },
  {
    topic: 'Acids and Bases',
    subtopic: 'Amino Acids and Proteins',
    difficulty: 3,
    context: 'Amino acid structure: zwitterionic form, isoelectric point, amphoteric nature. Peptide bond formation (condensation reaction). Primary, secondary (alpha-helix, beta-sheet), tertiary, quaternary protein structure. Denaturation. Enzyme specificity and active site.',
  },

  // ── CHEMICAL EQUILIBRIUM ────────────────────────────────────────────────────
  {
    topic: 'Chemical Equilibrium',
    subtopic: 'Equilibrium Constants and ICE Tables',
    difficulty: 3,
    context: 'Writing equilibrium constant expressions (Kc, Kp). Using ICE tables to find equilibrium concentrations. Relationship between Kc and Kp. Interpreting large vs small K values.',
  },
  {
    topic: 'Chemical Equilibrium',
    subtopic: "Le Chatelier's Principle",
    difficulty: 2,
    context: "Le Chatelier's principle applied to industrial processes. Effect of temperature, pressure, and concentration changes on equilibrium position and K value. Haber process for NH3, Contact process for SO3, NOx formation.",
  },
  {
    topic: 'Chemical Equilibrium',
    subtopic: 'Water Gas Shift Reaction and Industrial Equilibria',
    difficulty: 3,
    context: 'Water gas shift reaction: CO + H2O ⇌ CO2 + H2. Used in hydrogen production, e-fuel synthesis. Equilibrium calculations. Catalysts and their effect on rate (not position). Trade-offs between yield and reaction rate in industrial settings.',
  },

  // ── ELECTROCHEMISTRY ───────────────────────────────────────────────────────
  {
    topic: 'Electrochemistry',
    subtopic: 'Galvanic Cells and Standard Electrode Potentials',
    difficulty: 3,
    context: 'Galvanic cell construction: anode (oxidation), cathode (reduction), salt bridge function. Standard electrode potential (E°) and cell voltage calculation. Predicting spontaneity using E°cell. Daniel cell and other examples.',
  },
  {
    topic: 'Electrochemistry',
    subtopic: 'Electrolysis and Faraday\'s Laws',
    difficulty: 3,
    context: "Electrolysis: non-spontaneous redox driven by electrical energy. Faraday's laws: Q = It, n(e-) = Q/F. Calculating mass of substance deposited/liberated. Electrolysis of molten salts vs aqueous solutions. Industrial electrolysis (aluminium, chlorine, gallium).",
  },
  {
    topic: 'Electrochemistry',
    subtopic: 'Corrosion and Electrochemical Cells',
    difficulty: 2,
    context: 'Rusting as an electrochemical process. Galvanic corrosion in bimetallic couples. Cathodic protection methods (sacrificial anode, impressed current). Conditions that accelerate corrosion.',
  },

  // ── ORGANIC CHEMISTRY ──────────────────────────────────────────────────────
  {
    topic: 'Organic Chemistry',
    subtopic: 'Functional Groups and IUPAC Nomenclature',
    difficulty: 2,
    context: 'IUPAC naming of alkanes, alkenes, alcohols, aldehydes, ketones, carboxylic acids, esters, amines, amides. Identifying functional groups from structural formulas. Homologous series and general formulas.',
  },
  {
    topic: 'Organic Chemistry',
    subtopic: 'Reaction Types: Addition, Substitution, Elimination, Condensation',
    difficulty: 3,
    context: 'Mechanism types in organic chemistry: nucleophilic addition to carbonyls, electrophilic addition to alkenes (Markovnikov), SN1/SN2 substitution, E1/E2 elimination, condensation (esterification, peptide bond). Predicting products of reactions.',
  },
  {
    topic: 'Organic Chemistry',
    subtopic: 'Amines and Amides',
    difficulty: 3,
    context: 'Primary, secondary, tertiary amines and their basicity. Amine reactions with acids (salt formation). Amide formation from carboxylic acid + amine (condensation). Hydrolysis of amides. Paracetamol, GABA, and other biologically relevant amines/amides.',
  },
  {
    topic: 'Organic Chemistry',
    subtopic: 'Esters, Fats, and Biodiesel',
    difficulty: 3,
    context: 'Ester formation (Fischer esterification): carboxylic acid + alcohol, H+ catalyst, reversible. Triglyceride structure (glycerol + 3 fatty acids). Saponification (base hydrolysis). Biodiesel production by transesterification. Comparing biodiesel vs petrodiesel properties.',
  },
  {
    topic: 'Organic Chemistry',
    subtopic: 'Organic Synthesis Pathways',
    difficulty: 4,
    context: 'Multi-step synthesis: planning routes from starting material to target molecule using reactions studied. Selecting reagents and conditions. Functional group interconversion. Synthesis of pharmaceutical compounds (e.g., analgesics, sympathomimetics).',
  },

  // ── POLYMERS ────────────────────────────────────────────────────────────────
  {
    topic: 'Polymers',
    subtopic: 'Addition Polymers',
    difficulty: 2,
    context: 'Addition polymerisation: alkene monomers, free radical initiation. Polymers from ethene, propene, styrene, chloroethene (PVC), tetrafluoroethene (PTFE). Drawing repeating units from monomers and vice versa. Properties related to structure (branching, crystallinity).',
  },
  {
    topic: 'Polymers',
    subtopic: 'Condensation Polymers',
    difficulty: 3,
    context: 'Condensation polymerisation producing polyesters (PET from terephthalic acid + ethylene glycol), polyamides (nylon, Kevlar, proteins), polycarbonates, polylactic acid (PLA). Identifying monomers from polymer structure. Hydrolysis of condensation polymers. Biodegradability.',
  },
  {
    topic: 'Polymers',
    subtopic: 'Polymer Properties and Applications',
    difficulty: 2,
    context: 'Thermoplastics vs thermosets. Cross-linking and its effect on properties. Crystallinity and its effect on melting point and transparency (e.g., PMMA/perspex vs glass). Polychloroprene (neoprene) and specialty polymers. Recycling codes and environmental impact.',
  },

  // ── ENVIRONMENTAL AND GREEN CHEMISTRY ──────────────────────────────────────
  {
    topic: 'Environmental Chemistry',
    subtopic: 'Atmospheric Chemistry',
    difficulty: 3,
    context: 'Formation and reactions of atmospheric pollutants: NOx (from combustion), SO2 (from coal), ozone in troposphere vs stratosphere. Photochemical smog. Catalytic converters (platinum/palladium/rhodium). Chemical equations for these processes.',
  },
  {
    topic: 'Environmental Chemistry',
    subtopic: 'Ocean Acidification and Marine Chemistry',
    difficulty: 3,
    context: 'Ocean acidification: CO2(g) + H2O ⇌ H2CO3 ⇌ H+ + HCO3-. Effect on marine organisms (shell dissolution, coral bleaching). pH calculations for the carbonate system. Buffering capacity of seawater. Impact on calcium carbonate equilibria.',
  },
  {
    topic: 'Environmental Chemistry',
    subtopic: 'Green Chemistry and Sustainable Processes',
    difficulty: 2,
    context: '12 principles of green chemistry. Atom economy calculation. E-factor. Comparing traditional vs green synthesis routes. Hydrogen as fuel: production, storage, fuel cells. E-fuels (synthetic hydrocarbons from CO2 + H2). PFAS contamination and remediation (ion exchange).',
  },

  // ── TRANSITION METALS AND COORDINATION CHEMISTRY ──────────────────────────
  {
    topic: 'Transition Metals and Coordination Chemistry',
    subtopic: 'Transition Metal Properties and Complexes',
    difficulty: 3,
    context: 'Properties of transition metals: variable oxidation states, coloured compounds, catalytic activity, complex ion formation. Ligands (CN-, NH3, H2O, Cl-, en). Coordination number and geometry (octahedral, tetrahedral, square planar). Colour from d-d electron transitions.',
  },
  {
    topic: 'Transition Metals and Coordination Chemistry',
    subtopic: 'Extraction and Refining of Metals',
    difficulty: 3,
    context: 'Extraction of metals from ores: reduction of metal oxides (blast furnace for iron, Hall-Héroult for aluminium). Nickel extraction: roasting, reduction, electrorefining. Pyrometallurgy vs hydrometallurgy vs electrometallurgy. Thermodynamics of metal extraction (Ellingham diagrams).',
  },

  // ── BIOCHEMISTRY ─────────────────────────────────────────────────────────────
  {
    topic: 'Biochemistry',
    subtopic: 'Carbohydrates and Lipids',
    difficulty: 2,
    context: 'Monosaccharides (glucose, fructose), disaccharides (sucrose, lactose), polysaccharides (starch, cellulose, glycogen). Glycosidic bond formation. Lipid structure: triglycerides, phospholipids, steroids. Saturated vs unsaturated fatty acids. Hydrolysis of fats.',
  },
  {
    topic: 'Biochemistry',
    subtopic: 'Enzymes and Biological Catalysis',
    difficulty: 3,
    context: 'Enzyme structure and function: active site, substrate specificity (lock-and-key, induced fit). Factors affecting enzyme activity: pH, temperature, concentration. Competitive and non-competitive inhibition. Denaturation. Digestive enzymes (protease, lipase, amylase).',
  },
  {
    topic: 'Biochemistry',
    subtopic: 'Haemoglobin and Oxygen Transport',
    difficulty: 3,
    context: 'Haemoglobin: quaternary protein structure, haem group with Fe2+, cooperative binding of O2. Oxyhaemoglobin vs deoxyhaemoglobin. Effect of CO, CO2, pH on oxygen binding (Bohr effect). Iron deficiency anaemia. Carbon monoxide poisoning.',
  },

  // ── THERMOCHEMISTRY ──────────────────────────────────────────────────────────
  {
    topic: 'Thermochemistry',
    subtopic: 'Enthalpy Changes and Hess\'s Law',
    difficulty: 3,
    context: "Standard enthalpy of formation, combustion, neutralisation. Hess's Law: calculating ΔH from a series of reactions. Born-Haber cycle for ionic compounds. Bond enthalpy calculations. Comparing fuel energy densities.",
  },
  {
    topic: 'Thermochemistry',
    subtopic: 'Entropy and Gibbs Free Energy',
    difficulty: 4,
    context: 'Entropy (S) as disorder/randomness. Predicting sign of ΔS. Gibbs free energy: ΔG = ΔH - TΔS. Spontaneity: ΔG < 0. Temperature dependence of spontaneity. Relationship to equilibrium constant: ΔG° = -RT ln K.',
  },

  // ── KINETICS ────────────────────────────────────────────────────────────────
  {
    topic: 'Reaction Kinetics',
    subtopic: 'Rate Laws and Reaction Orders',
    difficulty: 3,
    context: 'Rate = k[A]^m[B]^n. Determining order from experimental data (initial rates, concentration-time graphs). Units of k. First-order half-life. Integrated rate laws. Collision theory: activation energy, orientation, frequency of collisions.',
  },
  {
    topic: 'Reaction Kinetics',
    subtopic: 'Catalysis',
    difficulty: 2,
    context: 'Homogeneous vs heterogeneous catalysis. How catalysts lower activation energy without changing ΔH or equilibrium position. Industrial catalysts: Fe in Haber process, V2O5 in Contact process, Pt/Pd/Rh in catalytic converters. Enzyme catalysis. Zeolites and hydrotalcite catalysts.',
  },
]

// ── AI generation ─────────────────────────────────────────────────────────────
async function generateQuestions(concept) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2500,
      system: [
        'You are generating multiple-choice questions for SACE Stage 2 Chemistry students in South Australia.',
        `Return only a valid JSON array containing exactly ${QUESTIONS_PER_BATCH} objects.`,
        'Each object must have EXACTLY these keys: question, options, answer_index, solution, tip, difficulty.',
        'Each options array must contain exactly 4 strings (A, B, C, D options).',
        'answer_index is 0-indexed (0=A, 1=B, 2=C, 3=D).',
        'difficulty is an integer from 1 (easy) to 5 (hard). Use 2–4 for most Stage 2 questions.',
        'solution is 1–3 sentences explaining WHY the answer is correct.',
        'tip is a short memory aid or key concept (max 15 words), or null.',
        'Questions must be distinct, varying in focus, wording, and difficulty.',
        'Make distractors plausible — common misconceptions, not obviously wrong answers.',
        'Do not include markdown, code fences, or any text outside the JSON array.',
      ].join(' '),
      messages: [{
        role: 'user',
        content: [
          `Topic: ${concept.topic}`,
          `Subtopic: ${concept.subtopic}`,
          `Context and key concepts to cover: ${concept.context}`,
          `Suggested difficulty level: ${concept.difficulty} out of 5`,
          `Generate ${QUESTIONS_PER_BATCH} SACE Stage 2 Chemistry multiple-choice questions covering this subtopic.`,
          'Vary difficulty slightly across the questions (some easier, some harder within the subtopic).',
          'Include quantitative (calculation) questions where appropriate for this topic.',
        ].join('\n'),
      }],
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Anthropic ${res.status}: ${err.slice(0, 300)}`)
  }

  const data = await res.json()
  const text = data?.content?.[0]?.text || ''

  try { const p = JSON.parse(text); if (Array.isArray(p)) return p } catch {}
  const s = text.indexOf('['), e = text.lastIndexOf(']')
  if (s !== -1 && e > s) {
    try { const p = JSON.parse(text.slice(s, e + 1)); if (Array.isArray(p)) return p } catch {}
  }
  console.log('  Raw AI response:', text.slice(0, 300))
  return []
}

// ── Build DB payload ──────────────────────────────────────────────────────────
function buildPayload(concept, questions, startId) {
  const conceptTag = `chemistry|${concept.topic}|${concept.subtopic}`.toLowerCase().replace(/\s+/g, '_')
  let idCounter = startId

  return questions
    .filter(q =>
      q.question &&
      Array.isArray(q.options) &&
      q.options.length === 4 &&
      typeof q.answer_index === 'number' &&
      q.answer_index >= 0 &&
      q.answer_index <= 3
    )
    .map(q => ({
      id:           `s2_${String(idCounter++).padStart(3, '0')}`,
      subject:      'Chemistry',
      topic:        concept.topic,
      subtopic:     concept.subtopic,
      concept_tag:  conceptTag,
      difficulty:   Math.max(1, Math.min(5, parseInt(q.difficulty, 10) || concept.difficulty || 2)),
      question:     String(q.question),
      options:      q.options.map(String),
      answer_index: Number(q.answer_index),
      solution:     q.solution ? String(q.solution) : null,
      tip:          q.tip ? String(q.tip) : null,
    }))
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\nSACE Stage 2 Chemistry — Question Import`)
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no DB writes)' : 'LIVE (inserting into Supabase)'}`)
  console.log(`Concept clusters: ${EXAM_CONCEPTS.length}`)
  console.log(`Questions per cluster: ${QUESTIONS_PER_BATCH}`)
  console.log(`Expected total: ~${EXAM_CONCEPTS.length * QUESTIONS_PER_BATCH} questions\n`)

  // Find the next available s2_ ID
  let nextId = 1
  if (!DRY_RUN) {
    const { data: existing } = await supabase
      .from('questions')
      .select('id')
      .like('id', 's2_%')
    if (existing && existing.length > 0) {
      const maxNum = Math.max(...existing.map(r => parseInt(r.id.replace('s2_', ''), 10) || 0))
      nextId = maxNum + 1
    }
    console.log(`Starting IDs from s2_${String(nextId).padStart(3, '0')}\n`)
  }

  let totalInserted = 0
  let totalFailed = 0

  for (let i = 0; i < EXAM_CONCEPTS.length; i++) {
    const concept = EXAM_CONCEPTS[i]
    const prefix = `[${String(i + 1).padStart(String(EXAM_CONCEPTS.length).length)}/${EXAM_CONCEPTS.length}]`
    process.stdout.write(`${prefix} ${concept.subtopic.slice(0, 55).padEnd(55)} → `)

    try {
      const raw = await generateQuestions(concept)
      if (!raw.length) {
        console.log('AI returned empty — skipping')
        totalFailed++
      } else {
        const payload = buildPayload(concept, raw, nextId)
        nextId += payload.length
        if (!payload.length) {
          console.log(`All ${raw.length} responses malformed — skipping`)
          totalFailed++
        } else if (DRY_RUN) {
          console.log(`✓  ${payload.length} questions (dry run)`)
          payload.forEach((q, j) => {
            console.log(`       [${j+1}] ${q.question.slice(0, 80)}`)
          })
          totalInserted += payload.length
        } else {
          const { error } = await supabase.from('questions').insert(payload)
          if (error) {
            console.log(`Insert failed: ${error.message}`)
            totalFailed++
          } else {
            console.log(`✓  +${payload.length} questions`)
            totalInserted += payload.length
          }
        }
      }
    } catch (err) {
      console.log(`Error: ${err.message}`)
      totalFailed++
    }

    // Rate limit (skip after last)
    if (i < EXAM_CONCEPTS.length - 1) {
      await new Promise(r => setTimeout(r, RATE_LIMIT_MS))
    }
  }

  console.log(`\n─────────────────────────────────────────────────`)
  console.log(`Done!`)
  console.log(`  ✓ ${totalInserted} questions ${DRY_RUN ? 'generated (dry run)' : 'inserted into DB'}`)
  console.log(`  ✗ ${totalFailed} clusters failed`)
  if (!DRY_RUN) {
    console.log(`\nYour Stage 2 Chemistry question bank is now populated!`)
    console.log(`Run populate-variants.js next to generate remediation variants for the new questions.`)
  }
}

main().catch(err => { console.error('\nFatal:', err); process.exit(1) })
