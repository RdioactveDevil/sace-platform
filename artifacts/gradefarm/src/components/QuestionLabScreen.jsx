import { useState } from 'react'
import { THEMES } from '../lib/theme'
import { getQuestionType, describeCorrectAnswer } from '../lib/questionTypes'
import MathText from './MathText'
import GraphView from './GraphView'
import TableView from './TableView'
import QuestionRenderer from './questions/QuestionRenderer'
import QuizToolsDock from './QuizToolsDock'

const GOLD = '#f1be43'
const GOLDL = '#f9d87a'
const NAVY = '#0c1037'
const FONT_B = "'Plus Jakarta Sans', sans-serif"
const FONT_D = "'Sifonn Pro', sans-serif"

// Sample questions showcasing every supported format. These are local demo data
// only — they prove the multi-format engine end to end without touching the DB.
const SAMPLES = [
  {
    id: 'demo-mcq',
    label: 'Multiple choice',
    question_type: 'mcq',
    subject: 'Chemistry', topic: 'Acids & Bases', subtopic: 'pH',
    question: 'What is the pH of a $0.01\\ \\text{mol L}^{-1}$ solution of HCl?',
    options: ['1', '2', '12', '0.01'],
    answer_index: 1,
    difficulty: 2,
    solution: 'HCl is a strong acid, so $[\\text{H}^+] = 0.01 = 10^{-2}$, giving $\\text{pH} = -\\log_{10}(10^{-2}) = 2$.',
    tip: 'For a strong monoprotic acid, pH = −log(concentration).',
  },
  {
    id: 'demo-graph-mcq',
    label: 'MCQ with graph',
    question_type: 'mcq',
    subject: 'Mathematics', topic: 'Functions', subtopic: 'Parabolas',
    question: 'How many real roots does the function shown below have?',
    graph: { functions: [{ expr: 'x**2 - 4' }], xRange: [-5, 5], yRange: [-6, 6] },
    options: ['0', '1', '2', '3'],
    answer_index: 2,
    difficulty: 2,
    solution: 'The curve $y = x^2 - 4$ crosses the x-axis at $x = -2$ and $x = 2$, so there are 2 real roots.',
  },
  {
    id: 'demo-table-mcq',
    label: 'MCQ with table',
    question_type: 'mcq',
    subject: 'Chemistry', topic: 'Reaction Rates', subtopic: 'Data interpretation',
    question: 'Based on the rate data, what is the order of reaction with respect to [A]?',
    table_data: {
      headers: ['[A] (mol/L)', 'Rate (mol/L·s)'],
      rows: [['0.1', '0.02'], ['0.2', '0.08'], ['0.3', '0.18']],
      caption: 'Initial rate vs concentration',
    },
    options: ['Zero order', 'First order', 'Second order', 'Third order'],
    answer_index: 2,
    difficulty: 3,
    solution: 'Doubling [A] from 0.1 to 0.2 quadruples the rate (×4 = 2²), so the reaction is second order in [A].',
  },
  {
    id: 'demo-numeric',
    label: 'Numeric answer',
    question_type: 'numeric',
    subject: 'Physics', topic: 'Kinematics', subtopic: 'Free fall',
    question: 'A ball is dropped from rest. Using $g = 9.8\\ \\text{m s}^{-2}$, what is its speed after 3.0 s?',
    answer: 29.4, tolerance: 0.2, unit: 'm/s',
    difficulty: 2,
    solution: '$v = u + gt = 0 + 9.8 \\times 3.0 = 29.4\\ \\text{m s}^{-1}$.',
    tip: 'Start from rest means initial velocity u = 0.',
  },
  {
    id: 'demo-multi',
    label: 'Multiple select',
    question_type: 'multi_select',
    subject: 'Chemistry', topic: 'Periodic Table', subtopic: 'Element classification',
    question: 'Which of the following are noble gases? (Select all that apply.)',
    options: ['Neon', 'Chlorine', 'Argon', 'Sodium'],
    answer_indices: [0, 2],
    difficulty: 1,
    solution: 'Neon and Argon are in Group 18 (noble gases). Chlorine is a halogen; sodium is an alkali metal.',
  },
  {
    id: 'demo-short',
    label: 'Short answer',
    question_type: 'short_text',
    subject: 'Chemistry', topic: 'Nomenclature', subtopic: 'Formulae',
    question: 'What is the chemical formula of water? (Type it exactly, e.g. CO2)',
    accept: ['H2O'], case_sensitive: true,
    difficulty: 1,
    solution: 'Water is $\\ce{H2O}$ — two hydrogen atoms bonded to one oxygen atom.',
  },
  {
    id: 'demo-order',
    label: 'Put in order',
    question_type: 'order',
    subject: 'Biology', topic: 'Cell Division', subtopic: 'Mitosis',
    question: 'Arrange the phases of mitosis in the correct order.',
    items: ['Prophase', 'Metaphase', 'Anaphase', 'Telophase'],
    difficulty: 2,
    solution: 'Mitosis proceeds Prophase → Metaphase → Anaphase → Telophase (mnemonic: "PMAT").',
  },
]

export default function QuestionLabScreen({ theme = 'dark' }) {
  const t = THEMES[theme]
  const [idx, setIdx] = useState(0)
  const [response, setResponse] = useState(null)
  const [showAns, setShowAns] = useState(false)
  const [correct, setCorrect] = useState(null)

  const q = SAMPLES[idx]

  const pick = (i) => { setIdx(i); setResponse(null); setShowAns(false); setCorrect(null) }

  // MCQ answers instantly on click; other types submit via the renderer.
  const answerMcq = (i) => {
    if (showAns) return
    setResponse(i); setShowAns(true); setCorrect(i === q.answer_index)
  }
  const submit = (resp, isCorrect) => { setResponse(resp); setShowAns(true); setCorrect(isCorrect) }

  return (
    <div style={{ minHeight: '100vh', background: t.bg, fontFamily: FONT_B, padding: '32px 20px 80px' }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 14px', borderRadius: 999, background: t.accentGlow, border: `1px solid ${t.borderAccent}`, color: GOLD, fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>
            🧪 Question Lab
          </div>
          <div style={{ fontFamily: FONT_D, fontSize: 26, color: t.text, letterSpacing: 1 }}>Multi-format question engine</div>
          <div style={{ fontSize: 13, color: t.textMuted, marginTop: 6, lineHeight: 1.6 }}>
            Live preview of every question type the platform now supports. Try answering each one.
          </div>
        </div>

        {/* Type switcher */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, justifyContent: 'center', marginBottom: 22 }}>
          {SAMPLES.map((s, i) => (
            <button key={s.id} onClick={() => pick(i)}
              style={{
                padding: '7px 13px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B,
                border: `1px solid ${i === idx ? t.borderAccent : t.border}`,
                background: i === idx ? t.accentGlow : t.bgCard,
                color: i === idx ? GOLD : t.textMuted,
              }}>{s.label}</button>
          ))}
        </div>

        {/* Question card */}
        <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 20, padding: 28, boxShadow: t.shadowCard }}>
          {q.graph && <GraphView graph={q.graph} theme={theme} />}
          {q.table_data && <TableView table={q.table_data} theme={theme} />}
          <div style={{ fontSize: 17, fontWeight: 700, color: t.text, lineHeight: 1.7, marginBottom: 22 }}>
            <MathText text={q.question} />
          </div>

          {getQuestionType(q) === 'mcq' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {q.options.map((opt, i) => {
                const isCorrectOpt = i === q.answer_index
                const isSelectedOpt = i === response
                let bg = t.bgSubtle, border = `1px solid ${t.border}`, color = t.textSub, lBg = t.borderMid, lCol = t.text
                if (showAns) {
                  if (isCorrectOpt) { bg = t.successBg; border = `1px solid ${t.success}55`; color = t.success; lBg = `${t.success}33`; lCol = t.success }
                  else if (isSelectedOpt && !correct) { bg = t.dangerBg; border = `1px solid ${t.danger}55`; color = t.danger; lBg = `${t.danger}33`; lCol = t.danger }
                  else { bg = 'transparent'; color = t.textFaint; lCol = t.textFaint }
                }
                return (
                  <button key={i} onClick={() => answerMcq(i)} style={{ background: bg, border, color, padding: '12px 16px', borderRadius: 11, fontSize: 14, fontWeight: 600, textAlign: 'left', cursor: showAns ? 'default' : 'pointer', fontFamily: FONT_B, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ width: 28, height: 28, borderRadius: '50%', background: lBg, color: lCol, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0 }}>
                      {showAns && isCorrectOpt ? '✓' : showAns && isSelectedOpt ? '✗' : String.fromCharCode(65 + i)}
                    </span>
                    <span style={{ minWidth: 0, flex: 1 }}><MathText text={opt} /></span>
                  </button>
                )
              })}
            </div>
          ) : (
            <QuestionRenderer question={q} response={response} onChange={setResponse} showAns={showAns} onSubmit={submit} theme={theme} />
          )}
        </div>

        {/* Result + explanation */}
        {showAns && (
          <div style={{ marginTop: 14, background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 16, padding: 20 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 14px', borderRadius: 20, marginBottom: 14, background: correct ? t.successBg : t.dangerBg, border: `1px solid ${correct ? t.success + '55' : t.danger + '55'}`, fontSize: 13, fontWeight: 700, color: correct ? t.success : t.danger }}>
              {correct ? '✓ Correct' : '✗ Not quite'}
            </div>
            <div style={{ fontSize: 11, color: t.textFaint, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Explanation</div>
            <div style={{ fontSize: 14, color: t.textMuted, lineHeight: 1.8 }}><MathText text={q.solution} /></div>
            {q.tip && (
              <div style={{ marginTop: 14, padding: '12px 14px', background: t.accentGlow2, borderRadius: '0 10px 10px 0', borderLeft: `3px solid ${GOLD}`, fontSize: 13, color: GOLD, lineHeight: 1.65 }}>
                💡 <MathText text={q.tip} />
              </div>
            )}
            <button onClick={() => pick((idx + 1) % SAMPLES.length)}
              style={{ marginTop: 16, width: '100%', padding: '13px', borderRadius: 12, border: 'none', background: `linear-gradient(135deg,${GOLD},${GOLDL})`, color: NAVY, fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: FONT_B }}>
              Next format →
            </button>
          </div>
        )}
      </div>

      <QuizToolsDock theme={theme} />
    </div>
  )
}
