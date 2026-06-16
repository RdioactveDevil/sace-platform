import { useState, useEffect } from 'react'
import { THEMES } from '../lib/theme'
import {
  SELECTIVE_BRAND,
  SELECTIVE_COMPONENTS,
  WRITING_TASKS,
  SELECTIVE_MOCK_TRACK_ID,
  buildPracticePaper,
  buildMockPaper,
} from '../lib/selectiveEntry'
import { countQuestions, formatClock } from '../lib/examEngine'
import { saveExamAttempt, fetchExamPercentile, fetchMyExamAttempts } from '../lib/db'
import ExamSimulator from './ExamSimulator'
import EssayMarkerScreen from './EssayMarkerScreen'

const GOLD = '#f1be43'
const NAVY = '#0c1037'
const FONT_B = "'Plus Jakarta Sans', sans-serif"
const FONT_D = "'Sifonn Pro', sans-serif"

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'practice', label: 'Practice' },
  { id: 'writing', label: 'Writing' },
  { id: 'mock', label: 'Mock Exam' },
]

// One reusable card chrome for the section tiles.
function Card({ t, children, accent }) {
  return (
    <div style={{ background: t.bgCard, border: `1px solid ${accent ? accent + '55' : t.border}`, borderRadius: 18, padding: 22, display: 'flex', flexDirection: 'column' }}>
      {children}
    </div>
  )
}

function Pill({ t, children }) {
  return (
    <span style={{ fontSize: 11, color: t.textFaint, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
      {children}
    </span>
  )
}

export default function SelectiveEntryScreen({ theme = 'dark', profile, onExit }) {
  const t = THEMES[theme]
  const [tab, setTab] = useState('overview')
  // Active timed paper (practice or mock) running in the simulator.
  const [active, setActive] = useState(null) // { paper, trackId, returnTab }
  const [recent, setRecent] = useState([])

  // Recent mock attempts for the history strip on the Mock tab.
  useEffect(() => {
    if (active || !profile?.id) return
    let alive = true
    fetchMyExamAttempts(profile.id, 5)
      .then((rows) => { if (alive) setRecent((rows || []).filter((r) => r.track_id === SELECTIVE_MOCK_TRACK_ID)) })
      .catch(() => {})
    return () => { alive = false }
  }, [active, profile?.id])

  const startPractice = (componentId) => {
    const paper = buildPracticePaper(componentId)
    if (paper) setActive({ paper, trackId: `practice-${componentId}`, returnTab: 'practice' })
  }

  const startMock = () => {
    setActive({ paper: buildMockPaper(), trackId: SELECTIVE_MOCK_TRACK_ID, returnTab: 'mock' })
  }

  // Persist mock attempts (best-effort) and return the track percentile. Practice
  // runs are not saved, to keep the attempt history focused on full mocks.
  const handleResult = async (result) => {
    if (active?.trackId !== SELECTIVE_MOCK_TRACK_ID) return null
    try { if (profile?.id) await saveExamAttempt(profile.id, result) } catch { /* non-blocking */ }
    try { return await fetchExamPercentile(result.trackId, result.percent) } catch { return null }
  }

  if (active) {
    return (
      <ExamSimulator
        paper={active.paper}
        trackId={active.trackId}
        theme={theme}
        onResult={active.trackId === SELECTIVE_MOCK_TRACK_ID ? handleResult : undefined}
        onExit={() => { const back = active.returnTab; setActive(null); setTab(back) }}
      />
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: t.bg, fontFamily: FONT_B, padding: '36px 20px 80px' }}>
      <div style={{ maxWidth: 820, margin: '0 auto' }}>
        {onExit && (
          <button onClick={onExit} style={{ marginBottom: 14, padding: '7px 14px', borderRadius: 9, border: `1px solid ${t.border}`, background: t.bgCard, color: t.textMuted, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B }}>← Back</button>
        )}

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 14px', borderRadius: 999, background: SELECTIVE_BRAND.accent + '1f', border: `1px solid ${SELECTIVE_BRAND.accent}55`, color: SELECTIVE_BRAND.accent, fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>
            {SELECTIVE_BRAND.icon} {SELECTIVE_BRAND.short}
          </div>
          <div style={{ fontFamily: FONT_D, fontSize: 28, color: t.text, letterSpacing: 1 }}>{SELECTIVE_BRAND.name}</div>
          <div style={{ fontSize: 14, color: t.textMuted, marginTop: 8, lineHeight: 1.6, maxWidth: 560, margin: '8px auto 0' }}>
            {SELECTIVE_BRAND.blurb}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 22 }}>
          {TABS.map((x) => (
            <button key={x.id} onClick={() => setTab(x.id)}
              style={{ padding: '8px 16px', borderRadius: 999, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B,
                border: `1px solid ${tab === x.id ? SELECTIVE_BRAND.accent + '88' : t.border}`,
                background: tab === x.id ? SELECTIVE_BRAND.accent + '1f' : t.bgCard,
                color: tab === x.id ? SELECTIVE_BRAND.accent : t.textMuted }}>
              {x.label}
            </button>
          ))}
        </div>

        {tab === 'overview' && <Overview t={t} onTab={setTab} onMock={startMock} />}
        {tab === 'practice' && <Practice t={t} onStart={startPractice} />}
        {tab === 'writing' && (
          <div style={{ marginTop: -8 }}>
            <EssayMarkerScreen
              theme={theme}
              essayTypes={WRITING_TASKS}
              badge="✍️ Written Expression"
              title="Practise the written expression task"
              subtitle="The Victorian selective-entry exam includes two writing tasks. Generate a real-style prompt, write under timed conditions, and get criterion-by-criterion feedback."
            />
          </div>
        )}
        {tab === 'mock' && <Mock t={t} onStart={startMock} recent={recent} />}
      </div>
    </div>
  )
}

// ── Overview tab ─────────────────────────────────────────────────────────────
function Overview({ t, onTab, onMock }) {
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 18 }}>
        {SELECTIVE_COMPONENTS.map((c) => (
          <Card key={c.id} t={t} accent={c.accent}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              <div style={{ width: 42, height: 42, borderRadius: 12, background: c.accent + '22', border: `1px solid ${c.accent}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>{c.icon}</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: t.text }}>{c.name}</div>
            </div>
            <div style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.6 }}>{c.blurb}</div>
          </Card>
        ))}
        <Card t={t} accent={GOLD}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, background: GOLD + '22', border: `1px solid ${GOLD}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>✍️</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: t.text }}>Written Expression</div>
          </div>
          <div style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.6 }}>Two writing tasks — a creative piece and a persuasive piece — with instant AI feedback.</div>
        </Card>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button onClick={() => onTab('practice')} style={{ flex: '1 1 200px', padding: '14px', borderRadius: 12, border: 'none', background: `linear-gradient(135deg,${GOLD},#f9d87a)`, color: NAVY, fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: FONT_B }}>
          Start practising →
        </button>
        <button onClick={onMock} style={{ flex: '1 1 200px', padding: '14px', borderRadius: 12, border: `1px solid ${SELECTIVE_BRAND.accent}88`, background: SELECTIVE_BRAND.accent + '1f', color: SELECTIVE_BRAND.accent, fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: FONT_B }}>
          Sit the full mock exam →
        </button>
      </div>

      <div style={{ marginTop: 20, fontSize: 12, color: t.textFaint, textAlign: 'center', lineHeight: 1.6 }}>
        Indicative practice content — based on the Edutest-style format used for Victorian selective-entry schools, not an official paper.
      </div>
    </div>
  )
}

// ── Practice tab ─────────────────────────────────────────────────────────────
function Practice({ t, onStart }) {
  return (
    <div>
      <div style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.6, marginBottom: 16, textAlign: 'center' }}>
        Pick a component to practise on its own. Each set is timed but generously, so you can build accuracy before adding exam pressure.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
        {SELECTIVE_COMPONENTS.map((c) => (
          <Card key={c.id} t={t} accent={c.accent}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              <div style={{ width: 46, height: 46, borderRadius: 12, background: c.accent + '22', border: `1px solid ${c.accent}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>{c.icon}</div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: t.text }}>{c.name}</div>
                <Pill t={t}>{c.questions.length} questions · {formatClock(c.practiceDurationSec)}</Pill>
              </div>
            </div>
            <div style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.6, flex: 1, marginBottom: 16 }}>{c.blurb}</div>
            <button onClick={() => onStart(c.id)}
              style={{ width: '100%', padding: '12px', borderRadius: 11, border: 'none', background: c.accent, color: NAVY, fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: FONT_B }}>
              Practise {c.short} →
            </button>
          </Card>
        ))}
      </div>
    </div>
  )
}

// ── Mock tab ─────────────────────────────────────────────────────────────────
function Mock({ t, onStart, recent }) {
  const paper = buildMockPaper()
  const totalQ = countQuestions(paper)
  const totalTime = paper.sections.reduce((n, s) => n + s.durationSec, 0)
  return (
    <div>
      <Card t={t} accent={SELECTIVE_BRAND.accent}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div style={{ width: 46, height: 46, borderRadius: 12, background: SELECTIVE_BRAND.accent + '22', border: `1px solid ${SELECTIVE_BRAND.accent}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>⏱</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: t.text }}>Full timed mock exam</div>
            <Pill t={t}>{paper.sections.length} sections · {totalQ} questions · {formatClock(totalTime)}</Pill>
          </div>
        </div>
        <div style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.6, marginBottom: 14 }}>
          Sit every multiple-choice component back to back under exam timing — flag questions, navigate freely within each section, and get a full breakdown with an indicative band only when you finish. (The written expression tasks are practised separately on the Writing tab.)
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {paper.sections.map((s) => (
            <span key={s.id} style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, background: t.bgSubtle, border: `1px solid ${t.border}`, borderRadius: 999, padding: '4px 10px' }}>
              {s.name} · {formatClock(s.durationSec)}
            </span>
          ))}
        </div>
        <button onClick={onStart}
          style={{ width: '100%', padding: '14px', borderRadius: 12, border: 'none', background: `linear-gradient(135deg,${GOLD},#f9d87a)`, color: NAVY, fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: FONT_B }}>
          Start mock exam →
        </button>
      </Card>

      {recent.length > 0 && (
        <div style={{ marginTop: 18, background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 16, padding: '18px 20px' }}>
          <div style={{ fontSize: 11, color: t.textFaint, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>Your recent mock attempts</div>
          {recent.map((a) => {
            const c = a.percent >= 70 ? t.success : a.percent >= 40 ? GOLD : t.danger
            const when = new Date(a.created_at).toLocaleDateString('en-AU', { month: 'short', day: 'numeric' })
            return (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 0', borderTop: `1px solid ${t.border}` }}>
                <span style={{ fontSize: 13, color: t.text, fontWeight: 600 }}>{a.title || 'Mock Exam'}</span>
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
  )
}
