import { useState, useEffect } from 'react'
import { THEMES } from '../lib/theme'
import { ALL_SUBJECTS, QUESTIONS_SUBJECT_BY_ID, effectiveCohortStageForLiveCurriculum } from '../lib/subjects'
import { fetchSubjectBankCounts } from '../lib/db'
import { fetchLiveCurricula } from '../lib/curriculaDb'

const GOLD  = '#f1be43'
const GOLDL = '#f9d87a'
const FONT_B = `'Plus Jakarta Sans', sans-serif`
const FONT_D = `'Sifonn Pro', sans-serif`

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
  const [selected, setSelected]         = useState(null)
  const [hovering, setHovering]         = useState(null)
  const [liveQuestionCounts, setLiveCounts] = useState(() => readCountsCache())
  const [dynamicSubjects, setDynamic]   = useState([])
  const t = THEMES[theme] ?? THEMES.dark
  const isDark = theme === 'dark'

  useEffect(() => {
    fetchLiveCurricula()
      .then(curricula => {
        const dynamic = curricula
          .filter(c => !BUILT_IN_CURRICULUM_NAMES.has(c.name))
          .map(c => ({
            id: `curriculum_${c.id}`,
            name: c.name,
            stage: effectiveCohortStageForLiveCurriculum(c.name, c.level_label),
            icon: '📚',
            color: '#6366f1',
            topics: c.topicNames,
            questionCount: 0,
            available: c.status === 'live',
          }))
        setDynamic(dynamic)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    let cancelled = false
    const pairs = [
      ...ALL_SUBJECTS
        .filter(s => s.available && QUESTIONS_SUBJECT_BY_ID[s.id])
        .map(s => [s.id, QUESTIONS_SUBJECT_BY_ID[s.id], s.stage || '']),
      ...dynamicSubjects
        .filter(s => s.available)
        .map(s => [s.id, s.name, s.stage || '']),
    ]
    if (pairs.length === 0) return undefined
    const payload = pairs.map(([, subjectName, stage]) => ({ subject: subjectName, levelLabel: stage }))
    fetchSubjectBankCounts(payload)
      .then(counts => {
        if (cancelled) return
        const results = pairs.map(([id, subjectName]) => [id, counts[subjectName] ?? 0])
        const merged = { ...(readCountsCache() ?? {}), ...Object.fromEntries(results) }
        writeCountsCache(merged)
        setLiveCounts(merged)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [dynamicSubjects])

  const hasSubscriptions = subscriptions.length > 0
  const allSubjects = [...ALL_SUBJECTS, ...dynamicSubjects]

  const subscribed = allSubjects.filter(s =>
    s.available && (!hasSubscriptions || subscriptions.some(sub => subMatchesSubject(sub, s)))
  )
  const notSubscribed = hasSubscriptions
    ? allSubjects.filter(s => s.available && !subscriptions.some(sub => subMatchesSubject(sub, s)))
    : []
  const comingSoon = allSubjects.filter(s => !s.available)

  const handleSelect = (subj) => {
    setSelected(subj)
  }

  const handleStart = () => {
    if (selected) onSelect(selected)
  }

  const firstName = profile.display_name?.split(' ')[0] ?? 'there'

  const SubjectCard = ({ subj, locked = false }) => {
    const isSelected = selected?.id === subj.id
    const isHovering = hovering === subj.id
    const qCount = liveQuestionCounts?.[subj.id]
    const color = subj.color ?? GOLD

    return (
      <div
        onClick={() => !locked && handleSelect(subj)}
        onMouseEnter={() => !locked && setHovering(subj.id)}
        onMouseLeave={() => setHovering(null)}
        style={{
          position: 'relative',
          borderRadius: 18,
          padding: '22px 22px 20px',
          cursor: locked ? 'default' : 'pointer',
          transition: 'transform 0.18s ease, box-shadow 0.18s ease',
          transform: !locked && isHovering && !isSelected ? 'translateY(-3px)' : 'none',
          overflow: 'hidden',
          background: isDark
            ? (isSelected ? `linear-gradient(145deg,${color}18,${t.bgCard} 60%)` : t.bgCard)
            : (isSelected ? `${color}0d` : t.bgCard),
          border: isSelected
            ? `1.5px solid ${color}66`
            : isHovering
              ? `1px solid ${color}33`
              : `1px solid ${t.border}`,
          boxShadow: isSelected
            ? `0 0 0 1px ${color}22, 0 8px 32px ${color}20`
            : isHovering
              ? `0 4px 24px rgba(0,0,0,0.22)`
              : isDark ? '0 2px 8px rgba(0,0,0,0.2)' : '0 1px 4px rgba(0,0,0,0.06)',
        }}
      >
        {/* colour glow blob */}
        {(isSelected || isHovering) && !locked && (
          <div style={{
            position: 'absolute', top: -30, right: -30,
            width: 140, height: 140, borderRadius: '50%',
            background: `radial-gradient(circle,${color}28 0%,transparent 70%)`,
            pointerEvents: 'none',
          }} />
        )}

        {/* locked overlay */}
        {locked && (
          <div style={{
            position: 'absolute', inset: 0, borderRadius: 18,
            background: isDark ? 'rgba(34,38,64,0.55)' : 'rgba(248,249,255,0.65)',
            backdropFilter: 'blur(1px)',
            zIndex: 1,
            display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end',
            padding: '16px 18px',
          }}>
            <button
              onClick={e => {
                e.stopPropagation()
                onGetAccess?.({ ...subj, questionCount: liveQuestionCounts?.[subj.id] ?? subj.questionCount })
              }}
              style={{
                fontSize: 12, fontWeight: 700,
                background: `linear-gradient(135deg,${GOLD},${GOLDL})`,
                color: '#0c1037',
                padding: '7px 16px', borderRadius: 9,
                border: 'none', cursor: 'pointer',
                fontFamily: FONT_B,
                boxShadow: `0 4px 14px ${GOLD}40`,
                letterSpacing: '0.02em',
              }}
            >
              ✦ Get Access
            </button>
          </div>
        )}

        {/* card content */}
        <div style={{ position: 'relative', zIndex: 0 }}>
          {/* icon + name row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
            <div style={{
              width: 46, height: 46, borderRadius: 13, flexShrink: 0,
              background: locked
                ? (isDark ? 'rgba(255,255,255,0.05)' : '#f0f2ff')
                : `linear-gradient(135deg,${color}30,${color}10)`,
              border: locked
                ? `1px solid ${t.border}`
                : `1px solid ${color}40`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 22,
              boxShadow: locked ? 'none' : `0 4px 14px ${color}20`,
              opacity: locked ? 0.5 : 1,
            }}>
              {locked ? '🔒' : subj.icon}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 15, fontWeight: 800, lineHeight: 1.2,
                color: locked ? t.textMuted : t.text,
                marginBottom: 2,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {subj.name}
              </div>
              <div style={{
                fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
                color: locked ? t.textFaint : color,
              }}>
                {subj.stage}
              </div>
            </div>
            {/* selected checkmark */}
            {isSelected && (
              <div style={{
                width: 22, height: 22, borderRadius: '50%',
                background: `linear-gradient(135deg,${GOLD},${GOLDL})`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, color: '#0c1037', fontWeight: 900,
                flexShrink: 0,
              }}>✓</div>
            )}
          </div>

          {/* topic pills */}
          {subj.topics.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 14 }}>
              {subj.topics.slice(0, 3).map(topic => (
                <span key={topic} style={{
                  fontSize: 10, fontWeight: 600, letterSpacing: '0.02em',
                  padding: '3px 8px', borderRadius: 6,
                  background: locked
                    ? (isDark ? 'rgba(255,255,255,0.04)' : '#eef0ff')
                    : `${color}14`,
                  border: `1px solid ${locked ? t.border : color + '28'}`,
                  color: locked ? t.textFaint : color,
                  opacity: locked ? 0.7 : 1,
                }}>{topic}</span>
              ))}
              {subj.topics.length > 3 && (
                <span style={{ fontSize: 10, color: t.textFaint, alignSelf: 'center' }}>
                  +{subj.topics.length - 3}
                </span>
              )}
            </div>
          )}

          {/* footer row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: t.textMuted, fontWeight: 500 }}>
              {qCount != null ? `${qCount} questions` : '…'}
            </span>
            {!locked && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#34d399' }} />
                <span style={{ fontSize: 11, color: '#34d399', fontWeight: 600 }}>Ready</span>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  const SectionLabel = ({ children }) => (
    <div style={{
      fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase',
      color: t.textFaint, marginBottom: 14,
    }}>
      {children}
    </div>
  )

  return (
    <div style={{
      flex: 1, minHeight: 0, overflowY: 'auto',
      background: t.bg, color: t.text, fontFamily: FONT_B,
      padding: '48px 36px 80px',
      boxSizing: 'border-box',
    }}>
      <style>{`
        @font-face { font-family:'Sifonn Pro'; src:url('/SIFONN_PRO.otf') format('opentype'); font-display:swap; }
        *, *::before, *::after { box-sizing: border-box; }
        @keyframes spFadeUp { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:none} }
        .sp-card { animation: spFadeUp 0.32s ease both; }
        .sp-start:hover { opacity: 0.9; transform: translateY(-1px) !important; }
      `}</style>

      <div style={{ maxWidth: 880, margin: '0 auto' }}>

        {/* ── Header ── */}
        <div style={{ marginBottom: 44, animation: 'spFadeUp 0.28s ease' }}>
          <div style={{ marginBottom: 6 }}>
            <span style={{
              fontFamily: FONT_D, fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase',
              color: GOLD, opacity: 0.7,
            }}>gradefarm.</span>
          </div>
          <h1 style={{
            fontFamily: FONT_D, fontSize: 'clamp(26px,4vw,40px)', fontWeight: 400,
            margin: '0 0 12px', lineHeight: 1.1, letterSpacing: '0.5px',
          }}>
            <span style={{ color: t.text }}>Hey, </span>
            <span style={{ color: GOLD }}>{firstName}.</span>
          </h1>
          <p style={{ fontSize: 15, color: t.textMuted, margin: 0, lineHeight: 1.6, maxWidth: 440 }}>
            Pick a subject to practise — your session adapts to exactly where you need the most work.
          </p>
        </div>

        {/* ── Subscribed subjects ── */}
        {subscribed.length > 0 && (
          <div style={{ marginBottom: 32, animation: 'spFadeUp 0.34s ease' }}>
            <SectionLabel>Your Subjects</SectionLabel>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
              gap: 14,
            }}>
              {subscribed.map((subj, i) => (
                <div key={subj.id} className="sp-card" style={{ animationDelay: `${i * 40}ms` }}>
                  <SubjectCard subj={subj} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Locked / not subscribed ── */}
        {notSubscribed.length > 0 && (
          <div style={{ marginBottom: 32 }}>
            <SectionLabel>Unlock More Subjects</SectionLabel>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
              gap: 14,
            }}>
              {notSubscribed.map(subj => (
                <SubjectCard key={subj.id} subj={subj} locked />
              ))}
            </div>
          </div>
        )}

        {/* ── Coming soon ── */}
        {comingSoon.length > 0 && (
          <div style={{ marginBottom: 32, opacity: 0.45 }}>
            <SectionLabel>Coming Soon</SectionLabel>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
              gap: 10,
            }}>
              {comingSoon.map(subj => (
                <div key={subj.id} style={{
                  background: t.bgCard, border: `1px dashed ${t.border}`,
                  borderRadius: 18, padding: '18px 20px',
                  display: 'flex', alignItems: 'center', gap: 14,
                }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 11,
                    background: `${subj.color}12`, border: `1px solid ${subj.color}22`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 19, flexShrink: 0,
                  }}>{subj.icon}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: t.textSub }}>{subj.name}</div>
                    <div style={{ fontSize: 11, color: t.textFaint }}>{subj.stage}</div>
                  </div>
                  <span style={{
                    fontSize: 9, fontWeight: 800, letterSpacing: '0.1em',
                    background: isDark ? 'rgba(255,255,255,0.06)' : '#e2e5f0',
                    color: t.textFaint, padding: '3px 8px', borderRadius: 6,
                  }}>SOON</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Empty state ── */}
        {subscribed.length === 0 && notSubscribed.length === 0 && (
          <div style={{
            textAlign: 'center', padding: '60px 20px',
            color: t.textMuted, fontSize: 14,
          }}>
            No subjects available yet. Complete onboarding to set up your subjects.
          </div>
        )}

        {/* ── Start CTA ── */}
        <div style={{
          position: 'sticky', bottom: 0, paddingTop: 20,
          background: `linear-gradient(to top, ${t.bg} 70%, transparent)`,
          marginTop: 8,
        }}>
          <button
            className="sp-start"
            onClick={handleStart}
            disabled={!selected}
            style={{
              width: '100%', padding: '16px 24px',
              borderRadius: 14, border: 'none',
              background: selected
                ? `linear-gradient(135deg,${GOLD},${GOLDL})`
                : (isDark ? 'rgba(255,255,255,0.06)' : '#e8eaf4'),
              color: selected ? '#0c1037' : t.textFaint,
              fontSize: 15, fontWeight: 800,
              cursor: selected ? 'pointer' : 'default',
              fontFamily: FONT_B,
              letterSpacing: '0.02em',
              boxShadow: selected ? `0 6px 28px ${GOLD}44` : 'none',
              transition: 'all 0.2s ease',
              transform: 'none',
            }}
          >
            {selected
              ? `Start ${selected.name}${selected.stage ? ` · ${selected.stage}` : ''} →`
              : 'Select a subject above'}
          </button>
        </div>

      </div>
    </div>
  )
}
