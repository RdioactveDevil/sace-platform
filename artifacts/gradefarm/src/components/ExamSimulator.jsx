import { useState, useEffect } from 'react'
import { THEMES } from '../lib/theme'
import { getQuestionType, gradeResponse, describeCorrectAnswer, emptyResponse } from '../lib/questionTypes'
import { gradePaper, formatClock, countQuestions } from '../lib/examEngine'
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

// MCQ rendered for the exam — collects a selection (collect mode) or reveals
// correctness (review mode). Kept inline so the exam never shows feedback mid-test.
function ExamMcq({ q, value, onChange, review, theme }) {
  const t = THEMES[theme]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {q.options.map((opt, i) => {
        const picked = value === i
        const isCorrect = i === q.answer_index
        let bg = t.bgSubtle, border = `1px solid ${t.border}`, color = t.textSub, lBg = t.borderMid, lCol = t.text
        if (review) {
          if (isCorrect) { bg = t.successBg; border = `1px solid ${t.success}55`; color = t.success; lBg = `${t.success}33`; lCol = t.success }
          else if (picked) { bg = t.dangerBg; border = `1px solid ${t.danger}55`; color = t.danger; lBg = `${t.danger}33`; lCol = t.danger }
          else { bg = 'transparent'; color = t.textFaint; lCol = t.textFaint }
        } else if (picked) { bg = t.accentGlow; border = `1px solid ${t.borderAccent}`; color = t.text; lBg = t.accentGlow; lCol = GOLD }
        return (
          <button key={i} onClick={() => { if (!review) onChange(i) }}
            style={{ background: bg, border, color, padding: '12px 16px', borderRadius: 11, fontSize: 14, fontWeight: 600, textAlign: 'left', cursor: review ? 'default' : 'pointer', fontFamily: FONT_B, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 28, height: 28, borderRadius: '50%', background: lBg, color: lCol, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0 }}>
              {review && isCorrect ? '✓' : review && picked ? '✗' : String.fromCharCode(65 + i)}
            </span>
            <span style={{ minWidth: 0, flex: 1 }}><MathText text={opt} /></span>
          </button>
        )
      })}
    </div>
  )
}

// A single question's stimulus + input, shared by the running exam and review.
function ExamQuestion({ q, answers, setAnswer, review, theme }) {
  const t = THEMES[theme]
  const type = getQuestionType(q)
  const value = answers[q.id]
  return (
    <div>
      {q.graph && <GraphView graph={q.graph} theme={theme} />}
      {q.table_data && <TableView table={q.table_data} theme={theme} />}
      {q.image_url && type === 'mcq' && (
        <img src={q.image_url} alt="Question diagram" style={{ width: '100%', maxHeight: 300, objectFit: 'contain', borderRadius: 10, marginBottom: 16 }} />
      )}
      <div style={{ fontSize: 17, fontWeight: 700, color: t.text, lineHeight: 1.7, marginBottom: 20 }}>
        <MathText text={q.question} />
      </div>
      {type === 'mcq' ? (
        <ExamMcq q={q} value={value} onChange={(i) => setAnswer(q.id, i)} review={review} theme={theme} />
      ) : (
        <QuestionRenderer
          question={q}
          response={value ?? emptyResponse(q)}
          onChange={(r) => setAnswer(q.id, r)}
          showAns={review}
          hideCheck
          theme={theme}
        />
      )}
      {review && (
        <div style={{ marginTop: 16, padding: '12px 14px', borderRadius: 10, background: t.bgSubtle, border: `1px solid ${t.border}` }}>
          <div style={{ fontSize: 11, color: t.textFaint, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Explanation</div>
          <div style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.7 }}><MathText text={q.solution || ''} /></div>
          {type !== 'mcq' && (
            <div style={{ marginTop: 8, fontSize: 12, color: t.success, fontWeight: 700 }}>Correct answer: <MathText text={describeCorrectAnswer(q)} /></div>
          )}
        </div>
      )}
    </div>
  )
}

export default function ExamSimulator({ paper, theme = 'dark', onExit }) {
  const t = THEMES[theme]
  const [phase, setPhase] = useState('intro')   // intro | running | results | review
  const [secIdx, setSecIdx] = useState(0)
  const [qIdx, setQIdx] = useState(0)
  const [answers, setAnswers] = useState({})
  const [flagged, setFlagged] = useState(new Set())
  const [timeLeft, setTimeLeft] = useState(paper.sections[0]?.durationSec ?? 0)
  const [secTimes, setSecTimes] = useState({})
  const [reviewIdx, setReviewIdx] = useState(0)

  const section = paper.sections[secIdx]

  const setAnswer = (qid, resp) => setAnswers((a) => ({ ...a, [qid]: resp }))
  const toggleFlag = (qid) => setFlagged((prev) => {
    const next = new Set(prev)
    next.has(qid) ? next.delete(qid) : next.add(qid)
    return next
  })

  const finishSection = () => {
    setSecTimes((prev) => ({ ...prev, [section.id]: section.durationSec - timeLeft }))
    if (secIdx + 1 < paper.sections.length) {
      setSecIdx(secIdx + 1)
      setQIdx(0)
      setPhase('intro')
    } else {
      setPhase('results')
    }
  }

  // Countdown — ticks only while a section is running.
  useEffect(() => {
    if (phase !== 'running') return
    const id = setInterval(() => setTimeLeft((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(id)
  }, [phase, secIdx])

  // Auto-submit the section when its timer expires.
  useEffect(() => {
    if (phase === 'running' && timeLeft <= 0) finishSection()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, timeLeft])

  const beginSection = () => {
    setTimeLeft(section.durationSec)
    setQIdx(0)
    setPhase('running')
  }

  // ── Section intro ──────────────────────────────────────────────────────────
  if (phase === 'intro') {
    return (
      <Shell theme={theme}>
        <div style={{ textAlign: 'center', maxWidth: 460 }}>
          <div style={{ fontSize: 12, color: t.textFaint, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>
            {paper.title} · Section {secIdx + 1} of {paper.sections.length}
          </div>
          <div style={{ fontFamily: FONT_D, fontSize: 26, color: t.text, marginBottom: 16 }}>{section.name}</div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginBottom: 18 }}>
            <Stat t={t} label="Questions" value={section.questions.length} />
            <Stat t={t} label="Time" value={formatClock(section.durationSec)} />
          </div>
          <div style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.7, marginBottom: 24 }}>{section.instructions}</div>
          <button onClick={beginSection} style={primaryBtn}>Begin section →</button>
          <button onClick={onExit} style={{ ...ghostBtn(t), marginTop: 10 }}>Exit exam</button>
        </div>
      </Shell>
    )
  }

  // ── Results ──────────────────────────────────────────────────────────────────
  if (phase === 'results') {
    const r = gradePaper(paper, answers, secTimes)
    const accColor = r.percent >= 70 ? t.success : r.percent >= 40 ? GOLD : t.danger
    return (
      <Shell theme={theme} scroll>
        <div style={{ width: '100%', maxWidth: 520 }}>
          <div style={{ textAlign: 'center', marginBottom: 26 }}>
            <div style={{ fontSize: 46, marginBottom: 8 }}>{r.percent >= 70 ? '🏆' : r.percent >= 40 ? '📈' : '💪'}</div>
            <div style={{ fontFamily: FONT_D, fontSize: 26, color: t.text }}>Exam complete</div>
            <div style={{ fontSize: 13, color: t.textMuted, marginTop: 4 }}>{paper.title}</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 22 }}>
            <Stat t={t} label="Overall" value={`${r.percent}%`} big color={accColor} />
            <Stat t={t} label="Correct" value={`${r.totalCorrect}/${r.totalQuestions}`} big />
            <Stat t={t} label="Sections" value={paper.sections.length} big />
          </div>
          <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 16, padding: '18px 20px', marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: t.textFaint, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>Section breakdown</div>
            {r.perSection.map((s) => {
              const c = s.percent >= 70 ? t.success : s.percent >= 40 ? GOLD : t.danger
              return (
                <div key={s.id} style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: 13, color: t.text, fontWeight: 600 }}>{s.name}</span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: c }}>{s.correct}/{s.total}{s.timeSec != null ? ` · ${formatClock(s.timeSec)}` : ''}</span>
                  </div>
                  <div style={{ background: t.borderMid, borderRadius: 999, height: 6, overflow: 'hidden' }}>
                    <div style={{ width: `${s.percent}%`, height: '100%', background: c, borderRadius: 999, transition: 'width 0.6s ease' }} />
                  </div>
                </div>
              )
            })}
          </div>
          <button onClick={() => { setReviewIdx(0); setPhase('review') }} style={primaryBtn}>Review answers →</button>
          <button onClick={onExit} style={{ ...ghostBtn(t), marginTop: 10 }}>Back to exams</button>
        </div>
        <QuizToolsDock theme={theme} />
      </Shell>
    )
  }

  // ── Review (flatten all questions across sections) ───────────────────────────
  if (phase === 'review') {
    const flat = paper.sections.flatMap((s) => s.questions.map((q) => ({ q, sectionName: s.name })))
    const cur = flat[reviewIdx]
    const correct = gradeResponse(cur.q, answers[cur.q.id])
    return (
      <Shell theme={theme} scroll>
        <div style={{ width: '100%', maxWidth: 600 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <span style={{ fontSize: 12, color: t.textMuted, fontWeight: 700 }}>{cur.sectionName} · Q{reviewIdx + 1}/{flat.length}</span>
            <span style={{ padding: '4px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, background: correct ? t.successBg : t.dangerBg, color: correct ? t.success : t.danger, border: `1px solid ${correct ? t.success + '55' : t.danger + '55'}` }}>
              {correct ? '✓ Correct' : '✗ Incorrect'}
            </span>
          </div>
          <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 20, padding: 24, marginBottom: 14 }}>
            <ExamQuestion q={cur.q} answers={answers} setAnswer={() => {}} review theme={theme} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setReviewIdx((i) => Math.max(0, i - 1))} disabled={reviewIdx === 0} style={navBtn(t, reviewIdx === 0)}>← Prev</button>
            {reviewIdx + 1 < flat.length
              ? <button onClick={() => setReviewIdx((i) => i + 1)} style={{ ...primaryBtn, marginTop: 0, flex: 1 }}>Next →</button>
              : <button onClick={onExit} style={{ ...primaryBtn, marginTop: 0, flex: 1 }}>Finish review</button>}
          </div>
        </div>
        <QuizToolsDock theme={theme} />
      </Shell>
    )
  }

  // ── Running a section ────────────────────────────────────────────────────────
  const q = section.questions[qIdx]
  const urgent = timeLeft <= 30
  const answeredCount = section.questions.filter((qq) => answers[qq.id] !== undefined && answers[qq.id] !== null && !(Array.isArray(answers[qq.id]) && answers[qq.id].length === 0)).length

  return (
    <div style={{ minHeight: '100vh', background: t.bg, fontFamily: FONT_B, display: 'flex', flexDirection: 'column' }}>
      {/* Top bar */}
      <div style={{ background: `linear-gradient(135deg,${GOLD},${GOLDL})`, padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: NAVY }}>{section.name}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: urgent ? '#b91c1c' : NAVY, background: urgent ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.12)', padding: '3px 12px', borderRadius: 20, fontVariantNumeric: 'tabular-nums' }}>
            ⏱ {formatClock(timeLeft)}
          </span>
          <button onClick={finishSection} style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid rgba(0,0,0,0.2)', background: 'transparent', color: NAVY, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B }}>
            {secIdx + 1 < paper.sections.length ? 'Finish section' : 'Finish exam'}
          </button>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0, flexWrap: 'wrap' }}>
        {/* Question */}
        <div style={{ flex: 1, minWidth: 280, padding: '24px 20px', overflowY: 'auto' }}>
          <div style={{ maxWidth: 620, margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 12, color: t.textMuted, fontWeight: 700 }}>Question {qIdx + 1} of {section.questions.length}</span>
              <button onClick={() => toggleFlag(q.id)} style={{ padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B, border: `1px solid ${flagged.has(q.id) ? t.borderAccent : t.border}`, background: flagged.has(q.id) ? t.accentGlow : 'transparent', color: flagged.has(q.id) ? GOLD : t.textMuted }}>
                {flagged.has(q.id) ? '⚑ Flagged' : '⚐ Flag'}
              </button>
            </div>
            <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 20, padding: 24 }}>
              <ExamQuestion q={q} answers={answers} setAnswer={setAnswer} review={false} theme={theme} />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button onClick={() => setQIdx((i) => Math.max(0, i - 1))} disabled={qIdx === 0} style={navBtn(t, qIdx === 0)}>← Prev</button>
              {qIdx + 1 < section.questions.length
                ? <button onClick={() => setQIdx((i) => i + 1)} style={{ ...primaryBtn, marginTop: 0, flex: 1 }}>Next →</button>
                : <button onClick={finishSection} style={{ ...primaryBtn, marginTop: 0, flex: 1 }}>{secIdx + 1 < paper.sections.length ? 'Submit section →' : 'Submit exam →'}</button>}
            </div>
          </div>
        </div>

        {/* Navigator */}
        <div style={{ width: 200, flexShrink: 0, borderLeft: `1px solid ${t.border}`, background: t.bgSubtle, padding: 18, overflowY: 'auto' }}>
          <div style={{ fontSize: 10, color: t.textFaint, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>Questions</div>
          <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 12 }}>{answeredCount}/{section.questions.length} answered</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 6 }}>
            {section.questions.map((qq, i) => {
              const isAnswered = answers[qq.id] !== undefined && answers[qq.id] !== null && !(Array.isArray(answers[qq.id]) && answers[qq.id].length === 0)
              const isFlagged = flagged.has(qq.id)
              const isCurrent = i === qIdx
              return (
                <button key={qq.id} onClick={() => setQIdx(i)}
                  style={{
                    aspectRatio: '1', borderRadius: 8, fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: FONT_B, position: 'relative',
                    border: `1px solid ${isCurrent ? GOLD : isAnswered ? t.success + '55' : t.border}`,
                    background: isCurrent ? t.accentGlow : isAnswered ? t.successBg : t.bgCard,
                    color: isCurrent ? GOLD : isAnswered ? t.success : t.textMuted,
                  }}>
                  {i + 1}
                  {isFlagged && <span style={{ position: 'absolute', top: -4, right: -4, fontSize: 10 }}>⚑</span>}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <QuizToolsDock theme={theme} />
    </div>
  )
}

// ── Small presentational helpers ──────────────────────────────────────────────
function Shell({ children, theme, scroll }) {
  const t = THEMES[theme]
  return (
    <div style={{ minHeight: '100vh', background: t.bg, fontFamily: FONT_B, display: 'flex', alignItems: scroll ? 'flex-start' : 'center', justifyContent: 'center', padding: '40px 20px' }}>
      {children}
    </div>
  )
}

function Stat({ t, label, value, big, color }) {
  return (
    <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 14, padding: big ? '16px 10px' : '10px 16px', textAlign: 'center', minWidth: 80 }}>
      <div style={{ fontSize: big ? 22 : 16, fontWeight: 800, color: color || t.text, fontFamily: FONT_D }}>{value}</div>
      <div style={{ fontSize: 10, color: t.textMuted, marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>{label}</div>
    </div>
  )
}

const primaryBtn = {
  width: '100%', padding: '14px', borderRadius: 12, border: 'none',
  background: `linear-gradient(135deg,${GOLD},${GOLDL})`, color: NAVY,
  fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: FONT_B, marginTop: 16,
}
function ghostBtn(t) {
  return { width: '100%', padding: '12px', borderRadius: 12, border: `1px solid ${t.border}`, background: 'transparent', color: t.textMuted, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B }
}
function navBtn(t, disabled) {
  return { padding: '14px 18px', borderRadius: 12, border: `1px solid ${t.border}`, background: t.bgCard, color: disabled ? t.textFaint : t.text, fontSize: 14, fontWeight: 700, cursor: disabled ? 'default' : 'pointer', fontFamily: FONT_B, opacity: disabled ? 0.5 : 1 }
}
