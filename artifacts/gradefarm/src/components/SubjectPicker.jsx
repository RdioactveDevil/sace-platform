import { useState, useEffect } from 'react'
import { THEMES } from '../lib/theme'
import { CLIENT_ONLY_SUBJECTS, effectiveCohortStageForLiveCurriculum, formatSubjectLabel } from '../lib/subjects'
import { fetchSubjectBankCounts } from '../lib/db'
import { fetchAllActiveCurricula } from '../lib/curriculaDb'
import { SubjectIcon } from './SubjectIcons'

const GOLD  = '#f1be43'
const GOLDL = '#f9d87a'
const FONT_B = `'Plus Jakarta Sans', sans-serif`
const FONT_D = `'Sifonn Pro', sans-serif`

function hex(color, alpha) {
  const c = color.replace('#', '')
  const r = parseInt(c.slice(0, 2), 16)
  const g = parseInt(c.slice(2, 4), 16)
  const b = parseInt(c.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

function subMatchesSubject(sub, s) {
  if (sub.subject_name === s.name && (sub.stage === s.stage || !sub.stage)) return true
  if (s.curriculumName && sub.subject_name === s.curriculumName) return true
  return false
}

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

export default function SubjectPicker({ profile, subscriptions = [], onSelect, onGetAccess, theme }) {
  const [selected, setSelected]         = useState(null)
  const [liveQuestionCounts, setCounts] = useState(() => readCountsCache())
  const [dynamicSubjects, setDynamic]   = useState([])
  const [loadingCurricula, setLoading]  = useState(true)

  useEffect(() => {
    fetchAllActiveCurricula()
      .then(curricula => {
        setDynamic(curricula.map(c => ({
          id: `curriculum_${c.id}`,
          name: c.name,
          stage: effectiveCohortStageForLiveCurriculum(c.name, c.level_label),
          color: '#6366f1',
          topics: c.topicNames,
          questionCount: 0,
          available: c.status === 'live',
        })))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    let cancelled = false
    const pairs = dynamicSubjects
      .filter(s => s.available)
      .map(s => [s.id, s.name, s.stage || ''])
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
  }, [dynamicSubjects]) // eslint-disable-line react-hooks/exhaustive-deps

  const builtInSubjects  = CLIENT_ONLY_SUBJECTS
  const allSubjects      = [...builtInSubjects, ...dynamicSubjects]
  const hasSubscriptions = subscriptions.length > 0
  const subscribed       = allSubjects.filter(s => s.available && (!hasSubscriptions || subscriptions.some(sub => subMatchesSubject(sub, s))))
  const notSubscribed    = hasSubscriptions ? allSubjects.filter(s => s.available && !subscriptions.some(sub => subMatchesSubject(sub, s))) : []
  const comingSoon       = allSubjects.filter(s => !s.available)

  const firstName = profile.display_name?.split(' ')[0] ?? 'there'

  useEffect(() => {
    if (!selected && subscribed.length > 0) setSelected(subscribed[0])
  }, [subscribed.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const displaySubject = selected ?? subscribed[0] ?? null
  const displayColor   = displaySubject?.color ?? GOLD
  const tileSubjects   = [...subscribed, ...notSubscribed]

  return (
    <div style={{
      flex: 1, minHeight: 0, overflowY: 'auto',
      background: '#06071a',
      backgroundImage: `
        radial-gradient(ellipse 900px 500px at 70% -5%, ${hex(displayColor, 0.09)} 0%, transparent 60%),
        radial-gradient(ellipse 500px 400px at -5% 90%, rgba(99,102,241,0.07) 0%, transparent 55%)
      `,
      color: '#f1f5f9', fontFamily: FONT_B,
      padding: '44px 32px 100px',
      boxSizing: 'border-box',
      transition: 'background-image 0.4s ease',
    }}>
      <style>{`
        @font-face { font-family:'Sifonn Pro'; src:url('/SIFONN_PRO.otf') format('opentype'); font-display:swap; }
        *, *::before, *::after { box-sizing: border-box; }
        @keyframes spFadeUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:none} }
        @keyframes spSpin    { to{transform:rotate(360deg)} }
        .sp-fadein { animation: spFadeUp 0.32s ease both; }
        .sp-tile:hover { filter: brightness(1.15); }
      `}</style>

      <div style={{ maxWidth: 860, margin: '0 auto' }}>

        {/* ── Header ── */}
        <div className="sp-fadein" style={{ marginBottom: 32 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 18,
            background: 'rgba(241,190,67,0.10)', border: '1px solid rgba(241,190,67,0.22)',
            borderRadius: 30, padding: '5px 14px',
          }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: GOLD, boxShadow: `0 0 8px ${hex(GOLD, 0.7)}` }} />
            <span style={{ fontFamily: FONT_D, fontSize: 9, letterSpacing: '0.18em', color: GOLD }}>gradefarm.</span>
          </div>
          <h1 style={{
            fontFamily: FONT_D, fontSize: 'clamp(26px, 4vw, 40px)', fontWeight: 400,
            margin: '0 0 10px', lineHeight: 1.1, letterSpacing: '1px', color: '#fff',
          }}>
            Hey, <span style={{ color: GOLD }}>{firstName}.</span>
          </h1>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', margin: 0, lineHeight: 1.6, maxWidth: 380 }}>
            Pick a subject and we'll build your session around exactly where you need the most work.
          </p>
        </div>

        {/* ── Loading spinner ── */}
        {loadingCurricula && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '64px 0' }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              border: `2px solid ${hex(GOLD, 0.2)}`, borderTopColor: GOLD,
              animation: 'spSpin 0.7s linear infinite',
            }} />
          </div>
        )}

        {!loadingCurricula && (
          <>
            {/* ── Hero Card ── */}
            {displaySubject && (
              <div className="sp-fadein" style={{
                borderRadius: 24,
                background: `linear-gradient(145deg, ${hex(displayColor, 0.22)} 0%, ${hex(displayColor, 0.08)} 45%, rgba(15,18,50,0.98) 100%)`,
                border: `1.5px solid ${hex(displayColor, 0.38)}`,
                padding: '32px 36px',
                marginBottom: 20,
                position: 'relative',
                overflow: 'hidden',
                boxShadow: `0 20px 72px ${hex(displayColor, 0.16)}, inset 0 1px 0 rgba(255,255,255,0.06)`,
                transition: 'all 0.3s ease',
              }}>
                {/* glow blob */}
                <div style={{
                  position: 'absolute', bottom: -50, right: -50,
                  width: 300, height: 300, borderRadius: '50%', pointerEvents: 'none',
                  background: `radial-gradient(circle, ${hex(displayColor, 0.25)} 0%, transparent 65%)`,
                  transition: 'background 0.35s',
                }} />

                {/* top row */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, position: 'relative' }}>
                  <div>
                    <div style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 12,
                      background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.28)',
                      borderRadius: 99, padding: '4px 12px',
                    }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff', boxShadow: '0 0 6px rgba(255,255,255,0.7)' }} />
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', letterSpacing: '0.08em' }}>
                        {displaySubject.stage}
                      </span>
                    </div>
                    <div style={{
                      fontSize: 'clamp(24px, 3.5vw, 34px)', fontWeight: 900, color: '#fff',
                      letterSpacing: '-0.5px', lineHeight: 1.1,
                    }}>
                      {displaySubject.name}
                    </div>
                  </div>

                  <div style={{
                    width: 68, height: 68, borderRadius: 18, flexShrink: 0,
                    background: 'rgba(255,255,255,0.12)',
                    border: '1.5px solid rgba(255,255,255,0.28)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 8px 28px rgba(0,0,0,0.25)',
                    transition: 'all 0.3s ease',
                  }}>
                    <SubjectIcon subj={displaySubject} color="#fff" size={34} />
                  </div>
                </div>

                {/* topics */}
                {displaySubject.topics?.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 24 }}>
                    {displaySubject.topics.slice(0, 5).map(t => (
                      <span key={t} style={{
                        fontSize: 11, fontWeight: 600, padding: '5px 12px', borderRadius: 99,
                        background: hex(displayColor, 0.14), border: `1px solid ${hex(displayColor, 0.30)}`,
                        color: displayColor, letterSpacing: '0.01em',
                      }}>{t}</span>
                    ))}
                    {displaySubject.topics.length > 5 && (
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', alignSelf: 'center', paddingLeft: 4 }}>
                        +{displaySubject.topics.length - 5} more
                      </span>
                    )}
                  </div>
                )}

                {/* footer row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#34d399', boxShadow: '0 0 7px rgba(52,211,153,0.8)' }} />
                    <span style={{ fontSize: 13, color: '#34d399', fontWeight: 600 }}>
                      {liveQuestionCounts?.[displaySubject.id] != null
                        ? `${liveQuestionCounts[displaySubject.id]} questions ready`
                        : 'Loading questions…'}
                    </span>
                  </div>
                  <button
                    onClick={() => selected && onSelect(selected)}
                    style={{
                      padding: '11px 28px', borderRadius: 12, border: 'none',
                      background: '#ffffff',
                      color: '#06071a', fontSize: 14, fontWeight: 800,
                      cursor: 'pointer', fontFamily: FONT_B, letterSpacing: '0.01em',
                      boxShadow: '0 6px 24px rgba(0,0,0,0.25)',
                      opacity: selected ? 1 : 0.45,
                      transition: 'opacity 0.2s',
                    }}
                    disabled={!selected}
                  >
                    Start Session →
                  </button>
                </div>
              </div>
            )}

            {/* ── Subject Tiles ── */}
            {tileSubjects.length > 0 && (
              <div style={{ marginBottom: 28 }}>
                <div style={{
                  fontSize: 10, fontWeight: 800, letterSpacing: '0.16em',
                  color: 'rgba(255,255,255,0.28)', marginBottom: 12, paddingLeft: 2,
                }}>YOUR SUBJECTS</div>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(auto-fill, minmax(130px, 1fr))`,
                  gap: 10,
                }}>
                  {tileSubjects.map(subj => {
                    const locked = hasSubscriptions && !subscribed.includes(subj)
                    const isSel  = selected?.id === subj.id
                    const color  = subj.color ?? GOLD
                    return (
                      <div
                        key={subj.id}
                        className="sp-tile"
                        onClick={() => {
                          if (locked) { onGetAccess?.({ ...subj, questionCount: liveQuestionCounts?.[subj.id] ?? subj.questionCount }); return }
                          setSelected(subj)
                        }}
                        style={{
                          borderRadius: 16, padding: '16px 14px',
                          background: isSel ? `${hex(color, 0.18)}` : 'rgba(255,255,255,0.03)',
                          border: isSel ? `1.5px solid ${hex(color, 0.48)}` : '1px solid rgba(255,255,255,0.07)',
                          cursor: 'pointer', textAlign: 'center',
                          transition: 'all 0.15s ease',
                          boxShadow: isSel ? `0 4px 20px ${hex(color, 0.25)}` : 'none',
                          position: 'relative', overflow: 'hidden',
                          opacity: locked ? 0.5 : 1,
                        }}
                      >
                        <div style={{
                          width: 44, height: 44, borderRadius: 12, margin: '0 auto 10px',
                          background: isSel ? `${hex(color, 0.28)}` : `${hex(color, 0.14)}`,
                          border: `1.5px solid ${hex(color, isSel ? 0.55 : 0.28)}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          boxShadow: isSel ? `0 4px 14px ${hex(color, 0.35)}` : 'none',
                          transition: 'all 0.15s',
                        }}>
                          {locked
                            ? <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.8"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4" strokeLinecap="round"/></svg>
                            : <SubjectIcon subj={subj} color={isSel ? color : `${hex(color, 0.85)}`} size={22} />
                          }
                        </div>
                        <div style={{
                          fontSize: 12, fontWeight: 700, color: isSel ? '#fff' : 'rgba(255,255,255,0.6)',
                          lineHeight: 1.25, marginBottom: 3, transition: 'color 0.15s',
                        }}>{subj.name}</div>
                        <div style={{
                          fontSize: 10, fontWeight: 600,
                          color: isSel ? color : 'rgba(255,255,255,0.28)',
                          transition: 'color 0.15s',
                        }}>{subj.stage}</div>
                        {isSel && (
                          <div style={{
                            position: 'absolute', top: 8, right: 8,
                            width: 18, height: 18, borderRadius: '50%',
                            background: `linear-gradient(135deg, ${GOLD}, ${GOLDL})`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 9, color: '#06071a', fontWeight: 900,
                            boxShadow: `0 2px 8px ${hex(GOLD, 0.55)}`,
                          }}>✓</div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ── Coming Soon ── */}
            {comingSoon.length > 0 && (
              <div>
                <div style={{
                  fontSize: 10, fontWeight: 800, letterSpacing: '0.16em',
                  color: 'rgba(255,255,255,0.18)', marginBottom: 12, paddingLeft: 2,
                }}>COMING SOON</div>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(auto-fill, minmax(130px, 1fr))`,
                  gap: 10, opacity: 0.35,
                }}>
                  {comingSoon.map(subj => {
                    const color = subj.color ?? GOLD
                    return (
                      <div key={subj.id} style={{
                        borderRadius: 16, padding: '16px 14px',
                        background: 'rgba(255,255,255,0.025)',
                        border: '1px dashed rgba(255,255,255,0.10)',
                        textAlign: 'center',
                      }}>
                        <div style={{
                          width: 44, height: 44, borderRadius: 12, margin: '0 auto 10px',
                          background: hex(color, 0.10), border: `1px solid ${hex(color, 0.18)}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <SubjectIcon subj={subj} color={hex(color, 0.55)} size={22} />
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.5)', marginBottom: 3 }}>{subj.name}</div>
                        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.10em', color: 'rgba(255,255,255,0.25)' }}>SOON</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ── Empty state ── */}
            {subscribed.length === 0 && notSubscribed.length === 0 && comingSoon.length === 0 && (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: 'rgba(255,255,255,0.3)', fontSize: 14 }}>
                No subjects available yet. Complete onboarding to set up your subjects.
              </div>
            )}
          </>
        )}

      </div>
    </div>
  )
}
