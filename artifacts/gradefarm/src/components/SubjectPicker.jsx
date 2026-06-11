import { useState, useEffect } from 'react'
import { CLIENT_ONLY_SUBJECTS, effectiveCohortStageForLiveCurriculum } from '../lib/subjects'
import { fetchSubjectBankCounts } from '../lib/db'
import { fetchAllActiveCurricula } from '../lib/curriculaDb'
import { SubjectIcon } from './SubjectIcons'
import './SubjectPicker.css'

const GOLD = '#f1be43'

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

/* ─── Component ───────────────────────────────────────────── */
export default function SubjectPicker({ profile, subscriptions = [], onSelect, onGetAccess }) {
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
    <div
      className="sp-wrapper"
      style={{
        backgroundImage: `
          radial-gradient(ellipse 900px 500px at 70% -5%, ${hex(displayColor, 0.09)} 0%, transparent 60%),
          radial-gradient(ellipse 500px 400px at -5% 90%, rgba(99,102,241,0.07) 0%, transparent 55%)
        `,
      }}
    >
      <div className="sp-inner">

        {/* ── Header ── */}
        <div className="sp-fadein" style={{ marginBottom: 32 }}>
          <div className="sp-pill-badge">
            <div className="sp-pill-dot" />
            <span className="sp-pill-label">gradefarm.</span>
          </div>
          <h1 className="sp-heading">
            Hey, <span className="sp-heading-accent">{firstName}.</span>
          </h1>
          <p className="sp-subheading">
            Pick a subject and we'll build your session around exactly where you need the most work.
          </p>
        </div>

        {/* ── Loading spinner ── */}
        {loadingCurricula && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '64px 0' }}>
            <div className="sp-spinner" />
          </div>
        )}

        {!loadingCurricula && (
          <>
            {/* ── Hero Card ── */}
            {displaySubject && (
              <div
                className="sp-fadein sp-hero"
                style={{
                  background: `linear-gradient(145deg, ${hex(displayColor, 0.22)} 0%, ${hex(displayColor, 0.08)} 45%, rgba(15,18,50,0.98) 100%)`,
                  border: `1.5px solid ${hex(displayColor, 0.38)}`,
                  boxShadow: `0 20px 72px ${hex(displayColor, 0.16)}, inset 0 1px 0 rgba(255,255,255,0.06)`,
                }}
              >
                {/* glow blob */}
                <div
                  className="sp-hero-glow"
                  style={{ background: `radial-gradient(circle, ${hex(displayColor, 0.25)} 0%, transparent 65%)` }}
                />

                {/* top row */}
                <div className="sp-hero-top-row">
                  <div>
                    <div className="sp-stage-badge">
                      <div className="sp-stage-dot" />
                      <span className="sp-stage-label">{displaySubject.stage}</span>
                    </div>
                    <div className="sp-subject-name">{displaySubject.name}</div>
                  </div>

                  <div className="sp-icon-box">
                    <SubjectIcon subj={displaySubject} color="#fff" size={34} />
                  </div>
                </div>

                {/* topics */}
                {displaySubject.topics?.length > 0 && (
                  <div className="sp-topics">
                    {displaySubject.topics.slice(0, 5).map(t => (
                      <span
                        key={t}
                        className="sp-topic-pill"
                        style={{
                          background: hex(displayColor, 0.14),
                          border: `1px solid ${hex(displayColor, 0.30)}`,
                          color: displayColor,
                        }}
                      >{t}</span>
                    ))}
                    {displaySubject.topics.length > 5 && (
                      <span className="sp-topics-more">
                        +{displaySubject.topics.length - 5} more
                      </span>
                    )}
                  </div>
                )}

                {/* footer row */}
                <div className="sp-hero-footer">
                  <div className="sp-q-count">
                    <div className="sp-q-dot" />
                    <span className="sp-q-label">
                      {liveQuestionCounts?.[displaySubject.id] != null
                        ? `${liveQuestionCounts[displaySubject.id]} questions ready`
                        : 'Loading questions…'}
                    </span>
                  </div>
                  <button
                    className="sp-start-btn"
                    onClick={() => selected && onSelect(selected)}
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
                <div className="sp-section-label">YOUR SUBJECTS</div>

                <div className="sp-grid">
                  {tileSubjects.map(subj => {
                    const locked = hasSubscriptions && !subscribed.includes(subj)
                    const isSel  = selected?.id === subj.id
                    const color  = subj.color ?? GOLD
                    return (
                      <div
                        key={subj.id}
                        className="sp-tile"
                        data-selected={isSel ? 'true' : 'false'}
                        data-locked={locked ? 'true' : 'false'}
                        style={{ '--sp-color': color }}
                        onClick={() => {
                          if (locked) { onGetAccess?.({ ...subj, questionCount: liveQuestionCounts?.[subj.id] ?? subj.questionCount }); return }
                          setSelected(subj)
                        }}
                      >
                        <div className="sp-tile-icon">
                          {locked
                            ? <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.8"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4" strokeLinecap="round"/></svg>
                            : <SubjectIcon subj={subj} color={isSel ? color : hex(color, 0.85)} size={22} />
                          }
                        </div>
                        <div className="sp-tile-name">{subj.name}</div>
                        <div className="sp-tile-stage">{subj.stage}</div>
                        {isSel && <div className="sp-check">✓</div>}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ── Coming Soon ── */}
            {comingSoon.length > 0 && (
              <div>
                <div className="sp-section-label sp-section-label--soon">COMING SOON</div>
                <div className="sp-cs-grid">
                  {comingSoon.map(subj => {
                    const color = subj.color ?? GOLD
                    return (
                      <div key={subj.id} className="sp-cs-tile">
                        <div
                          className="sp-cs-icon"
                          style={{
                            background: hex(color, 0.10),
                            border: `1px solid ${hex(color, 0.18)}`,
                          }}
                        >
                          <SubjectIcon subj={subj} color={hex(color, 0.55)} size={22} />
                        </div>
                        <div className="sp-cs-name">{subj.name}</div>
                        <div className="sp-cs-soon">SOON</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ── Empty state ── */}
            {subscribed.length === 0 && notSubscribed.length === 0 && comingSoon.length === 0 && (
              <div className="sp-empty">
                No subjects available yet. Complete onboarding to set up your subjects.
              </div>
            )}
          </>
        )}

      </div>
    </div>
  )
}
