import { useState } from 'react'
import { supabase } from '../lib/supabase'
import MathText from './MathText'
import GraphView from './GraphView'

const FONT_B = "'Plus Jakarta Sans', sans-serif"
const GOLD   = '#f1be43'
const OPTION_LABELS = ['A', 'B', 'C', 'D']

export default function AdminQuestionPreviewTab() {
  const [idInput,   setIdInput]   = useState('')
  const [question,  setQuestion]  = useState(null)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState(null)
  const [revealed,  setRevealed]  = useState(false)

  async function lookup() {
    const id = idInput.trim()
    if (!id) return
    setLoading(true)
    setError(null)
    setQuestion(null)
    setRevealed(false)

    // Try live questions first, then draft_questions
    let { data, error: err } = await supabase
      .from('questions')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (err) { setError(err.message); setLoading(false); return }

    if (!data) {
      ;({ data, error: err } = await supabase
        .from('draft_questions')
        .select('*')
        .eq('id', id)
        .maybeSingle())
      if (err) { setError(err.message); setLoading(false); return }
      if (data) data = { ...data, _source: 'draft' }
    } else {
      data = { ...data, _source: 'live' }
    }

    if (!data) setError(`No question found with id "${id}"`)
    else {
      setQuestion({
        ...data,
        options: typeof data.options === 'string' ? JSON.parse(data.options) : data.options,
        graph:   typeof data.graph   === 'string' ? JSON.parse(data.graph)   : data.graph,
      })
    }
    setLoading(false)
  }

  const s = styles

  return (
    <div style={s.page}>
      <h2 style={s.heading}>Question Preview</h2>
      <p style={s.sub}>Look up any question by ID to preview exactly how it renders in the quiz — including graphs, LaTeX, and answer reveal.</p>

      {/* Search */}
      <div style={s.searchRow}>
        <input
          style={s.input}
          placeholder="Question ID  e.g. test_graph_01"
          value={idInput}
          onChange={e => setIdInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && lookup()}
          spellCheck={false}
        />
        <button style={s.btn} onClick={lookup} disabled={loading}>
          {loading ? 'Loading…' : 'Preview'}
        </button>
      </div>

      {error && <p style={s.error}>{error}</p>}

      {question && (
        <div style={s.card}>
          {/* Meta */}
          <div style={s.metaRow}>
            <span style={s.badge('#4f8ef7')}>{question._source === 'draft' ? 'Draft' : 'Live'}</span>
            <span style={s.badge(GOLD)}>{question.subject}</span>
            <span style={s.metaText}>{question.topic}</span>
            {question.subtopic && <span style={s.metaText}>· {question.subtopic}</span>}
            <span style={s.metaText}>· difficulty {question.difficulty}</span>
          </div>

          {/* Graph */}
          {question.graph && (
            <div style={{ marginBottom: 18 }}>
              <GraphView graph={question.graph} theme="dark" />
            </div>
          )}

          {/* Question text */}
          <div style={s.questionText}>
            <MathText text={question.question} />
          </div>

          {/* Options */}
          <div style={s.optionsWrap}>
            {(question.options || []).map((opt, i) => {
              const isCorrect = i === question.answer_index
              let bg     = 'rgba(255,255,255,0.04)'
              let border = '1px solid rgba(255,255,255,0.1)'
              let color  = 'rgba(255,255,255,0.7)'
              let lBg    = 'rgba(255,255,255,0.1)'
              let lCol   = '#fff'

              if (revealed && isCorrect) {
                bg     = 'rgba(16,185,129,0.1)'
                border = '1px solid rgba(16,185,129,0.35)'
                color  = '#4ade80'
                lBg    = 'rgba(16,185,129,0.2)'
                lCol   = '#4ade80'
              }

              return (
                <div key={i} style={{ ...s.option, background: bg, border, color }}>
                  <span style={{ ...s.optLabel, background: lBg, color: lCol }}>
                    {revealed && isCorrect ? '✓' : OPTION_LABELS[i]}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <MathText text={opt} />
                  </span>
                </div>
              )
            })}
          </div>

          {/* Reveal / solution */}
          {!revealed ? (
            <button style={s.revealBtn} onClick={() => setRevealed(true)}>Reveal Answer</button>
          ) : (
            <div style={s.solution}>
              <span style={s.solutionLabel}>Solution</span>
              <MathText text={question.solution || 'No solution provided.'} />
            </div>
          )}

          {/* Raw graph spec */}
          {question.graph && (
            <details style={s.details}>
              <summary style={s.summary}>Raw graph spec</summary>
              <pre style={s.pre}>{JSON.stringify(question.graph, null, 2)}</pre>
            </details>
          )}
        </div>
      )}
    </div>
  )
}

const styles = {
  page: { padding: '28px 32px', maxWidth: 680, fontFamily: FONT_B },
  heading: { color: '#fff', fontSize: 20, fontWeight: 800, margin: '0 0 6px' },
  sub: { color: 'rgba(255,255,255,0.4)', fontSize: 13, margin: '0 0 24px' },
  searchRow: { display: 'flex', gap: 8, marginBottom: 20 },
  input: {
    flex: 1,
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 8,
    color: '#fff',
    fontSize: 14,
    padding: '10px 14px',
    fontFamily: FONT_B,
    outline: 'none',
  },
  btn: {
    background: GOLD,
    border: 'none',
    borderRadius: 8,
    color: '#080d28',
    fontSize: 14,
    fontWeight: 800,
    padding: '10px 20px',
    cursor: 'pointer',
    fontFamily: FONT_B,
  },
  error: { color: '#f87171', fontSize: 13, margin: '0 0 16px' },
  card: {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 14,
    padding: 24,
  },
  metaRow: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 18 },
  badge: (color) => ({
    background: `${color}22`,
    border: `1px solid ${color}55`,
    color,
    borderRadius: 999,
    padding: '2px 10px',
    fontSize: 11,
    fontWeight: 700,
  }),
  metaText: { color: 'rgba(255,255,255,0.4)', fontSize: 12 },
  questionText: { color: '#fff', fontSize: 16, fontWeight: 700, lineHeight: 1.7, marginBottom: 18 },
  optionsWrap: { display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 },
  option: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    borderRadius: 10,
    padding: '11px 14px',
    fontSize: 14,
    fontWeight: 600,
    transition: 'all 0.15s',
  },
  optLabel: {
    width: 28,
    height: 28,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 11,
    fontWeight: 800,
    flexShrink: 0,
  },
  revealBtn: {
    background: 'rgba(241,190,67,0.12)',
    border: `1px solid rgba(241,190,67,0.3)`,
    borderRadius: 8,
    color: GOLD,
    fontSize: 13,
    fontWeight: 700,
    padding: '9px 18px',
    cursor: 'pointer',
    fontFamily: FONT_B,
    marginBottom: 0,
  },
  solution: {
    background: 'rgba(16,185,129,0.07)',
    border: '1px solid rgba(16,185,129,0.2)',
    borderRadius: 10,
    padding: '14px 16px',
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
    lineHeight: 1.7,
    marginTop: 4,
  },
  solutionLabel: {
    display: 'block',
    color: '#4ade80',
    fontSize: 11,
    fontWeight: 700,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  details: { marginTop: 16 },
  summary: { color: 'rgba(255,255,255,0.3)', fontSize: 12, cursor: 'pointer', userSelect: 'none' },
  pre: {
    background: 'rgba(0,0,0,0.3)',
    borderRadius: 8,
    padding: 12,
    fontSize: 11,
    color: 'rgba(255,255,255,0.6)',
    overflowX: 'auto',
    marginTop: 8,
  },
}
