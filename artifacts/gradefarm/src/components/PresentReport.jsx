import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Check, X } from 'lucide-react'
import MathText from './MathText'
import { THEMES } from '../lib/theme'
import { presentModel } from '../lib/presentReport'

const GOLD   = 'var(--t-accent)'
const FONT_B = "'Plus Jakarta Sans', sans-serif"

// Bare LaTeX from the maths answer box is wrapped so MathText renders it.
function asMath(answer) {
  return !answer.includes('$') && /\\|\^|_\{/.test(answer) ? `$${answer}$` : answer
}

// Full-screen results for the tutor to share with a prospect on a call. Shows
// only the score, strengths, topics, difficulty split and the questions.
export default function PresentReport({ assessment, report, theme, onExit }) {
  const t = THEMES[theme]
  const m = useMemo(() => presentModel(assessment, report), [assessment, report])
  const rootRef = useRef(null)
  const [openTopics, setOpenTopics] = useState({})
  const [openQs, setOpenQs] = useState({})

  useEffect(() => {
    rootRef.current?.focus()
    const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); onExit() } }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onExit])

  const bandColors = { Outstanding: t.success, High: GOLD, Satisfactory: t.blue, Developing: 'color-mix(in srgb, var(--t-accent) 55%, var(--t-danger))', Beginning: t.danger }
  const bc = bandColors[m.band] || GOLD
  const pctColor = p => (p >= 75 ? t.success : p >= 50 ? t.goldText : t.danger)
  const card = { background: 'var(--t-bgCard)', border: '1px solid var(--t-border)', borderRadius: 12 }
  const cardHdr = { padding: '18px 28px', borderBottom: `1px solid ${t.border}`, fontSize: 20, fontWeight: 700, color: t.text }

  const topicList = (title, items, color) => (
    <div style={{ ...card, flex: 1, minWidth: 260 }}>
      <div style={cardHdr}>{title}</div>
      <div style={{ padding: '18px 28px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {items.length === 0
          ? <div style={{ fontSize: 18, color: t.textMuted }}>None</div>
          : items.map(name => (
            <div key={name} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ width: 9, height: 9, borderRadius: '50%', background: color, flexShrink: 0, marginTop: 10 }} />
              <div style={{ fontSize: 20, color: t.text, lineHeight: 1.45 }}>{name}</div>
            </div>
          ))}
      </div>
    </div>
  )

  return (
    <div
      ref={rootRef} role="dialog" aria-modal="true" aria-label="Diagnostic results" tabIndex={-1}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, overflowY: 'auto', background: 'var(--t-bg)', color: t.text, fontFamily: FONT_B, outline: 'none' }}
    >
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '32px 24px 64px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        <button onClick={onExit} style={{ position: 'fixed', top: 20, right: 24, zIndex: 1, display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 8, border: `1px solid ${t.border}`, background: 'var(--t-bgCard)', color: t.text, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B }}>
          <X size={16} aria-hidden="true" />Exit
        </button>

        {/* Header with score and band */}
        <div style={card}>
          <div style={{ padding: '28px 32px', display: 'flex', gap: 28, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 260 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: t.textMuted, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>Diagnostic results</div>
              <div style={{ fontSize: 34, fontWeight: 800, color: t.text, lineHeight: 1.2 }}>{m.name}</div>
              {m.subject && <div style={{ fontSize: 20, color: t.textMuted, marginTop: 6 }}>{m.subject}</div>}
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 64, fontWeight: 900, color: t.text, lineHeight: 1 }}>{m.percentage}<span style={{ fontSize: 32, color: t.textMuted }}>%</span></div>
              <span style={{ display: 'inline-block', marginTop: 10, fontSize: 17, padding: '5px 16px', borderRadius: 16, border: `1px solid ${bc}40`, background: `${bc}15`, color: bc, fontWeight: 700 }}>{m.band}</span>
            </div>
          </div>
        </div>

        {/* Strong at / to work on */}
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          {topicList('Strong at', m.strong, t.success)}
          {topicList('To work on', m.workOn, t.danger)}
        </div>

        {/* Topics */}
        {m.topics.length > 0 && (
          <div style={card}>
            <div style={cardHdr}>By topic</div>
            <div>
              {m.topics.map((tp, i) => {
                const c = pctColor(tp.percentage)
                const open = !!openTopics[tp.topic]
                const canOpen = tp.subtopics.length > 0
                const panelId = `present-topic-${i}`
                const bar = (
                  <>
                    <div style={{ flex: 1, minWidth: 0, fontSize: 20, color: t.text, textAlign: 'left' }}>{tp.topic}</div>
                    <div role="img" aria-label={`${tp.topic}: ${tp.percentage}%`} style={{ width: 'min(36%, 280px)', height: 12, borderRadius: 6, background: t.border, overflow: 'hidden', flexShrink: 0 }}>
                      <div style={{ height: '100%', width: `${tp.percentage}%`, background: c, borderRadius: 6 }} />
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: c, width: 64, textAlign: 'right', flexShrink: 0 }}>{tp.percentage}%</div>
                    {canOpen
                      ? <ChevronDown size={20} color={t.textMuted} aria-hidden="true" style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none' }} />
                      : <span style={{ width: 20, flexShrink: 0 }} />}
                  </>
                )
                const rowStyle = { padding: '16px 28px', display: 'flex', alignItems: 'center', gap: 18, width: '100%', boxSizing: 'border-box' }
                return (
                  <div key={tp.topic} style={{ borderBottom: i < m.topics.length - 1 ? `1px solid ${t.border}` : 'none' }}>
                    {canOpen ? (
                      <button onClick={() => setOpenTopics(o => ({ ...o, [tp.topic]: !o[tp.topic] }))} aria-expanded={open} aria-controls={panelId}
                        style={{ ...rowStyle, background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: FONT_B }}>
                        {bar}
                      </button>
                    ) : <div style={rowStyle}>{bar}</div>}
                    {canOpen && open && (
                      <div id={panelId} style={{ padding: '4px 28px 18px 52px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {tp.subtopics.map(s => {
                          const sc = pctColor(s.percentage)
                          return (
                            <div key={s.subtopic} style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                              <div style={{ flex: 1, minWidth: 0, fontSize: 18, color: t.textMuted }}>{s.subtopic}</div>
                              <div role="img" aria-label={`${s.subtopic}: ${s.percentage}%`} style={{ width: 'min(30%, 220px)', height: 8, borderRadius: 4, background: t.border, overflow: 'hidden', flexShrink: 0 }}>
                                <div style={{ height: '100%', width: `${s.percentage}%`, background: sc, borderRadius: 4 }} />
                              </div>
                              <div style={{ fontSize: 18, fontWeight: 700, color: sc, width: 64, textAlign: 'right', flexShrink: 0 }}>{s.percentage}%</div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Difficulty */}
        {m.difficulty.length > 0 && (
          <div style={card}>
            <div style={cardHdr}>Score by difficulty</div>
            <div style={{ padding: '24px 28px', display: 'flex', gap: 32, flexWrap: 'wrap' }}>
              {m.difficulty.map(d => (
                <div key={d.label} style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontSize: 18, color: t.textMuted, marginBottom: 6 }}>{d.label}</div>
                  <div style={{ fontSize: 38, fontWeight: 800, color: t.text }}>{d.score}<span style={{ fontSize: 22, color: t.textMuted }}>/{d.max}</span></div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Question by question */}
        {m.questions.length > 0 && (
          <div style={card}>
            <div style={cardHdr}>Question by question</div>
            <div>
              {m.questions.map((q, i) => {
                const open = !!openQs[q.id]
                const col = q.correct ? t.success : t.danger
                const panelId = `present-q-${i}`
                const label = { fontSize: 14, fontWeight: 700, color: t.textFaint, marginBottom: 6 }
                const answerBox = c => ({ fontSize: 19, color: t.text, lineHeight: 1.55, padding: '10px 14px', borderRadius: 8, background: `${c}10`, border: `1px solid ${c}30`, whiteSpace: 'pre-wrap', overflowX: 'auto' })
                const show = ans => (q.options ? ans : asMath(ans))
                return (
                  <div key={q.id} style={{ borderBottom: i < m.questions.length - 1 ? `1px solid ${t.border}` : 'none' }}>
                    <button onClick={() => setOpenQs(o => ({ ...o, [q.id]: !o[q.id] }))} aria-expanded={open} aria-controls={panelId}
                      style={{ display: 'flex', alignItems: 'center', gap: 16, width: '100%', boxSizing: 'border-box', padding: '16px 28px', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: FONT_B, textAlign: 'left' }}>
                      <div style={{ width: 44, height: 44, borderRadius: 10, background: `${col}15`, border: `1px solid ${col}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800, color: col, flexShrink: 0 }}>Q{i + 1}</div>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 19, color: t.text, lineHeight: 1.4 }}>
                        Question {i + 1}{q.marksPossible > 0 ? ` · ${q.marks}/${q.marksPossible} marks` : ''}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 17, fontWeight: 700, color: col, flexShrink: 0 }}>
                        {q.correct ? <Check size={20} aria-hidden="true" /> : <X size={20} aria-hidden="true" />}
                        {q.correct ? 'Correct' : 'Incorrect'}
                      </span>
                      <ChevronDown size={20} color={t.textMuted} aria-hidden="true" style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none' }} />
                    </button>
                    {open && (
                      <div id={panelId} style={{ padding: '4px 28px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div style={{ fontSize: 21, color: t.text, lineHeight: 1.6 }}><MathText text={q.question} /></div>
                        <div>
                          <div style={label}>Their answer</div>
                          {q.studentAnswer
                            ? <div style={answerBox(col)}><MathText text={show(q.studentAnswer)} /></div>
                            : <div style={{ fontSize: 18, color: t.textFaint }}>Not answered</div>}
                        </div>
                        {q.correctAnswer && (
                          <div>
                            <div style={label}>Correct answer</div>
                            <div style={answerBox(t.success)}><MathText text={show(q.correctAnswer)} /></div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
