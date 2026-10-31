import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { ui, btn, note, FONT_B } from '../lib/adminUi'
import MathText from './MathText'

// A bank question as admins see it (answer key, what students picked) with the
// ways to fix it, and the editor for its text, options, answer and solution.
// Used by Reports, Student flags and the question Bank.

const LETTERS = 'ABCDEFGH'
export const parseOptions = (o) => {
  if (Array.isArray(o)) return o
  try { return JSON.parse(o) || [] } catch { return [] }
}

/**
 * A question with its answer key and what students picked, and the ways to
 * settle it. Only the handlers passed in show as buttons.
 */
export function QuestionPanel({ questionId, q, meta, outcome, open, busy, reporterId, reporterName, onSetAnswer, onDismiss, onRecheck, onEdit, onDelete, onClearFlags, onPreview }) {
  const options = parseOptions(q?.options)
  const [pick, setPick] = useState(null)
  const [picks, setPicks] = useState(null) // { index: count } from students' answers
  const [reporterPick, setReporterPick] = useState(null)
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // What students chose on this question, and what the reporting student chose.
  useEffect(() => {
    let cancelled = false
    supabase.from('answer_log').select('user_id, selected, answered_at').eq('question_id', questionId).limit(1000)
      .then(({ data }) => {
        if (cancelled || !data) return
        const m = {}
        data.forEach(a => { if (a.selected != null) m[a.selected] = (m[a.selected] || 0) + 1 })
        setPicks(m)
        if (reporterId) {
          const mine = data.filter(a => a.user_id === reporterId && a.selected != null).sort((a, b) => (a.answered_at < b.answered_at ? 1 : -1))[0]
          setReporterPick(mine ? Number(mine.selected) : null)
        }
      })
    return () => { cancelled = true }
  }, [questionId, reporterId])
  const totalPicks = picks ? Object.values(picks).reduce((s, n) => s + n, 0) : 0

  if (editing && q) {
    return <QuestionEditor q={q} busy={busy} onCancel={() => setEditing(false)} onSave={async (fields) => { if (await onEdit(fields)) setEditing(false) }} />
  }

  return (
    <div style={{ ...ui.card, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
      <div style={{ fontSize: 12.5, color: 'var(--t-textMuted)' }}>{meta}</div>
      {q && <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--t-text)', lineHeight: 1.5 }}><MathText text={q.question} /></div>}

      {q && options.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {options.map((opt, i) => {
            const isKey = i === q.answer_index
            const chosen = pick === i
            const n = picks?.[i] || 0
            return (
              <button key={i} type="button" disabled={!open || !onSetAnswer} onClick={() => setPick(chosen ? null : i)} aria-pressed={chosen}
                style={{ display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', padding: '8px 11px', borderRadius: 9, fontFamily: FONT_B, fontSize: 13.5, color: 'var(--t-text)', cursor: open ? 'pointer' : 'default',
                  background: chosen ? 'var(--t-bgSubtle)' : 'var(--t-bgCard)', border: `1px solid ${chosen ? 'var(--t-text)' : isKey ? 'var(--t-success)' : 'var(--t-border)'}` }}>
                <span style={{ fontWeight: 800, color: 'var(--t-textMuted)', width: 14 }}>{LETTERS[i]}</span>
                <span style={{ flex: 1, minWidth: 0 }}><MathText text={String(opt)} /></span>
                {reporterPick === i && <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--t-textSub)', whiteSpace: 'nowrap' }}>{reporterName ? `${reporterName.split(' ')[0]}’s answer` : 'Their answer'}</span>}
                {isKey && <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--t-success)', whiteSpace: 'nowrap' }}>Answer key</span>}
                {totalPicks > 0 && <span style={{ fontSize: 12, color: 'var(--t-textMuted)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{n} of {totalPicks}</span>}
              </button>
            )
          })}
          {totalPicks > 0 && <div style={ui.hint}>The counts are what students picked, from {totalPicks} answer{totalPicks === 1 ? '' : 's'}.</div>}
        </div>
      )}

      {outcome && <div style={{ fontSize: 13, color: 'var(--t-textSub)', lineHeight: 1.55 }}>{outcome}</div>}

      {q && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {open && onSetAnswer && (
            <button type="button" style={btn('primary', !!busy || pick == null || pick === q.answer_index)} disabled={!!busy || pick == null || pick === q.answer_index}
              title={pick == null ? 'Pick the right option above first' : ''}
              onClick={() => onSetAnswer(pick)}>
              {pick == null || pick === q.answer_index ? 'Pick the right option' : `Set answer to ${LETTERS[pick]}`}
            </button>
          )}
          {onEdit && <button type="button" style={btn('secondary', !!busy)} disabled={!!busy} onClick={() => setEditing(true)}>Edit question</button>}
          {open && onDismiss && <button type="button" style={btn('secondary', !!busy)} disabled={!!busy} onClick={onDismiss}>Question is right</button>}
          {onClearFlags && <button type="button" style={btn('secondary', !!busy)} disabled={!!busy} onClick={onClearFlags}>Clear flags</button>}
          {onRecheck && <button type="button" style={btn('secondary', !!busy)} disabled={!!busy} onClick={onRecheck}>{busy === 'recheck' ? 'Checking…' : 'Check again with AI'}</button>}
          <button type="button" style={btn('secondary')} onClick={onPreview}>Open in preview</button>
          {onDelete && <button type="button" style={{ ...btn('danger', !!busy), marginLeft: 'auto' }} disabled={!!busy} onClick={() => setConfirmDelete(true)}>Remove</button>}
        </div>
      )}
      {confirmDelete && (
        <div style={{ ...note('danger'), display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ flex: '1 1 240px', color: 'var(--t-text)' }}>Remove this question from the bank? Its similar-question variants, flags and students’ review history for it go too. This can’t be undone.</span>
          <button type="button" style={{ ...btn('primary'), background: 'var(--t-danger)', color: '#fff' }} disabled={!!busy} onClick={async () => { setConfirmDelete(false); await onDelete() }}>Remove</button>
          <button type="button" style={btn('secondary')} onClick={() => setConfirmDelete(false)}>Cancel</button>
        </div>
      )}
    </div>
  )
}

/** Rewrite a question's text, options, right answer, worked solution and level. */
export function QuestionEditor({ q, busy, onSave, onCancel }) {
  const [question, setQuestion] = useState(q.question || '')
  const [options, setOptions] = useState(parseOptions(q.options).map(String))
  const [answer, setAnswer] = useState(q.answer_index ?? 0)
  const [solution, setSolution] = useState(q.solution || '')
  const [level, setLevel] = useState(q.difficulty ?? '')
  const input = { ...ui.input, width: '100%' }
  const label = { ...ui.label, fontSize: 12 }
  const canSave = question.trim() && options.length >= 2 && options.every(o => o.trim()) && answer < options.length

  return (
    <div style={{ ...ui.card, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
      <div style={ui.heading}>Edit question</div>
      <div>
        <label htmlFor="rq-text" style={label}>Question</label>
        <textarea id="rq-text" rows={3} value={question} onChange={e => setQuestion(e.target.value)} style={{ ...input, resize: 'vertical' }} />
        {question.trim() && <div style={{ marginTop: 6, padding: '8px 10px', borderRadius: 9, background: 'var(--t-bgSubtle)', fontSize: 13.5, color: 'var(--t-text)' }}><MathText text={question} /></div>}
      </div>
      <div>
        <span style={label}>Options <span style={{ fontWeight: 500, color: 'var(--t-textMuted)' }}>· tick the right one</span></span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {options.map((opt, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ width: 14, fontSize: 12.5, fontWeight: 800, color: 'var(--t-textMuted)' }}>{LETTERS[i]}</span>
              <input aria-label={`Option ${LETTERS[i]}`} value={opt} onChange={e => setOptions(prev => prev.map((o, j) => (j === i ? e.target.value : o)))}
                style={{ ...input, borderColor: answer === i ? 'var(--t-success)' : 'var(--t-border)' }} />
              <button type="button" aria-pressed={answer === i} aria-label={`Option ${LETTERS[i]} is right`} onClick={() => setAnswer(i)}
                style={{ flexShrink: 0, padding: '7px 10px', borderRadius: 8, fontFamily: FONT_B, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  border: `1px solid ${answer === i ? 'var(--t-success)' : 'var(--t-border)'}`, background: answer === i ? 'var(--t-successBg)' : 'var(--t-bgCard)', color: answer === i ? 'var(--t-success)' : 'var(--t-textMuted)' }}>
                {answer === i ? 'Right' : 'Mark right'}
              </button>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 100px', gap: 10 }}>
        <div>
          <label htmlFor="rq-solution" style={label}>Worked solution</label>
          <textarea id="rq-solution" rows={4} value={solution} onChange={e => setSolution(e.target.value)} style={{ ...input, resize: 'vertical' }} />
        </div>
        <div>
          <label htmlFor="rq-level" style={label}>Level (1–5)</label>
          <input id="rq-level" type="number" min={1} max={5} value={level} onChange={e => setLevel(e.target.value)} style={input} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" disabled={!!busy || !canSave} style={btn('primary', !!busy || !canSave)}
          onClick={() => onSave({ question, options, answerIndex: answer, solution, ...(level !== '' && level != null ? { difficulty: Number(level) } : {}) })}>
          {busy === 'edit' ? 'Saving…' : 'Save question'}
        </button>
        <button type="button" style={btn('secondary')} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}
