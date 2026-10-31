import { useState, useEffect, useMemo } from 'react'
import { getLevelProgress, nextRankHint, rankAccuracy, RANKS } from '../lib/engine'
import { X } from 'lucide-react'
import { THEMES } from '../lib/theme'
import { getAnswerLogSince, getAssessments, addAssessment, deleteAssessment } from '../lib/db'
import { useCurriculumTopicConfig } from '../lib/useCurriculumTopicConfig'
import { fetchLessons } from '../lib/learnStore'

const GOLD = '#f1be43'
const FONT_B = "'Plus Jakarta Sans', sans-serif"
const WEEKS = 8
const DAY_MS = 86400000

/** Monday 00:00 of the week `date` falls in. */
function weekStart(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d
}

/**
 * Progress overview: is the student improving (this week's numbers and accuracy
 * by week), what's coming up (assessments), what to do this week (reviews due,
 * unfinished lessons, weakest topics) and mastery by topic group.
 */
export default function ProfileScreen({ profile, questions, struggleMap, theme, embedded, onStartSession, onOpenLesson, subject }) {
  const t = THEMES[theme]
  const topicConfig = useCurriculumTopicConfig(subject, { withFallback: true })
  const { normFn, macroGroups, isTwoLevel = false } = topicConfig
  const [answerLog, setAnswerLog] = useState([])
  const [assessments, setAssessments] = useState([])
  const [lessons, setLessons] = useState({})
  const [addOpen, setAddOpen] = useState(false)
  const [showPast, setShowPast] = useState(false)
  const [addFormType, setAddFormType] = useState('Test')
  const [addFormLabel, setAddFormLabel] = useState('')
  const [addFormDate, setAddFormDate] = useState('')
  const [addFormError, setAddFormError] = useState('')
  const [addingAssessment, setAddingAssessment] = useState(false)
  const subjectName = subject?.name || ''

  useEffect(() => {
    let cancelled = false
    getAnswerLogSince(profile.id, WEEKS * 7).then(rows => { if (!cancelled) setAnswerLog(rows) }).catch(() => {})
    getAssessments(profile.id).then(rows => { if (!cancelled) setAssessments(rows) }).catch(() => {})
    fetchLessons(profile.id, subjectName).then(rows => { if (!cancelled && rows) setLessons(rows) })
    return () => { cancelled = true }
  }, [profile.id, subjectName])

  const recentAccuracy = rankAccuracy(profile)
  const { level } = getLevelProgress(profile.xp, recentAccuracy)
  const rank = RANKS[level]

  // ── Weekly numbers (this subject's questions only) ────────────────────────
  const questionIds = useMemo(() => new Set(questions.map(q => q.id)), [questions])
  const weeks = useMemo(() => {
    const thisWeek = weekStart(Date.now()).getTime()
    const buckets = Array.from({ length: WEEKS }, (_, i) => ({ start: thisWeek - (WEEKS - 1 - i) * 7 * DAY_MS, total: 0, correct: 0, days: new Set() }))
    answerLog.forEach(a => {
      if (questionIds.size && !questionIds.has(a.question_id)) return
      const at = new Date(a.answered_at)
      const idx = WEEKS - 1 - Math.floor((thisWeek - weekStart(at).getTime()) / (7 * DAY_MS))
      if (idx < 0 || idx >= WEEKS) return
      buckets[idx].total++
      if (a.correct) buckets[idx].correct++
      buckets[idx].days.add(at.toDateString())
    })
    return buckets.map(b => ({ ...b, pct: b.total ? Math.round((b.correct / b.total) * 100) : null }))
  }, [answerLog, questionIds])
  const now = weeks[WEEKS - 1]
  const prev = weeks[WEEKS - 2]

  // ── Topic stats ───────────────────────────────────────────────────────────
  const topicOf = (q) => normFn(isTwoLevel ? q.subtopic : q.topic)
  const topicStats = useMemo(() => {
    const map = {}
    questions.forEach(q => {
      const topic = topicOf(q)
      if (!topic) return
      const s = map[topic] || (map[topic] = { total: 0, attempted: 0, correct: 0, wrong: 0, subtopics: new Set(), due: 0, dueWrong: 0 })
      s.total++
      if (q.subtopic) s.subtopics.add(q.subtopic)
      const st = struggleMap[q.id]
      if (st && st.attempts > 0) {
        s.attempted++
        s.correct += st.attempts - st.wrong
        s.wrong += st.wrong
        if (st.next_review && new Date(st.next_review).getTime() <= Date.now() + 2 * DAY_MS) { s.due++; s.dueWrong += st.wrong }
      }
    })
    return map
  }, [questions, struggleMap, normFn, isTwoLevel]) // eslint-disable-line react-hooks/exhaustive-deps
  const accuracyOf = (s) => (s && s.correct + s.wrong > 0 ? Math.round((s.correct / (s.correct + s.wrong)) * 100) : null)
  const toneOf = (pct) => (pct == null ? t.textFaint : pct < 40 ? t.danger : pct < 70 ? t.goldText : t.success)
  const subsOf = (topic) => [...(topicStats[topic]?.subtopics || [])]

  // ── This week's plan ──────────────────────────────────────────────────────
  const weekKey = `gf-plan-done-${profile.id}-${weekStart(Date.now()).toISOString().slice(0, 10)}`
  const [doneIds, setDoneIds] = useState(() => {
    try { return JSON.parse(localStorage.getItem(weekKey) || '[]') } catch { return [] }
  })
  const toggleDone = (id) => setDoneIds(prevIds => {
    const next = prevIds.includes(id) ? prevIds.filter(x => x !== id) : [...prevIds, id]
    try { localStorage.setItem(weekKey, JSON.stringify(next)) } catch {}
    return next
  })
  const plan = useMemo(() => {
    const items = []
    const used = new Set()
    // Reviews due in the next two days, most mistakes first.
    Object.entries(topicStats)
      .filter(([, s]) => s.due > 0)
      .sort((a, b) => b[1].dueWrong - a[1].dueWrong)
      .slice(0, 2)
      .forEach(([topic, s]) => {
        used.add(topic)
        items.push({ id: `review:${topic}`, label: `Review ${s.due} question${s.due !== 1 ? 's' : ''} due on ${topic}`, note: 'Due for spaced review', action: 'Start',
          run: () => onStartSession?.({ mode: s.dueWrong > 0 ? 'wrong' : 'all', subtopics: [...s.subtopics] }) })
      })
    // Lessons started in Learn and not finished.
    Object.values(lessons)
      .filter(l => l?.data && !l.finishedAt)
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .slice(0, 2)
      .forEach(l => items.push({ id: `lesson:${l.topic.toLowerCase()}`, label: `Lesson: ${l.topic}`, note: `Resume at step ${Math.min(l.step + 1, 4)} of 4`, action: 'Resume', secondary: true,
        run: () => onOpenLesson?.(l.topic) }))
    // Weakest topics practised so far.
    Object.entries(topicStats)
      .filter(([topic, s]) => !used.has(topic) && s.attempted > 0)
      .map(([topic, s]) => [topic, s, accuracyOf(s)])
      .filter(([, , pct]) => pct != null && pct < 70)
      .sort((a, b) => a[2] - b[2])
      .slice(0, 5 - items.length)
      .forEach(([topic, s, pct]) => items.push({ id: `practise:${topic}`, label: `Practise ${topic} · 10 questions`, note: `${pct}% so far`, action: 'Start',
        run: () => onStartSession?.({ mode: 'new', subtopics: [...s.subtopics] }) }))
    return items.slice(0, 5)
  }, [topicStats, lessons]) // eslint-disable-line react-hooks/exhaustive-deps
  const doneCount = plan.filter(p => doneIds.includes(p.id)).length

  // ── Mastery: by topic group, or by topic when there's only one group ──────
  const masteryRows = (macroGroups.length > 1 ? macroGroups : (macroGroups[0]?.topics || []).map(tp => ({ label: tp, topics: [tp] })))
    .map(g => {
      const parts = g.topics.map(tp => topicStats[tp]).filter(Boolean)
      const sum = parts.reduce((acc, s) => ({ correct: acc.correct + s.correct, wrong: acc.wrong + s.wrong }), { correct: 0, wrong: 0 })
      return { label: g.label, topics: g.topics.filter(tp => topicStats[tp]), pct: accuracyOf(sum) }
    })
    .filter(r => r.topics.length > 0)

  // ── Assessments ───────────────────────────────────────────────────────────
  const today = new Date(new Date().toDateString())
  const upcoming = assessments.filter(a => new Date(a.date) >= today)
  const past = assessments.filter(a => new Date(a.date) < today)
  const handleAddAssessment = async () => {
    if (!addFormType || !addFormLabel.trim() || !addFormDate) return
    setAddingAssessment(true)
    setAddFormError('')
    try {
      const row = await addAssessment(profile.id, addFormType, addFormLabel.trim(), addFormDate)
      setAssessments(prevRows => [...prevRows, row].sort((a, b) => new Date(a.date) - new Date(b.date)))
      setAddFormLabel('')
      setAddFormDate('')
      setAddOpen(false)
    } catch {
      setAddFormError("Couldn't save that. Please try again.")
    }
    setAddingAssessment(false)
  }
  const handleDeleteAssessment = async (id) => {
    const prevRows = assessments
    setAssessments(a => a.filter(x => x.id !== id))
    try { await deleteAssessment(id) } catch { setAssessments(prevRows) }
  }

  // ── Styles ────────────────────────────────────────────────────────────────
  const card = { background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 12 }
  const cardTitle = { fontSize: 14.5, fontWeight: 800, color: t.text }
  const linkBtn = { border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', fontFamily: FONT_B, fontSize: 12.5, fontWeight: 700, color: t.text, textDecoration: 'underline', textDecorationColor: GOLD, textDecorationThickness: 2, textUnderlineOffset: 4 }
  const btn = (primary) => ({ padding: '7px 13px', borderRadius: 8, fontFamily: FONT_B, fontSize: 12.5, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap', border: primary ? 'none' : `1px solid ${t.border}`, background: primary ? t.accent : t.bgCard, color: primary ? '#0c1037' : t.text })
  const input = { padding: '8px 10px', borderRadius: 8, border: `1px solid ${t.border}`, background: t.bgInput, color: t.text, fontSize: 13, fontFamily: FONT_B, outline: 'none', colorScheme: theme === 'dark' ? 'dark' : 'light' }

  // Accuracy-by-week chart: line on a 0–100% scale, bars scaled to the busiest week.
  const W = 540, H = 170, L = 36, R = 14, TOP = 16, BOT = 136
  const colW = (W - L - R) / WEEKS
  const yOf = (pct) => BOT - (pct / 100) * (BOT - TOP)
  const maxTotal = Math.max(1, ...weeks.map(w => w.total))
  const points = weeks.map((w, i) => ({ x: L + colW * i + colW / 2, y: w.pct == null ? null : yOf(w.pct), w }))
  const linePts = points.filter(p => p.y != null)
  const weeksWithData = linePts.length
  const label = (ms) => new Date(ms).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })

  const delta = now.pct != null && prev.pct != null ? now.pct - prev.pct : null
  const fact = (value, text) => (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: t.text, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: 12.5, color: t.textMuted }}>{text}</div>
    </div>
  )

  return (
    <div style={{ height: embedded ? '100%' : '100vh', minHeight: 0, background: embedded ? 'transparent' : t.bg, color: t.text, fontFamily: FONT_B, overflowY: 'auto' }}>
      <style>{`
        .po-inner { max-width: 1180px; margin: 0 auto; padding: 24px 32px 40px; display: flex; flex-direction: column; gap: 16px; }
        .po-row { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: 16px; align-items: start; }
        .po-row.even { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
        .po-item { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 0; border-top: 1px solid ${t.border}; }
        .po-item:first-of-type { border-top: none; }
        .po-click { width: 100%; border: none; background: transparent; font-family: inherit; text-align: left; cursor: pointer; color: inherit; }
        .po-click:focus-visible, .po-inner button:focus-visible { outline: 2px solid ${GOLD}; outline-offset: 2px; }
        @media (max-width: 960px) { .po-row, .po-row.even { grid-template-columns: 1fr; } }
        @media (max-width: 860px) { .po-inner { padding: 18px 14px 28px; } }
      `}</style>
      <div className="po-inner">

        {/* This week, and rank */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
            {fact(now.pct == null ? '—' : `${now.pct}%`, now.pct == null ? 'correct this week' : delta == null ? 'correct this week' : `correct this week, ${delta >= 0 ? 'up' : 'down'} from ${prev.pct}%`)}
            {fact(now.total, 'answered this week')}
            {fact(`${now.days.size} day${now.days.size !== 1 ? 's' : ''}`, 'active this week')}
          </div>
          <div style={{ fontSize: 12.5, color: t.textMuted }}>
            <strong style={{ color: t.text }}>{rank}</strong> · {profile.xp.toLocaleString()} XP · {nextRankHint(profile.xp, recentAccuracy)}
          </div>
        </div>

        <div className="po-row">
          {/* Accuracy by week */}
          <div style={{ ...card, padding: '14px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <span style={cardTitle}>Accuracy by week</span>
              <span style={{ fontSize: 12, color: t.textFaint }}>Line: % correct · Bars: questions answered</span>
            </div>
            {weeksWithData < 2 ? (
              <div style={{ padding: '36px 0 30px', fontSize: 13, color: t.textMuted, textAlign: 'center' }}>
                Practise in two different weeks and your trend will show here.
              </div>
            ) : (
              <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Accuracy by week for the last ${WEEKS} weeks, now ${now.pct ?? 'no answers'}${now.pct != null ? '%' : ''}`} style={{ display: 'block', marginTop: 6, overflow: 'visible' }}>
                {[0, 50, 100].map(v => (
                  <g key={v}>
                    <line x1={L} x2={W - R} y1={yOf(v)} y2={yOf(v)} stroke={t.border} strokeWidth="1" />
                    <text x={L - 6} y={yOf(v) + 3.5} textAnchor="end" fontSize="10" fill={t.textFaint}>{v}%</text>
                  </g>
                ))}
                {points.map((p, i) => {
                  const h = (p.w.total / maxTotal) * (BOT - TOP) * 0.55
                  return <rect key={i} x={p.x - colW * 0.3} y={BOT - h} width={colW * 0.6} height={h} rx="2" fill={t.bgHover}><title>{`${label(p.w.start)}: ${p.w.total} answered${p.w.pct != null ? `, ${p.w.pct}% correct` : ''}`}</title></rect>
                })}
                <polyline points={linePts.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke={t.text} strokeWidth="2" strokeLinejoin="round" />
                {linePts.map((p, i) => {
                  const last = i === linePts.length - 1
                  return <circle key={i} cx={p.x} cy={p.y} r={last ? 4.5 : 2.5} fill={last ? t.accent : t.text} stroke={last ? t.text : 'none'} strokeWidth="1.5" />
                })}
                {linePts.length > 0 && (() => {
                  const p = linePts[linePts.length - 1]
                  return <text x={p.x} y={p.y - 10} textAnchor="middle" fontSize="11" fontWeight="700" fill={t.text}>{p.w.pct}%</text>
                })()}
                {[0, Math.floor(WEEKS / 2), WEEKS - 1].map(i => (
                  <text key={i} x={points[i].x} y={H - 14} textAnchor="middle" fontSize="10" fill={t.textFaint}>{i === WEEKS - 1 ? 'This week' : label(points[i].w.start)}</text>
                ))}
              </svg>
            )}
          </div>

          {/* Coming up */}
          <div style={{ ...card, padding: '12px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
              <span style={cardTitle}>Coming up</span>
              <button type="button" style={linkBtn} onClick={() => setAddOpen(v => !v)} aria-expanded={addOpen}>{addOpen ? 'Cancel' : 'Add'}</button>
            </div>
            {addOpen && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '10px 0', alignItems: 'center' }}>
                <select id="po-add-type" aria-label="Type" value={addFormType} onChange={e => setAddFormType(e.target.value)} style={input}>
                  {['Test', 'Exam', 'Assignment', 'Revision Test'].map(o => <option key={o} value={o}>{o}</option>)}
                </select>
                <input id="po-add-label" aria-label="Name" value={addFormLabel} onChange={e => setAddFormLabel(e.target.value)} placeholder="e.g. Term 4 test" style={{ ...input, flex: '1 1 140px', minWidth: 0 }} />
                <input id="po-add-date" aria-label="Date" type="date" value={addFormDate} onChange={e => setAddFormDate(e.target.value)} style={input} />
                <button type="button" style={btn(true)} disabled={!addFormLabel.trim() || !addFormDate || addingAssessment} onClick={handleAddAssessment}>{addingAssessment ? 'Saving…' : 'Save'}</button>
                {addFormError && <div role="alert" style={{ width: '100%', fontSize: 12, color: t.danger }}>{addFormError}</div>}
              </div>
            )}
            {upcoming.length === 0 && !addOpen && (
              <div style={{ fontSize: 13, color: t.textMuted, padding: '10px 0 4px', lineHeight: 1.55 }}>Add your tests and exams to see a countdown here and on Practice.</div>
            )}
            <div>
              {[...upcoming, ...(showPast ? past : [])].map(a => {
                const days = Math.ceil((new Date(a.date) - today) / DAY_MS)
                const isPast = days < 0
                const tone = isPast ? t.textFaint : days <= 14 ? t.danger : days <= 28 ? t.goldText : t.textMuted
                return (
                  <div key={a.id} className="po-item" style={{ opacity: isPast ? 0.6 : 1 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.label}</div>
                      <div style={{ fontSize: 12, color: t.textFaint }}>{a.type} · {new Date(a.date).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color: tone, fontVariantNumeric: 'tabular-nums' }}>{isPast ? 'Done' : days === 0 ? 'Today' : `${days} day${days !== 1 ? 's' : ''}`}</span>
                      <button type="button" onClick={() => handleDeleteAssessment(a.id)} aria-label={`Remove ${a.label}`} title="Remove"
                        style={{ border: 'none', background: 'transparent', color: t.textFaint, cursor: 'pointer', padding: 2, display: 'flex' }}><X size={14} aria-hidden="true" /></button>
                    </div>
                  </div>
                )
              })}
            </div>
            {past.length > 0 && (
              <button type="button" style={{ ...linkBtn, fontSize: 12, marginTop: 8, textDecorationThickness: 1 }} onClick={() => setShowPast(v => !v)}>
                {showPast ? 'Hide past' : `Show past (${past.length})`}
              </button>
            )}
          </div>
        </div>

        <div className="po-row even">
          {/* This week's plan */}
          <div id="plan" style={{ ...card, padding: '12px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
              <span style={cardTitle}>This week's plan</span>
              {plan.length > 0 && <span style={{ fontSize: 12, color: t.textFaint }}>{doneCount} of {plan.length} done</span>}
            </div>
            {plan.length === 0 ? (
              <div style={{ fontSize: 13, color: t.textMuted, padding: '10px 0 4px', lineHeight: 1.55 }}>Answer some questions in Practice and your plan for the week will appear here.</div>
            ) : (
              <div>
                {plan.map(item => {
                  const done = doneIds.includes(item.id)
                  return (
                    <div key={item.id} className="po-item">
                      <label style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, cursor: 'pointer' }}>
                        <input type="checkbox" checked={done} onChange={() => toggleDone(item.id)} style={{ width: 16, height: 16, accentColor: theme === 'dark' ? t.text : '#0c1037', flexShrink: 0 }} />
                        <span style={{ minWidth: 0 }}>
                          <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: done ? t.textFaint : t.text, textDecoration: done ? 'line-through' : 'none' }}>{item.label}</span>
                          <span style={{ display: 'block', fontSize: 12, color: t.textFaint }}>{item.note}</span>
                        </span>
                      </label>
                      {!done && <button type="button" style={btn(!item.secondary)} onClick={item.run}>{item.action}</button>}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Topic mastery */}
          <div style={{ ...card, padding: '12px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
              <span style={cardTitle}>Topic mastery</span>
              <span style={{ display: 'flex', gap: 10, fontSize: 11.5, color: t.textFaint }}>
                {[['Below 40%', t.danger], ['40–69%', t.goldText], ['70%+', t.success]].map(([l, c]) => (
                  <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 9, height: 9, borderRadius: 2, background: c }} />{l}</span>
                ))}
              </span>
            </div>
            <div>
              {masteryRows.map(r => (
                <button key={r.label} type="button" className="po-click po-item" title={`Practise ${r.label}`}
                  onClick={() => onStartSession?.({ mode: 'new', subtopics: r.topics.flatMap(subsOf) })}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
                  {r.topics.length > 1 && (
                    <span aria-hidden="true" style={{ display: 'flex', gap: 3, flexWrap: 'wrap', maxWidth: 160, justifyContent: 'flex-end' }}>
                      {r.topics.map(tp => <span key={tp} title={tp} style={{ width: 13, height: 13, borderRadius: 3, background: accuracyOf(topicStats[tp]) == null ? t.bgHover : toneOf(accuracyOf(topicStats[tp])) }} />)}
                    </span>
                  )}
                  <span style={{ width: 52, textAlign: 'right', fontSize: 13, fontWeight: 800, color: toneOf(r.pct), fontVariantNumeric: 'tabular-nums' }}>{r.pct == null ? 'New' : `${r.pct}%`}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
