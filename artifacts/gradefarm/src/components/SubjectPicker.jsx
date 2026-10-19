import { useState, useEffect } from 'react'
import { curriculumToSubjectTile, subscriptionCoversSubject as subMatchesSubject } from '../lib/subjects'
import { fetchSubjectBankCounts, getBillingConfig } from '../lib/db'
import { fetchLiveCurricula } from '../lib/curriculaDb'
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
/**
 * `fullAccess` (tutors/admins) unlocks every subject. Everyone else sees the
 * subjects they have access to, then the rest with their trial / weekly price.
 */
export default function SubjectPicker({ profile, subscriptions = [], fullAccess = false, onSelect, onGetAccess }) {
  const [selected, setSelected]         = useState(null)
  const [liveQuestionCounts, setCounts] = useState(() => readCountsCache())
  const [dynamicSubjects, setDynamic]   = useState([])
  const [loadingCurricula, setLoading]  = useState(true)
  const [billing, setBilling]           = useState(null)

  useEffect(() => {
    if (fullAccess) return
    getBillingConfig().then(setBilling).catch(() => {})
  }, [fullAccess])

  useEffect(() => {
    fetchLiveCurricula()
      .then(curricula => {
        setDynamic(curricula.map(curriculumToSubjectTile))
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
    fetchSubjectBankCounts(pairs.map(([id, subject, levelLabel]) => ({
      subject, levelLabel, curriculumId: id.startsWith('curriculum_') ? id.slice('curriculum_'.length) : undefined,
    })))
      .then(counts => {
        if (cancelled) return
        const merged = { ...(readCountsCache() ?? {}), ...Object.fromEntries(pairs.map(([id, sn]) => [id, counts[sn] ?? 0])) }
        writeCountsCache(merged)
        setCounts(merged)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [dynamicSubjects]) // eslint-disable-line react-hooks/exhaustive-deps

  const allSubjects      = dynamicSubjects
  const hasAccess        = (s) => fullAccess || subscriptions.some(sub => subMatchesSubject(sub, s))
  const subscribed       = allSubjects.filter(s => s.available && hasAccess(s))
  const notSubscribed    = allSubjects.filter(s => s.available && !hasAccess(s))
  const priceLabel       = billing?.trialDays > 0 ? `${billing.trialDays}-day free trial` : `$${billing?.weekly ?? 5}/week`
  const comingSoon       = allSubjects.filter(s => !s.available)

  const firstName = profile.display_name?.split(' ')[0] ?? 'there'

  useEffect(() => {
    if (!selected && subscribed.length > 0) setSelected(subscribed[0])
  }, [subscribed.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const displaySubject = selected ?? subscribed[0] ?? null
  const displayColor   = displaySubject?.color ?? GOLD

  const renderTile = (subj, idx, locked) => {
    const isSel  = selected?.id === subj.id
    const color  = subj.color ?? GOLD
    return (
      <div
        key={subj.id}
        className="sp-tile"
        data-selected={isSel ? 'true' : 'false'}
        data-locked={locked ? 'true' : 'false'}
        style={{ '--sp-color': color, animationDelay: `${idx * 50}ms` }}
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
        {locked && <div className="sp-tile-price">{priceLabel}</div>}
        {isSel && <div className="sp-check">✓</div>}
      </div>
    )
  }

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

            {/* ── Nothing unlocked yet ── */}
            {subscribed.length === 0 && notSubscribed.length > 0 && (
              <div className="sp-fadein sp-intro">
                <div className="sp-intro-title">
                  {billing?.trialDays > 0 ? `Start with a ${billing.trialDays}-day free trial` : 'Unlock a subject to start'}
                </div>
                <div className="sp-intro-body">
                  Pick a subject below. It's ${billing?.weekly ?? 5} a week per subject{billing?.trialDays > 0 ? ' after your free trial' : ''}, and you can cancel any time.
                </div>
              </div>
            )}

            {/* ── Subject Tiles ── */}
            {subscribed.length > 0 && (
              <div style={{ marginBottom: 28 }}>
                <div className="sp-section-label">YOUR SUBJECTS</div>
                <div className="sp-grid">
                  {subscribed.map((subj, idx) => renderTile(subj, idx, false))}
                </div>
              </div>
            )}

            {notSubscribed.length > 0 && (
              <div style={{ marginBottom: 28 }}>
                <div className="sp-section-label">{subscribed.length > 0 ? 'ADD A SUBJECT' : 'CHOOSE A SUBJECT'}</div>
                <div className="sp-grid">
                  {notSubscribed.map((subj, idx) => renderTile(subj, idx + subscribed.length, true))}
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
