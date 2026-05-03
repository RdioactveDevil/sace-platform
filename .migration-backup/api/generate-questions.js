import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://pslpxawrfpcuwnupdfbs.supabase.co'

const S1_TOPICS = {
  '1.1': 'Properties and uses of materials',
  '1.2': 'Atomic structure',
  '1.3': 'Quantities of atoms',
  '2.1': 'Types of materials',
  '2.2': 'Bonding between atoms',
  '2.3': 'Quantities of molecules and ions',
  '3.1': 'Molecule polarity',
  '3.2': 'Interactions between molecules',
  '3.3': 'Hydrocarbons',
  '3.4': 'Polymers',
  '4.1': 'Miscibility and solutions',
  '4.2': 'Solutions of ionic substances',
  '4.3': 'Quantities in reactions',
  '4.4': 'Energy in reactions',
  '5.1': 'Acid\u2013base concepts',
  '5.2': 'Reactions of acids and bases',
  '5.3': 'The pH scale',
  '6.1': 'Concepts of oxidation and reduction',
  '6.2': 'Metal reactivity',
  '6.3': 'Electrochemistry',
}

const S2_TOPICS = {
  '1.1': 'Global warming and climate change',
  '1.2': 'Photochemical smog',
  '1.3': 'Volumetric analysis',
  '1.4': 'Chromatography',
  '1.5': 'Atomic spectroscopy',
  '2.1': 'Rates of reactions',
  '2.2': 'Equilibrium and yield',
  '2.3': 'Optimising production',
  '3.1': 'Introduction to organic chemistry',
  '3.2': 'Alcohols',
  '3.3': 'Aldehydes and ketones',
  '3.4': 'Carbohydrates',
  '3.5': 'Carboxylic acids',
  '3.6': 'Amines',
  '3.7': 'Esters',
  '3.8': 'Amides',
  '3.9': 'Triglycerides',
  '3.10': 'Proteins',
  '4.1': 'Energy resources',
  '4.2': 'Water',
  '4.3': 'Soil',
  '4.4': 'Materials resources',
}

function extractJsonArray(text = '') {
  try {
    const parsed = JSON.parse(text)
    return Array.isArray(parsed) ? parsed : []
  } catch {}
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start === -1 || end <= start) return []
  try {
    const parsed = JSON.parse(text.slice(start, end + 1))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { stage, topicCode, count = 10, difficulty = 'mixed' } = req.body
  if (!stage || !topicCode) return res.status(400).json({ error: 'stage and topicCode required' })

  const stageKey = stage === 'Chemistry Stage 1' ? 's1' : 's2'
  const topicMap = stageKey === 's1' ? S1_TOPICS : S2_TOPICS
  const topicName = topicMap[topicCode]
  if (!topicName) return res.status(400).json({ error: `Unknown topic code: ${topicCode}` })

  const difficultyInstruction = difficulty === 'mixed'
    ? 'Vary difficulty across questions: include easy (1\u20132), medium (3), and hard (4\u20135) questions.'
    : `All questions should have difficulty ${difficulty} out of 5.`

  const system = [
    'You are generating multiple-choice questions for SACE Chemistry students.',
    'Return ONLY a valid JSON array. No markdown, no commentary outside the array.',
    `Generate exactly ${count} questions.`,
    'Each object must have these exact keys:',
    '  question (string)',
    '  options (array of exactly 4 strings)',
    '  answer_index (integer 0\u20133)',
    '  solution (string \u2014 explain why the answer is correct, 2\u20134 sentences)',
    '  subtopic (short free-text label for the specific concept, e.g. "Le Chatelier\'s principle")',
    '  difficulty (integer 1\u20135)',
    'Questions must be accurate, unambiguous, and test conceptual understanding.',
    'Do not repeat the same scenario across questions.',
    difficultyInstruction,
  ].join('\n')

  const user = `Generate ${count} MCQs for the SACE ${stage} topic: ${topicName} (${topicCode}).`

  let claudeResponse
  try {
    claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        max_tokens: 6000,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    })
  } catch (err) {
    return res.status(500).json({ error: 'Failed to reach Claude API', detail: err.message })
  }

  if (!claudeResponse.ok) {
    const errText = await claudeResponse.text()
    return res.status(500).json({ error: 'Claude API error', detail: errText })
  }

  const claudeData = await claudeResponse.json()
  const rawText = claudeData?.content?.[0]?.text || ''
  const questions = extractJsonArray(rawText)

  if (!questions.length) {
    return res.status(200).json({ inserted: 0, message: 'No questions generated' })
  }

  const rows = questions.map(q => ({
    source: 'ai_generated',
    subject: stage,
    topic_code: topicCode,
    topic: topicName,
    subtopic: q.subtopic || null,
    question: q.question,
    options: q.options,
    answer_index: q.answer_index,
    solution: q.solution || null,
    difficulty: q.difficulty || null,
    status: 'pending',
  }))

  const supabaseAdmin = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  const { error } = await supabaseAdmin.from('draft_questions').insert(rows)
  if (error) return res.status(500).json({ error: error.message })

  return res.status(200).json({ inserted: rows.length })
}
