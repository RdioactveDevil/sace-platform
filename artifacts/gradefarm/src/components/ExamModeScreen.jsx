import { useState, useEffect } from 'react'
import { THEMES } from '../lib/theme'
import { buildSubjectExam, countQuestions, formatClock, examAnswerRecords } from '../lib/examEngine'
import { seenQuestionChecker } from '../lib/engine'
import { saveExamAttempt, fetchExamPercentile, fetchMyExamAttempts, recordAnswer } from '../lib/db'
import ExamSimulator from './ExamSimulator'

const GOLD = '#f1be43'

const FONT_B = "'Plus Jakarta Sans', sans-serif"
const FONT_D = "'Sifonn Pro', sans-serif"

export default function ExamModeScreen({ theme = 'dark', questions = [], struggleMap = {}, setStruggleMap, subject, profile, onExit }) {
  const t = THEMES[theme]
  const [paper, setPaper] = useState(null)
  const [activeTrack, setActiveTrack] = useState(null)
  const [recent, setRecent] = useState([])

  // Load the student's recent attempts for the history strip (refreshes when
  // returning to the landing after finishing a paper).
  useEffect(() => {
    if (paper || !profile?.id) return
    let alive = true
    fetchMyExamAttempts(profile.id, 20).then((rows) => { if (alive) setRecent(rows) }).catch(() => {})
    return () => { alive = false }
  }, [paper, profile?.id])

  // Add every question on the paper to the student's answer history, so exam
  // questions count as answered and aren't served again in practice.
  const recordExamAnswers = (records) => {
    if (!profile?.id || !records.length) return
    const now = new Date().toISOString()
    setStruggleMap?.((prev) => {
      const next = { ...prev }
      for (const r of records) {
        const old = next[r.questionId] ?? { attempts: 0, wrong: 0 }
        next[r.questionId] = { ...old, attempts: old.attempts + 1, wrong: old.wrong + (r.correct ? 0 : 1), last_seen: now }
      }
      return next
    })
    // Background, a few at a time; a failed write only loses that history row.
    const queue = [...records]
    const worker = async () => {
      for (let r = queue.shift(); r; r = queue.shift()) {
        try { await recordAnswer(profile.id, r.questionId, r.correct, r.selected) } catch { /* non-blocking */ }
      }
    }
    Promise.all(Array.from({ length: 4 }, worker)).catch(() => {})
  }

  // Persist the finished attempt (best-effort) and return the track percentile.
  const handleResult = async (result) => {
    if (paper) recordExamAnswers(examAnswerRecords(paper, result.answers))
    try { if (profile?.id) await saveExamAttempt(profile.id, result) } catch { /* non-blocking */ }
    try { return await fetchExamPercentile(result.trackId, result.percent) } catch { return null }
  }

  if (paper) {
    return (
      <ExamSimulator
        paper={paper}
        trackId={activeTrack?.id}
        theme={theme}
        onResult={handleResult}
        onExit={() => { setPaper(null); setActiveTrack(null) }}
      />
    )
  }

  // Preview the paper shape for the card; a fresh random draw happens on Start.
  // Papers prefer questions the student hasn't answered yet.
  const isSeen = seenQuestionChecker(questions, struggleMap)
  const preview = buildSubjectExam(subject, questions, isSeen)
  const previewCount = countQuestions(preview)
  const subjectAttempts = recent.filter((a) => a.track_id === preview.id).slice(0, 5)
  const start = () => { const exam = buildSubjectExam(subject, questions, isSeen); setActiveTrack(exam); setPaper(exam) }

  return (
    <div style={{ minHeight: '100vh', background: t.bg, fontFamily: FONT_B, padding: '40px 20px 80px' }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        {onExit && (
          <button onClick={onExit} style={{ marginBottom: 14, padding: '7px 14px', borderRadius: 9, border: `1px solid ${t.border}`, background: t.bgCard, color: t.textMuted, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B }}>← Back</button>
        )}
        <div style={{ textAlign: 'center', marginBottom: 30 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 14px', borderRadius: 999, background: t.accentGlow, border: `1px solid ${t.borderAccent}`, color: '#f1be43', fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>
            ⏱ Exam Mode
          </div>
          <div style={{ fontFamily: FONT_D, fontSize: 28, color: t.text, letterSpacing: 1 }}>{subject?.name || 'Practice'} exam</div>
          <div style={{ fontSize: 14, color: t.textMuted, marginTop: 8, lineHeight: 1.6, maxWidth: 520, margin: '8px auto 0' }}>
            A timed paper drawn from across this subject's topics. Flag questions, move freely, and get your marks and solutions only when you submit.
          </div>
        </div>

        <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 18, padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 11, color: t.textFaint, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {previewCount} questions · {formatClock(preview.sections[0].durationSec)}
          </div>
          {previewCount === 0 ? (
            <div style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.6 }}>
              This subject doesn't have any questions in its bank yet, so there's nothing to build an exam from.
            </div>
          ) : (
            <button onClick={start}
              style={{ width: '100%', padding: '12px', borderRadius: 11, border: 'none', background: GOLD, color: '#0c1037', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: FONT_B }}>
              Start exam →
            </button>
          )}
        </div>

        {subjectAttempts.length > 0 && (
          <div style={{ marginTop: 26, background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 16, padding: '18px 20px' }}>
            <div style={{ fontSize: 11, color: t.textFaint, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>Your recent attempts</div>
            {subjectAttempts.map((a) => {
              const title = a.title || a.track_id
              const c = a.percent >= 70 ? t.success : a.percent >= 40 ? GOLD : t.danger
              const when = new Date(a.created_at).toLocaleDateString('en-AU', { month: 'short', day: 'numeric' })
              return (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 0', borderTop: `1px solid ${t.border}` }}>
                  <span style={{ fontSize: 13, color: t.text, fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                    <span style={{ fontSize: 11, color: t.textFaint }}>{when}</span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: c }}>{a.percent}%</span>
                  </span>
                </div>
              )
            })}
          </div>
        )}

      </div>
    </div>
  )
}
