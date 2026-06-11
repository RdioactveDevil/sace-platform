import { useState, useEffect } from 'react'
import { THEMES } from '../lib/theme'
import { ALL_SUBJECTS, QUESTIONS_SUBJECT_BY_ID, effectiveCohortStageForLiveCurriculum } from '../lib/subjects'
import { fetchSubjectBankCounts } from '../lib/db'
import { fetchLiveCurricula } from '../lib/curriculaDb'

const GOLD  = '#f1be43'
const GOLDL = '#f9d87a'
const FONT_B = `'Plus Jakarta Sans', sans-serif`
const FONT_D = `'Sifonn Pro', sans-serif`

/* ─── hex→rgba helper ─────────────────────────────────── */
function hex(color, alpha) {
  const c = color.replace('#', '')
  const r = parseInt(c.slice(0, 2), 16)
  const g = parseInt(c.slice(2, 4), 16)
  const b = parseInt(c.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

const BUILT_IN_CURRICULUM_NAMES = new Set([
  ...ALL_SUBJECTS.map(s => `${s.name} ${s.stage}`.trim()),
  ...Object.values(QUESTIONS_SUBJECT_BY_ID),
])

const COUNTS_CACHE_KEY = 'gradefarm_subject_counts_v1'
const COUNTS_CACHE_TTL = 5 * 60 * 1000

function readCountsCache() {
  try {
    const raw = localStorage.getItem(COUNTS_CACHE_KEY)
    if (!raw) return null
    const { ts, counts } = JSON.parse(raw)
    if (Date.now() - ts > COUNTS_CACHE_TTL) return null
    return counts
  } catch { return null }
}
function writeCountsCache(counts) {
  try { localStorage.setItem(COUNTS_CACHE_KEY, JSON.stringify({ ts: Date.now(), counts })) } catch {}
}
function subMatchesSubject(sub, s) {
  if (sub.subject_name === s.name && (sub.stage === s.stage || !sub.stage)) return true
  if (s.curriculumName && sub.subject_name === s.curriculumName) return true
  return false
}

export default function SubjectPicker({ profile, subscriptions = [], onSelect, onGetAccess, theme }) {
  const [selected, setSelected]       = useState(null)
  const [liveQuestionCounts, setCounts] = useState(() => readCountsCache())
  const [dynamicSubjects, setDynamic] = useState([])

  useEffect(() => {
    fetchLiveCurricula()
      .then(curricula => {
        setDynamic(curricula
          .filter(c => !BUILT_IN_CURRICULUM_NAMES.has(c.name))
          .map(c => ({
            id: `curriculum_${c.id}`,
            name: c.name,
            stage: effectiveCohortStageForLiveCurriculum(c.name, c.level_label),
            icon: '📚', color: '#6366f1',
            topics: c.topicNames, questionCount: 0,
            available: c.status === 'live',
          })))
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    let cancelled = false
    const pairs = [
      ...ALL_SUBJECTS.filter(s => s.available && QUESTIONS_SUBJECT_BY_ID[s.id])
        .map(s => [s.id, QUESTIONS_SUBJECT_BY_ID[s.id], s.stage || '']),
      ...dynamicSubjects.filter(s => s.available)
        .map(s => [s.id, s.name, s.stage || '']),
    ]
    if (!pairs.length) return undefined
    fetchSubjectBankCounts(pairs.map(([, subject, levelLabel]) => ({ subject, levelLabel })))
      .then(counts => {
        if (cancelled) return
        const merged = { ...(readCountsCache() ?? {}), ...Object.fromEntries(pairs.map(([id, sn]) => [id, counts[sn] ?? 0])) }
        writeCountsCache(merged)
        setCounts(merged)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [dynamicSubjects])

  const hasSubscriptions = subscriptions.length > 0
  const allSubjects = [...ALL_SUBJECTS, ...dynamicSubjects]
  const subscribed    = allSubjects.filter(s => s.available && (!hasSubscriptions || subscriptions.some(sub => subMatchesSubject(sub, s))))
  const notSubscribed = hasSubscriptions ? allSubjects.filter(s => s.available && !subscriptions.some(sub => subMatchesSubject(sub, s))) : []
  const comingSoon    = allSubjects.filter(s => !s.available)

  const firstName = profile.display_name?.split(' ')[0] ?? 'there'

  /* ─── Subject Card ─────────────────────────────────────── */
  const SubjectCard = ({ subj, locked = false, delay = 0 }) => {
    const [hover, setHover] = useState(false)
    const isSelected = selected?.id === subj.id
    const color = subj.color ?? GOLD
    const qCount = liveQuestionCounts?.[subj.id]

    const cardBg = isSelected
      ? `linear-gradient(145deg, ${hex(color, 0.18)} 0%, ${hex(color, 0.06)} 60%, rgba(20,24,60,0.95) 100%)`
      : hover && !locked
        ? `linear-gradient(145deg, ${hex(color, 0.10)} 0%, rgba(20,24,60,0.95) 100%)`
        : 'rgba(255,255,255,0.035)'

    return (
      <div
        onClick={() => !locked && setSelected(subj)}
        onMouseEnter={() => !locked && setHover(true)}
        onMouseLeave={() => setHover(false)}
        className="sp-card"
        style={{
          animationDelay: `${delay}ms`,
          position: 'relative', overflow: 'hidden',
          borderRadius: 20, padding: '24px',
          cursor: locked ? 'default' : 'pointer',
          background: cardBg,
          border: isSelected
            ? `1.5px solid ${hex(color, 0.55)}`
            : hover && !locked
              ? `1px solid ${hex(color, 0.30)}`
              : '1px solid rgba(255,255,255,0.08)',
          boxShadow: isSelected
            ? `0 0 0 1px ${hex(color, 0.15)}, 0 12px 40px ${hex(color, 0.22)}, 0 2px 8px rgba(0,0,0,0.35)`
            : hover && !locked
              ? `0 8px 32px rgba(0,0,0,0.4)`
              : '0 2px 12px rgba(0,0,0,0.25)',
          transition: 'all 0.18s ease',
          transform: hover && !locked && !isSelected ? 'translateY(-4px)' : 'none',
        }}
      >
        {/* colour glow */}
        <div style={{
          position: 'absolute', top: -40, right: -40,
          width: 180, height: 180, borderRadius: '50%', pointerEvents: 'none',
          background: `radial-gradient(circle, ${hex(color, isSelected ? 0.22 : hover ? 0.14 : 0.07)} 0%, transparent 70%)`,
          transition: 'opacity 0.2s',
        }} />

        {/* top row — icon + name */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 16 }}>
          <div style={{
            width: 50, height: 50, borderRadius: 14, flexShrink: 0,
            background: locked
              ? 'rgba(255,255,255,0.06)'
              : `linear-gradient(135deg, ${hex(color, 0.35)} 0%, ${hex(color, 0.12)} 100%)`,
            border: locked ? '1px solid rgba(255,255,255,0.08)' : `1.5px solid ${hex(color, 0.45)}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 24,
            boxShadow: locked ? 'none' : `0 4px 16px ${hex(color, 0.30)}`,
            opacity: locked ? 0.45 : 1,
          }}>
            {locked ? '🔒' : subj.icon}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 15, fontWeight: 800, lineHeight: 1.25,
              color: locked ? 'rgba(255,255,255,0.35)' : '#f1f5f9',
              marginBottom: 3,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {subj.name}
            </div>
            <div style={{
              fontSize: 11, fontWeight: 700, letterSpacing: '0.05em',
              color: locked ? 'rgba(255,255,255,0.2)' : color,
            }}>
              {subj.stage}
            </div>
          </div>

          {isSelected && (
            <div style={{
              width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
              background: `linear-gradient(135deg, ${GOLD}, ${GOLDL})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, color: '#0c1037', fontWeight: 900,
              boxShadow: `0 2px 10px ${hex(GOLD, 0.5)}`,
            }}>✓</div>
          )}
        </div>

        {/* topic pills */}
        {subj.topics.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 16 }}>
            {subj.topics.slice(0, 3).map(topic => (
              <span key={topic} style={{
                fontSize: 10, fontWeight: 600, letterSpacing: '0.02em',
                padding: '3px 9px', borderRadius: 20,
                background: locked ? 'rgba(255,255,255,0.04)' : hex(color, 0.12),
                border: `1px solid ${locked ? 'rgba(255,255,255,0.07)' : hex(color, 0.28)}`,
                color: locked ? 'rgba(255,255,255,0.25)' : color,
              }}>{topic}</span>
            ))}
            {subj.topics.length > 3 && (
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', alignSelf: 'center' }}>
                +{subj.topics.length - 3}
              </span>
            )}
          </div>
        )}

        {/* footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>
            {qCount != null ? `${qCount} questions` : '—'}
          </span>
          {locked ? (
            <button
              onClick={e => { e.stopPropagation(); onGetAccess?.({ ...subj, questionCount: liveQuestionCounts?.[subj.id] ?? subj.questionCount }) }}
              style={{
                fontSize: 11, fontWeight: 700,
                background: `linear-gradient(135deg, ${GOLD}, ${GOLDL})`,
                color: '#0c1037', padding: '6px 14px', borderRadius: 8,
                border: 'none', cursor: 'pointer', fontFamily: FONT_B,
                boxShadow: `0 3px 12px ${hex(GOLD, 0.35)}`,
              }}
            >✦ Get Access</button>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#34d399', boxShadow: '0 0 6px rgba(52,211,153,0.6)' }} />
              <span style={{ fontSize: 11, color: '#34d399', fontWeight: 600 }}>Ready</span>
            </div>
          )}
        </div>
      </div>
    )
  }

  const SectionLabel = ({ children }) => (
    <div style={{
      fontSize: 10, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase',
      color: 'rgba(255,255,255,0.28)', marginBottom: 14,
      paddingLeft: 2,
    }}>{children}</div>
  )

  return (
    <div style={{
      flex: 1, minHeight: 0, overflowY: 'auto',
      background: '#0d1140',
      backgroundImage: `
        radial-gradient(ellipse 900px 600px at 60% -10%, rgba(241,190,67,0.07) 0%, transparent 70%),
        radial-gradient(ellipse 600px 400px at -10% 80%, rgba(99,102,241,0.08) 0%, transparent 60%),
        linear-gradient(rgba(241,190,67,0.025) 1px, transparent 1px),
        linear-gradient(90deg, rgba(241,190,67,0.025) 1px, transparent 1px)
      `,
      backgroundSize: '100% 100%, 100% 100%, 48px 48px, 48px 48px',
      color: '#f1f5f9', fontFamily: FONT_B,
      padding: '52px 40px 100px',
      boxSizing: 'border-box',
    }}>
      <style>{`
        @font-face { font-family:'Sifonn Pro'; src:url('/SIFONN_PRO.otf') format('opentype'); font-display:swap; }
        *, *::before, *::after { box-sizing: border-box; }
        @keyframes spFadeUp {
          from { opacity:0; transform:translateY(18px); }
          to   { opacity:1; transform:none; }
        }
        .sp-card { animation: spFadeUp 0.36s ease both; }
      `}</style>

      <div style={{ maxWidth: 860, margin: '0 auto' }}>

        {/* ── Header ── */}
        <div style={{ marginBottom: 52, animation: 'spFadeUp 0.28s ease' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 20,
            background: 'rgba(241,190,67,0.10)', border: '1px solid rgba(241,190,67,0.22)',
            borderRadius: 30, padding: '5px 14px',
          }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: GOLD, boxShadow: `0 0 8px ${hex(GOLD, 0.7)}` }} />
            <span style={{ fontFamily: FONT_D, fontSize: 9, letterSpacing: '0.18em', color: GOLD }}>gradefarm.</span>
          </div>

          <h1 style={{
            fontFamily: FONT_D, fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 400,
            margin: '0 0 14px', lineHeight: 1.1, letterSpacing: '1px',
            color: '#fff',
          }}>
            Hey, <span style={{ color: GOLD }}>{firstName}.</span>
          </h1>
          <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.48)', margin: 0, lineHeight: 1.65, maxWidth: 420 }}>
            Pick a subject and we'll build your session around exactly where you need the most work.
          </p>
        </div>

        {/* ── Available ── */}
        {subscribed.length > 0 && (
          <div style={{ marginBottom: 36, animation: 'spFadeUp 0.34s ease' }}>
            <SectionLabel>Your Subjects</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(248px, 1fr))', gap: 14 }}>
              {subscribed.map((subj, i) => <SubjectCard key={subj.id} subj={subj} delay={i * 45} />)}
            </div>
          </div>
        )}

        {/* ── Locked ── */}
        {notSubscribed.length > 0 && (
          <div style={{ marginBottom: 36, animation: 'spFadeUp 0.4s ease' }}>
            <SectionLabel>Unlock More Subjects</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(248px, 1fr))', gap: 14 }}>
              {notSubscribed.map(subj => <SubjectCard key={subj.id} subj={subj} locked />)}
            </div>
          </div>
        )}

        {/* ── Coming Soon ── */}
        {comingSoon.length > 0 && (
          <div style={{ marginBottom: 36 }}>
            <SectionLabel>Coming Soon</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(248px, 1fr))', gap: 10, opacity: 0.4 }}>
              {comingSoon.map(subj => (
                <div key={subj.id} style={{
                  borderRadius: 16, padding: '16px 18px',
                  background: 'rgba(255,255,255,0.025)',
                  border: '1px dashed rgba(255,255,255,0.10)',
                  display: 'flex', alignItems: 'center', gap: 13,
                }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                    background: hex(subj.color, 0.14), border: `1px solid ${hex(subj.color, 0.22)}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
                  }}>{subj.icon}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.6)' }}>{subj.name}</div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>{subj.stage}</div>
                  </div>
                  <span style={{
                    fontSize: 9, fontWeight: 800, letterSpacing: '0.12em',
                    color: 'rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.06)',
                    padding: '3px 8px', borderRadius: 6,
                  }}>SOON</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Empty state ── */}
        {subscribed.length === 0 && notSubscribed.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'rgba(255,255,255,0.3)', fontSize: 14 }}>
            No subjects available yet. Complete onboarding to set up your subjects.
          </div>
        )}

        {/* ── Sticky Start CTA ── */}
        <div style={{
          position: 'sticky', bottom: 0,
          padding: '24px 0 0',
          background: 'linear-gradient(to top, #0d1140 55%, transparent)',
          marginTop: 16,
        }}>
          <button
            onClick={() => selected && onSelect(selected)}
            disabled={!selected}
            style={{
              width: '100%', padding: '16px 28px',
              borderRadius: 14, border: selected ? 'none' : '1px solid rgba(255,255,255,0.08)',
              background: selected
                ? `linear-gradient(135deg, ${GOLD} 0%, ${GOLDL} 100%)`
                : 'rgba(255,255,255,0.04)',
              color: selected ? '#0c1037' : 'rgba(255,255,255,0.25)',
              fontSize: 15, fontWeight: 800,
              cursor: selected ? 'pointer' : 'default',
              fontFamily: FONT_B, letterSpacing: '0.02em',
              boxShadow: selected ? `0 8px 32px ${hex(GOLD, 0.40)}, 0 2px 8px rgba(0,0,0,0.3)` : 'none',
              transition: 'all 0.2s ease',
            }}
          >
            {selected ? `Start ${selected.name}${selected.stage ? ` · ${selected.stage}` : ''} →` : 'Select a subject above'}
          </button>
        </div>

      </div>
    </div>
  )
}
