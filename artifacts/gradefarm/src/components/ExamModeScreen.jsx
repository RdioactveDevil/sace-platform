import { useState, useEffect } from 'react'
import { THEMES } from '../lib/theme'
import { EXAM_TRACKS } from '../lib/examTracks'
import { buildPaper, countQuestions, formatClock } from '../lib/examEngine'
import { saveExamAttempt, fetchExamPercentile, fetchMyExamAttempts } from '../lib/db'
import ExamSimulator from './ExamSimulator'

const GOLD = '#f1be43'

const FONT_B = "'Plus Jakarta Sans', sans-serif"
const FONT_D = "'Sifonn Pro', sans-serif"

export default function ExamModeScreen({ theme = 'dark', questions = [], profile, onExit }) {
  const t = THEMES[theme]
  const [paper, setPaper] = useState(null)
  const [activeTrack, setActiveTrack] = useState(null)
  const [recent, setRecent] = useState([])

  // Load the student's recent attempts for the history strip (refreshes when
  // returning to the landing after finishing a paper).
  useEffect(() => {
    if (paper || !profile?.id) return
    let alive = true
    fetchMyExamAttempts(profile.id, 5).then((rows) => { if (alive) setRecent(rows) }).catch(() => {})
    return () => { alive = false }
  }, [paper, profile?.id])

  // Persist the finished attempt (best-effort) and return the track percentile.
  const handleResult = async (result) => {
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

  const start = (track) => { setActiveTrack(track); setPaper(buildPaper(track, questions)) }

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
          <div style={{ fontFamily: FONT_D, fontSize: 28, color: t.text, letterSpacing: 1 }}>Timed exam simulator</div>
          <div style={{ fontSize: 14, color: t.textMuted, marginTop: 8, lineHeight: 1.6, maxWidth: 520, margin: '8px auto 0' }}>
            Sit a sectioned, timed paper just like the real thing — flag questions, navigate freely, and get a full breakdown only when you submit.
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: 16 }}>
          {EXAM_TRACKS.map((track) => {
            const built = buildPaper(track, questions)
            const totalQ = countQuestions(built)
            const totalTime = built.sections.reduce((n, s) => n + s.durationSec, 0)
            return (
              <div key={track.id} style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 18, padding: 22, display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                  <div style={{ width: 46, height: 46, borderRadius: 12, background: track.accent + '22', border: `1px solid ${track.accent}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>{track.icon}</div>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: t.text, display: 'flex', alignItems: 'center', gap: 8 }}>
                      {track.title}
                      {track.comingSoon && <span style={{ fontSize: 9, fontWeight: 800, color: track.accent, background: track.accent + '22', border: `1px solid ${track.accent}55`, padding: '2px 7px', borderRadius: 999, letterSpacing: '0.06em' }}>PREVIEW</span>}
                    </div>
                    <div style={{ fontSize: 11, color: t.textFaint, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      {built.sections.length} section{built.sections.length !== 1 ? 's' : ''} · {totalQ} questions · {formatClock(totalTime)}
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.6, flex: 1, marginBottom: 16 }}>{track.blurb}</div>
                <button onClick={() => start(track)}
                  style={{ width: '100%', padding: '12px', borderRadius: 11, border: 'none', background: track.accent, color: '#0c1037', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: FONT_B }}>
                  Start {track.short} →
                </button>
              </div>
            )
          })}
        </div>

        {recent.length > 0 && (
          <div style={{ marginTop: 26, background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 16, padding: '18px 20px' }}>
            <div style={{ fontSize: 11, color: t.textFaint, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>Your recent attempts</div>
            {recent.map((a) => {
              const title = a.title || (EXAM_TRACKS.find((x) => x.id === a.track_id)?.title) || a.track_id
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

        <div style={{ marginTop: 22, fontSize: 12, color: t.textFaint, textAlign: 'center', lineHeight: 1.6 }}>
          Preview tracks run a short sample paper to demonstrate the format. Full-length UCAT, GAMSAT and selective-entry content is being built out.
        </div>
      </div>
    </div>
  )
}
