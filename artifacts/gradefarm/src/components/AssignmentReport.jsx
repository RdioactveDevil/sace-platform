import { useEffect, useMemo, useState } from 'react'
import { X, CircleCheck, CircleX, Sparkles, RefreshCw, Clock, Target, TriangleAlert, TrendingUp, ListChecks } from 'lucide-react'
import { THEMES } from '../lib/theme'
import { ASSIGNMENT_DIFFICULTIES } from '../lib/engine'
import { fetchAssignmentReport, generateAssignmentReportSummary } from '../lib/db'
import MathText from './MathText'

const GOLD = '#f1be43'
const FONT_B = "'Plus Jakarta Sans', sans-serif"
const FONT_D = "'Sifonn Pro', sans-serif"

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '—')
const fmtSecs = (ms) => {
  if (ms == null) return '—'
  const s = Math.round(ms / 1000)
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`
}

function optionsOf(q) {
  let opts = q?.options
  if (typeof opts === 'string') { try { opts = JSON.parse(opts) } catch { opts = null } }
  return Array.isArray(opts) ? opts : null
}

/** What the student answered, as text. MCQs store the option index. */
function responseText(q, response) {
  const opts = optionsOf(q)
  if (opts && typeof response === 'number') return opts[response] ?? `Option ${response + 1}`
  if (response == null) return '—'
  if (typeof response === 'string' || typeof response === 'number') return String(response)
  if (Array.isArray(response)) return response.map(r => (opts && typeof r === 'number' ? opts[r] : String(r))).join(', ')
  return JSON.stringify(response)
}

/**
 * A tutor's report on one assignment: result, topic breakdown, an AI write-up
 * (strengths, what went wrong, what could be better, next steps) and every
 * question with the student's answer. Shown as a modal over the Tutor Portal.
 */
export default function AssignmentReport({ assignmentId, theme = 'dark', onClose }) {
  const t = THEMES[theme]
  const [report, setReport] = useState(null)
  const [error, setError] = useState('')
  const [summary, setSummary] = useState(null)
  const [writing, setWriting] = useState(false)
  const [summaryError, setSummaryError] = useState('')
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    let cancelled = false
    setReport(null); setError(''); setSummary(null)
    fetchAssignmentReport(assignmentId)
      .then(r => { if (!cancelled) { setReport(r); setSummary(r.summary || null) } })
      .catch(e => { if (!cancelled) setError(e.message || 'Could not load the report.') })
    return () => { cancelled = true }
  }, [assignmentId])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const writeSummary = async (refresh = false) => {
    setWriting(true); setSummaryError('')
    try { setSummary(await generateAssignmentReportSummary(assignmentId, { refresh })) }
    catch (e) { setSummaryError(e.message || 'Could not write the report.') }
    setWriting(false)
  }

  const answers = report?.answers || []
  const topics = useMemo(() => {
    const m = new Map()
    for (const r of answers) {
      const key = r.question?.subtopic || r.question?.topic || 'Other'
      const e = m.get(key) || { name: key, correct: 0, total: 0 }
      e.total++; if (r.correct) e.correct++
      m.set(key, e)
    }
    return [...m.values()].map(e => ({ ...e, pct: Math.round((e.correct / e.total) * 100) })).sort((a, b) => a.pct - b.pct)
  }, [answers])

  const card = { background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 14 }
  const label = { fontSize: 10.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: t.textMuted }
  const quietBtn = { display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 12px', borderRadius: 9, border: `1px solid ${t.borderMid}`, background: 'transparent', color: t.text, fontFamily: FONT_B, fontSize: 12, fontWeight: 700, cursor: 'pointer' }

  let body
  if (error) {
    body = <div style={{ padding: 20, color: t.danger || '#f87171', fontSize: 13 }}>{error}</div>
  } else if (!report) {
    body = <div style={{ padding: 20, color: t.textMuted, fontSize: 13 }}>Loading report…</div>
  } else {
    const a = report.assignment
    const score = report.score
    const goal = a.question_count
    const done = !!a.completed_at
    const result = a.passed === true ? { text: 'Passed', color: t.success || '#4ade80', Icon: CircleCheck }
      : a.passed === false ? { text: 'Not passed', color: t.danger || '#f87171', Icon: CircleX }
      : done ? { text: 'Completed', color: t.success || '#4ade80', Icon: CircleCheck }
      : { text: 'In progress', color: GOLD, Icon: Clock }
    const timed = answers.filter(r => r.time_taken_ms != null)
    const avgMs = timed.length ? timed.reduce((s, r) => s + r.time_taken_ms, 0) / timed.length : null
    const missing = Math.max(0, (a.progress_count || 0) - answers.length)
    const shown = answers.map((r, i) => ({ ...r, n: i + 1 })).filter(r => filter === 'all' || (filter === 'wrong' ? !r.correct : r.correct))
    const wrongCount = answers.filter(r => !r.correct).length

    const kpis = [
      { k: 'Score', v: score.pct != null ? `${score.pct}%` : '—', sub: score.total ? `${score.correct}/${score.total} correct` : 'No answers yet', color: result.color },
      { k: 'Result', v: result.text, sub: a.min_accuracy ? `Pass mark ${a.min_accuracy}%${a.pass_mode === 'one_attempt' ? ' · one attempt' : ''}` : 'No pass mark', color: result.color },
      { k: 'Answered', v: goal ? `${Math.min(a.progress_count || 0, goal)}/${goal}` : String(answers.length), sub: done ? `Finished ${fmtDate(a.completed_at)}` : `Due ${fmtDate(a.due_date)}`, color: t.text },
      { k: 'Avg time', v: fmtSecs(avgMs), sub: `${ASSIGNMENT_DIFFICULTIES[a.difficulty]?.label || 'Adaptive'} · ${a.remediation === false ? 'no remediation' : 'with remediation'}`, color: t.text },
    ]

    const list = (Icon, title, items, color) => items?.length > 0 && (
      <div>
        <div style={{ ...label, display: 'flex', alignItems: 'center', gap: 6, color, marginBottom: 6 }}><Icon size={13} aria-hidden="true" />{title}</div>
        <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 5 }}>
          {items.map((it, i) => <li key={i} style={{ fontSize: 13, color: t.text, lineHeight: 1.55 }}><MathText text={it} /></li>)}
        </ul>
      </div>
    )

    body = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
          {kpis.map(x => (
            <div key={x.k} style={{ ...card, padding: '12px 14px' }}>
              <div style={label}>{x.k}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: x.color, marginTop: 4 }}>{x.v}</div>
              <div style={{ fontSize: 11.5, color: t.textMuted, marginTop: 2 }}>{x.sub}</div>
            </div>
          ))}
        </div>

        {/* AI write-up */}
        <div style={{ ...card, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ ...label, display: 'flex', alignItems: 'center', gap: 6, color: t.goldText, flex: 1 }}><Sparkles size={13} aria-hidden="true" />Tutor report</div>
            {summary && (
              <button type="button" style={quietBtn} disabled={writing} onClick={() => writeSummary(true)}>
                <RefreshCw size={13} aria-hidden="true" />{writing ? 'Rewriting…' : 'Rewrite'}
              </button>
            )}
          </div>
          {summary ? (
            <>
              <div style={{ fontSize: 13.5, color: t.text, lineHeight: 1.6 }}><MathText text={summary.overview} /></div>
              {list(TrendingUp, 'Strengths', summary.strengths, t.success || '#4ade80')}
              {list(TriangleAlert, 'What went wrong', summary.went_wrong, t.danger || '#f87171')}
              {list(Target, 'What could be better', summary.improve, t.goldText)}
              {list(ListChecks, 'Next steps', summary.next_steps, t.text)}
            </>
          ) : answers.length === 0 ? (
            <div style={{ fontSize: 13, color: t.textMuted }}>There are no recorded answers to report on yet.</div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 13, color: t.textMuted, flex: '1 1 240px' }}>Get a write-up of how they went: strengths, what went wrong and why, what could have been better, and what to cover next.</div>
              <button type="button" onClick={() => writeSummary(false)} disabled={writing}
                style={{ ...quietBtn, height: 36, border: 'none', background: GOLD, color: '#171724' }}>
                <Sparkles size={14} aria-hidden="true" />{writing ? 'Writing…' : 'Write report'}
              </button>
            </div>
          )}
          {summaryError && <div style={{ fontSize: 12, color: t.danger || '#f87171' }}>{summaryError}</div>}
        </div>

        {/* Topic breakdown */}
        {topics.length > 0 && (
          <div style={{ ...card, padding: 16 }}>
            <div style={{ ...label, marginBottom: 12 }}>By topic</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {topics.map(tp => {
                const c = tp.pct >= 70 ? (t.success || '#4ade80') : tp.pct >= 40 ? GOLD : (t.danger || '#f87171')
                return (
                  <div key={tp.name}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
                      <span style={{ fontSize: 12.5, color: t.text, fontWeight: 600 }}>{tp.name}</span>
                      <span style={{ fontSize: 12.5, fontWeight: 800, color: c, flexShrink: 0 }}>{tp.correct}/{tp.total}</span>
                    </div>
                    <div style={{ background: t.borderMid, borderRadius: 999, height: 5, overflow: 'hidden' }}>
                      <div style={{ width: `${tp.pct}%`, height: '100%', background: c, borderRadius: 999 }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Every question */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ ...label, flex: 1 }}>Questions</div>
            {[['all', `All (${answers.length})`], ['wrong', `Wrong (${wrongCount})`], ['right', `Right (${answers.length - wrongCount})`]].map(([id, text]) => (
              <button key={id} type="button" onClick={() => setFilter(id)} aria-pressed={filter === id}
                style={{ ...quietBtn, height: 28, borderColor: filter === id ? GOLD : t.borderMid, color: filter === id ? t.goldText : t.textMuted }}>{text}</button>
            ))}
          </div>
          {missing > 0 && (
            <div style={{ fontSize: 12, color: t.textMuted }}>
              {missing} earlier answer{missing === 1 ? ' was' : 's were'} given before question-by-question reports were added, so {missing === 1 ? 'it isn’t' : 'they aren’t'} listed.
            </div>
          )}
          {shown.map(r => {
            const q = r.question
            const opts = optionsOf(q)
            const ok = r.correct
            return (
              <div key={r.n} style={{ ...card, padding: 14, borderColor: ok ? t.border : `${t.danger || '#f87171'}55` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                  {ok ? <CircleCheck size={16} color={t.success || '#4ade80'} aria-label="Correct" /> : <CircleX size={16} color={t.danger || '#f87171'} aria-label="Incorrect" />}
                  <span style={{ fontSize: 12.5, fontWeight: 800, color: t.text }}>Q{r.n}</span>
                  {q?.subtopic && <span style={{ fontSize: 11.5, color: t.textMuted }}>{q.subtopic}</span>}
                  {q?.difficulty && <span style={{ fontSize: 11, color: t.textMuted }}>{'★'.repeat(q.difficulty)}</span>}
                  <span style={{ marginLeft: 'auto', fontSize: 11.5, color: t.textMuted, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Clock size={12} aria-hidden="true" />{fmtSecs(r.time_taken_ms)}</span>
                </div>
                {q ? (
                  <>
                    <div style={{ fontSize: 13.5, color: t.text, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}><MathText text={q.question} style={{ whiteSpace: 'pre-wrap' }} /></div>
                    {opts && typeof r.response === 'number' ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 10 }}>
                        {opts.map((opt, i) => {
                          const isAnswer = i === q.answer_index
                          const isChosen = i === r.response
                          const c = isAnswer ? (t.success || '#4ade80') : isChosen ? (t.danger || '#f87171') : null
                          return (
                            <div key={i} style={{ fontSize: 12.5, padding: '6px 10px', borderRadius: 8, border: `1px solid ${c ? `${c}66` : t.border}`, background: c ? `${c}14` : 'transparent', color: t.text, display: 'flex', gap: 8 }}>
                              <span style={{ fontWeight: 800, color: c || t.textMuted, flexShrink: 0 }}>{String.fromCharCode(65 + i)}</span>
                              <span style={{ flex: 1 }}><MathText text={String(opt)} /></span>
                              {isChosen && <span style={{ fontSize: 11, fontWeight: 700, color: c, flexShrink: 0 }}>Their answer</span>}
                              {isAnswer && !isChosen && <span style={{ fontSize: 11, fontWeight: 700, color: c, flexShrink: 0 }}>Correct</span>}
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div style={{ fontSize: 12.5, color: t.textMuted, marginTop: 8 }}>Their answer: <span style={{ color: t.text, fontWeight: 600 }}><MathText text={responseText(q, r.response)} /></span></div>
                    )}
                    {!ok && q.solution && (
                      <details style={{ marginTop: 10 }}>
                        <summary style={{ fontSize: 12, fontWeight: 700, color: t.goldText, cursor: 'pointer' }}>Worked solution</summary>
                        <div style={{ fontSize: 12.5, color: t.text, lineHeight: 1.6, marginTop: 6, whiteSpace: 'pre-wrap' }}><MathText text={q.solution} style={{ whiteSpace: 'pre-wrap' }} /></div>
                      </details>
                    )}
                  </>
                ) : (
                  <div style={{ fontSize: 12.5, color: t.textMuted }}>This question is no longer in the question bank.</div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  const a = report?.assignment
  return (
    <div role="dialog" aria-modal="true" aria-label="Assignment report" onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '4vh 16px', overflowY: 'auto', fontFamily: FONT_B }}>
      <div onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 860, background: t.bg, border: `1px solid ${t.borderMid}`, borderRadius: 18, boxShadow: t.shadowModal, padding: '18px 20px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: FONT_D, fontSize: 20, letterSpacing: '0.03em', color: t.text }}>{report ? `${report.student.name}` : 'Assignment report'}</div>
            {a && <div style={{ fontSize: 12.5, color: t.textMuted, marginTop: 3 }}>{a.type} · {a.subject}{a.topics?.length ? ` · ${a.topics.join(', ')}` : ''}</div>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close report" style={{ width: 34, height: 34, borderRadius: 9, border: `1px solid ${t.borderMid}`, background: 'transparent', color: t.textMuted, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        {body}
      </div>
    </div>
  )
}
