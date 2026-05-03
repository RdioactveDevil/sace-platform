#!/usr/bin/env node
/**
 * populate-variants.js
 *
 * Pre-generates 5 remediation variants per question and stores them in
 * the question_variants table. Run this once after adding new questions,
 * or whenever you want to top-up the variant pool.
 *
 * Each question that already has MIN_VARIANTS or more is skipped.
 * Every variant generated is saved to the DB so the pool grows over time
 * and the live app relies on AI generation less and less.
 *
 * Usage (Node 18+):
 *   ANTHROPIC_API_KEY=sk-ant-...  SUPABASE_SERVICE_KEY=ey...  node scripts/populate-variants.js
 *
 * SUPABASE_SERVICE_KEY — from supabase.com → your project → Settings → API → service_role (secret)
 * ANTHROPIC_API_KEY   — from console.anthropic.com
 */

'use strict'

const { createClient } = require('@supabase/supabase-js')

// ── Config ──────────────────────────────────────────────────────────────────
const SUPABASE_URL        = 'https://pslpxawrfpcuwnupdfbs.supabase.co'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
const ANTHROPIC_API_KEY   = process.env.ANTHROPIC_API_KEY
const MIN_VARIANTS        = 3   // skip questions that already have this many
const VARIANTS_PER_BATCH  = 5   // how many to generate per question
const RATE_LIMIT_MS       = 2000 // ms between API calls (~30 req/min, safe for Haiku)

// ── Guards ───────────────────────────────────────────────────────────────────
if (!SUPABASE_SERVICE_KEY) {
  console.error('ERROR: SUPABASE_SERVICE_KEY is not set.')
  console.error('  Get it from: supabase.com → your project → Settings → API → service_role (secret)')
  console.error('  Usage: ANTHROPIC_API_KEY=sk-... SUPABASE_SERVICE_KEY=ey... node scripts/populate-variants.js')
  process.exit(1)
}
if (!ANTHROPIC_API_KEY) {
  console.error('ERROR: ANTHROPIC_API_KEY is not set.')
  console.error('  Get it from: console.anthropic.com')
  process.exit(1)
}
if (typeof fetch === 'undefined') {
  console.error('ERROR: This script requires Node.js 18 or newer (for native fetch).')
  process.exit(1)
}

// ── Supabase client (service role bypasses RLS) ──────────────────────────────
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// ── AI call ──────────────────────────────────────────────────────────────────
async function generateVariants(question) {
  const correctAnswer = Array.isArray(question.options)
    ? question.options[question.answer_index] || ''
    : ''
  const conceptTag = question.concept_tag ||
    `${question.subject}|${question.topic}|${question.subtopic}`.toLowerCase()

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      system: [
        'You are generating remediation MCQs for a SACE Chemistry student.',
        `Return only a valid JSON array containing exactly ${VARIANTS_PER_BATCH} objects.`,
        'Each object must have these keys: question, options, answer_index, solution, tip, difficulty, topic, subtopic, concept_tag, variant_type.',
        'Each options array must contain exactly 4 strings.',
        'variant_type must always be "generated".',
        'Keep the same underlying concept, but vary wording, values, or context.',
        'Do not include markdown, code fences, or commentary outside the JSON array.',
      ].join(' '),
      messages: [{
        role: 'user',
        content: [
          `Topic: ${question.topic}`,
          `Subtopic: ${question.subtopic}`,
          `Concept tag: ${conceptTag}`,
          `Original question: ${question.question}`,
          `Correct answer: ${correctAnswer}`,
          `Original solution: ${question.solution}`,
          `Generate ${VARIANTS_PER_BATCH} targeted remediation questions that test the same concept but are not copies.`,
        ].join('\n'),
      }],
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Anthropic ${res.status}: ${err.slice(0, 200)}`)
  }

  const data = await res.json()
  const text = data?.content?.[0]?.text || ''

  // Try direct parse first, then bracket extraction
  try { const p = JSON.parse(text); if (Array.isArray(p)) return p } catch {}
  const s = text.indexOf('['), e = text.lastIndexOf(']')
  if (s !== -1 && e > s) {
    try { const p = JSON.parse(text.slice(s, e + 1)); if (Array.isArray(p)) return p } catch {}
  }
  return []
}

// ── Insert helpers ────────────────────────────────────────────────────────────
function buildPayload(parentQuestion, variants) {
  return variants
    .filter(v => v.question && Array.isArray(v.options) && v.options.length === 4)
    .map(v => ({
      parent_question_id: parentQuestion.id,
      variant_type:       'generated',
      subject:            v.subject   || parentQuestion.subject  || 'Chemistry',
      topic:              v.topic     || parentQuestion.topic,
      subtopic:           v.subtopic  || parentQuestion.subtopic,
      concept_tag:        v.concept_tag || parentQuestion.concept_tag,
      difficulty:         Math.max(1, Math.min(5, parseInt(v.difficulty, 10) || parseInt(parentQuestion.difficulty, 10) || 1)),
      question:           String(v.question),
      options:            v.options,
      answer_index:       Number(v.answer_index ?? 0),
      solution:           v.solution  || parentQuestion.solution,
      tip:                v.tip       || null,
      source:             'ai_generated',
    }))
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  // 1. Fetch all questions
  console.log('Fetching questions from Supabase...')
  const { data: questions, error: qErr } = await supabase.from('questions').select('*')
  if (qErr) { console.error('Failed to fetch questions:', qErr.message); process.exit(1) }
  console.log(`  Found ${questions.length} questions.\n`)

  // 2. Count existing variants per question
  const { data: existing, error: vErr } = await supabase
    .from('question_variants')
    .select('parent_question_id')
  if (vErr) { console.error('Failed to fetch variant counts:', vErr.message); process.exit(1) }

  const variantCount = {}
  for (const row of existing || []) {
    variantCount[row.parent_question_id] = (variantCount[row.parent_question_id] || 0) + 1
  }

  // 3. Filter to questions that need more variants
  const queue = questions.filter(q => (variantCount[q.id] || 0) < MIN_VARIANTS)
  console.log(`${questions.length - queue.length} questions already have ${MIN_VARIANTS}+ variants — skipping.`)
  console.log(`${queue.length} questions need variants.\n`)

  if (!queue.length) {
    console.log('Nothing to do. All questions are covered!')
    return
  }

  // 4. Generate and insert
  let ok = 0, fail = 0

  for (let i = 0; i < queue.length; i++) {
    const q = queue[i]
    const has = variantCount[q.id] || 0
    const prefix = `[${String(i + 1).padStart(String(queue.length).length)}/${queue.length}]`
    process.stdout.write(`${prefix} ${q.question.slice(0, 70).padEnd(70)} (has ${has}) → `)

    try {
      const raw = await generateVariants(q)
      if (!raw.length) {
        console.log('AI returned empty — skipping')
        fail++
      } else {
        const payload = buildPayload(q, raw)
        if (!payload.length) {
          console.log('Variants malformed — skipping')
          fail++
        } else {
          const { error: insertErr } = await supabase.from('question_variants').insert(payload)
          if (insertErr) {
            console.log(`Insert failed: ${insertErr.message}`)
            fail++
          } else {
            console.log(`✓  +${payload.length} variants`)
            ok++
          }
        }
      }
    } catch (err) {
      console.log(`Error: ${err.message}`)
      fail++
    }

    // Rate limit between calls (skip delay after last item)
    if (i < queue.length - 1) {
      await new Promise(r => setTimeout(r, RATE_LIMIT_MS))
    }
  }

  console.log(`\n─────────────────────────────`)
  console.log(`Done.  ✓ ${ok} succeeded   ✗ ${fail} failed`)
  console.log(`The question_variants table now has richer coverage.`)
  console.log(`Re-run anytime you add new questions to the DB.`)
}

main().catch(err => { console.error('\nFatal:', err); process.exit(1) })
