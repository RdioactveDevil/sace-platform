import { useState, useEffect } from 'react'
import { curriculumToSubjectTile, subjectAccess } from '../lib/subjects'
import { fetchSubjectBankCounts, getBillingConfig, updateProfile } from '../lib/db'
import { AU_STATES, fitsStudent, subjectYear } from '../lib/subjectFilter'
import { studentTiers } from '../lib/pricing'
import { fetchLiveCurricula } from '../lib/curriculaDb'
import { SubjectIconByName } from './SubjectIcons'
import { THEMES } from '../lib/theme'
import { AuthLayout, authBtn, choiceChip } from './AuthLayout'
import CalmBackground from './CalmBackground'
import { groupSubject } from '../lib/homeSubjects'

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
 * Choosing a subject. One subject gets a big card: the one they used last,
 * else their own, else the one for their year level. Every other subject is
 * a list under it. Subjects they haven't got are only listed if they fit the
 * student's state and year (lib/subjectFilter.js); "Show all subjects" lists
 * the rest. `fullAccess` (tutors/admins) unlocks and lists them all. A calm
 * moving background (CalmBackground) sits behind the page.
 */
export default function SubjectPicker({ profile, subscriptions = [], fullAccess = false, onSelect, onGetAccess, onProfileUpdated, theme = 'dark', onToggleTheme }) {
  const t = THEMES[theme]
  const [liveQuestionCounts, setCounts] = useState(() => readCountsCache())
  const [dynamicSubjects, setDynamic]   = useState([])
  const [loadingCurricula, setLoading]  = useState(true)
  const [billing, setBilling]           = useState(null)
  const [showAll, setShowAll]           = useState(false)
  const [stateSaving, setStateSaving]   = useState(false)
  const [stateError, setStateError]     = useState('')

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
  const accessOf         = (s) => subjectAccess(subscriptions, s, fullAccess)
  const subscribed       = allSubjects.filter(s => s.available && accessOf(s) !== 'none')
  const notSubscribed    = allSubjects.filter(s => s.available && accessOf(s) === 'none')
  const hasFreeSubject   = subscriptions.some(sub => sub.source === 'free')
  const freeDaily        = billing?.freeDailyQuestions ?? 20
  const tiers            = studentTiers(billing?.tiers)
  const priceLabel       = !hasFreeSubject ? 'Try free'
    : billing?.trialDays > 0 ? `${billing.trialDays} days free`
    : `$${billing?.nextPrice ?? tiers[0]}/${billing?.interval ?? 'week'}`

  const firstName = profile.display_name?.split(' ')[0] ?? 'there'

  const year = Number(profile.year_level) || null
  // Subjects for this student's state and year. Staff see everything.
  const fits = (s) => fullAccess || fitsStudent(s, { state: profile.state, year })
  const forYear = year ? allSubjects.filter(s => s.available && fits(s) && subjectYear(s) === year) : []
  // Lower years first, so a list reads like a school.
  const byYear = (a, b) => (subjectYear(a) ?? 99) - (subjectYear(b) ?? 99) || a.name.localeCompare(b.name)

  // One subject gets the big card: the one they used last, else their own,
  // else the one for their year. Everything else is a list under it.
  const hasOwn = subscribed.length > 0
  const lastId = (() => { try { return JSON.parse(localStorage.getItem('gf-subject') || 'null')?.id } catch { return null } })()
  const pick = hasOwn
    ? subscribed.find(s => s.id === lastId) || subscribed[0]
    : forYear[0] || notSubscribed.filter(fits).sort(byYear)[0] || [...notSubscribed].sort(byYear)[0]
  const ownOthers = subscribed.filter(s => s !== pick).sort(byYear)
  const others = notSubscribed.filter(s => s !== pick).sort(byYear)
  const more = showAll ? others : others.filter(fits)
  const allComingSoon = allSubjects.filter(s => !s.available)
  const comingSoon = showAll ? allComingSoon : allComingSoon.filter(fits)
  const hiddenCount = others.length - others.filter(fits).length + allComingSoon.length - allComingSoon.filter(fits).length

  // Accounts from before onboarding asked for a state: ask here, once.
  const askState = !fullAccess && !profile.state
  const saveState = async (code) => {
    setStateSaving(true)
    setStateError('')
    try {
      await updateProfile(profile.id, { state: code })
      onProfileUpdated?.({ state: code })
    } catch {
      setStateError("Couldn't save. Check your connection and try again.")
    }
    setStateSaving(false)
  }
  const shortName = pick ? groupSubject({ name: pick.name, level: pick.stage }).name || pick.name : ''

  const heading = fullAccess ? 'Pick a subject'
    : hasOwn ? `Welcome back, ${firstName}.`
    : `Start with ${shortName}.`

  // A price once their free subject is used; before that, the button says "Start free".
  const statusOf = (subj) => {
    const access = accessOf(subj)
    if (access === 'none') return hasFreeSubject ? priceLabel : null
    return !fullAccess && access === 'free' ? `Free · ${freeDaily} a day` : null
  }
  const actionOf = (subj) => (accessOf(subj) === 'none' ? (hasFreeSubject ? 'Unlock' : 'Start free') : hasOwn && !fullAccess ? 'Continue' : 'Start')
  const go = (subj) => {
    const count = liveQuestionCounts?.[subj.id]
    return accessOf(subj) === 'none' ? onGetAccess?.({ ...subj, questionCount: count ?? subj.questionCount }) : onSelect(subj)
  }
  const pill = (status) => status && (
    <span className="sp-pill" data-free={status.startsWith('Free')}>{status}</span>
  )

  const SHOWN_TOPICS = 6
  const hero = pick && (
    <div className="sp-hero">
      <div className="sp-hero-main">
        {hasOwn && !fullAccess && <span className="sp-kick">{pick.id === lastId ? 'Pick up where you left off' : 'Your subject'}</span>}
        <h2>{pick.name}</h2>
        {pill(statusOf(pick))}
      </div>
      <button type="button" className="af-btn sp-go" onClick={() => go(pick)} aria-label={`${actionOf(pick)} ${pick.name}`}
        style={{ ...authBtn(t, 'primary'), minHeight: 48, fontSize: 15.5, padding: '0 26px', borderRadius: 12 }}>
        {actionOf(pick)}
      </button>
      {pick.topics?.length > 0 && (
        <div className="sp-topics">
          {pick.topics.slice(0, SHOWN_TOPICS).map(name => <span key={name}>{name}</span>)}
          {pick.topics.length > SHOWN_TOPICS && <span>+{pick.topics.length - SHOWN_TOPICS} more</span>}
        </div>
      )}
    </div>
  )

  const rows = (list) => (
    <div className="sp-rows">
      {list.map(subj => {
        const topics = subj.topics?.length || 0
        const meta = [subj.stage, topics ? `${topics} topic${topics === 1 ? '' : 's'}` : null].filter(Boolean).join(' · ')
        return (
          <div key={subj.id} className="sp-row">
            <span aria-hidden="true" className="sp-ic"><SubjectIconByName name={subj.name} color={t.textMuted} size={20} /></span>
            <span className="sp-row-w"><b>{subj.name}</b>{meta && <span>{meta}</span>}</span>
            {pill(statusOf(subj))}
            <button type="button" className="af-btn" onClick={() => go(subj)} aria-label={`${actionOf(subj)} ${subj.name}`}
              style={{ ...authBtn(t, 'secondary'), minHeight: 34, fontSize: 13, padding: '0 14px' }}>
              {actionOf(subj)}
            </button>
          </div>
        )
      })}
    </div>
  )

  const css = `
    .sp-card { background: ${t.bgCard}; border: 1px solid ${t.border}; border-radius: 14px; }
    .sp-hero { padding: 22px; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 16px 24px; align-items: center; }
    .sp-hero-main { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; min-width: 0; }
    .sp-kick { font-size: 12.5px; font-weight: 700; color: ${t.textMuted}; }
    .sp-hero h2 { margin: 0; font-size: clamp(20px, 3.4vw, 24px); font-weight: 800; letter-spacing: -0.02em; line-height: 1.25; color: ${t.text}; text-wrap: balance; }
    .sp-topics { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 6px; }
    .sp-topics span { font-size: 12.5px; font-weight: 600; padding: 4px 10px; border-radius: 8px; background: ${t.bgSubtle}; color: ${t.textSub}; }
    .sp-pill { font-size: 12px; font-weight: 700; padding: 3px 9px; border-radius: 999px; background: ${t.bgSubtle}; color: ${t.textSub}; white-space: nowrap; }
    .sp-pill[data-free="true"] { background: ${t.successBg}; color: ${t.success}; }
    .sp-rows { overflow: hidden; }
    .sp-row { display: flex; align-items: center; gap: 12px; padding: 13px 16px; border-bottom: 1px solid ${t.border}; min-width: 0; }
    .sp-row:last-child { border-bottom: none; }
    .sp-ic { width: 36px; height: 36px; border-radius: 9px; background: ${t.bgSubtle}; display: grid; place-items: center; flex-shrink: 0; }
    .sp-row-w { min-width: 0; flex: 1; display: flex; flex-direction: column; }
    .sp-row-w b { font-size: 14.5px; color: ${t.text}; line-height: 1.35; }
    .sp-row-w span { font-size: 12.5px; color: ${t.textMuted}; }
    .sp-state { padding: 16px 18px; display: flex; flex-direction: column; gap: 12px; }
    .sp-h3 { margin: 8px 0 0; font-size: 16px; font-weight: 800; color: ${t.text}; }
    @media (max-width: 600px) {
      .sp-hero { grid-template-columns: 1fr; }
      .sp-go { width: 100%; }
      .sp-row { flex-wrap: wrap; }
      .sp-row .sp-pill { order: 3; }
    }
  `

  return (
    <AuthLayout theme={theme} onToggleTheme={onToggleTheme} align="top" backdrop={<CalmBackground theme={theme} />}>
      <style>{css}</style>
      <div className="af-in" style={{ width: '100%', maxWidth: 860, display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 'clamp(8px, 5vh, 48px)' }}>
        {loadingCurricula ? (
          <p style={{ margin: 0, fontSize: 14, color: t.textMuted }} role="status">Loading subjects…</p>
        ) : !allSubjects.length || !pick ? (
          <div className="sp-card" style={{ padding: '28px 20px', textAlign: 'center', fontSize: 14, color: t.textMuted }}>
            No subjects are open yet. Check back soon.
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {!hasOwn && !fullAccess && <span style={{ fontSize: 13, fontWeight: 600, color: t.textFaint }}>Hi {firstName}.</span>}
              <h1 style={{ margin: 0, fontSize: 'clamp(24px, 5vw, 30px)', fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 1.2, color: t.text }}>{heading}</h1>
            </div>

            {askState && (
              <div className="sp-card sp-state" role="group" aria-labelledby="sp-state-h">
                <div>
                  <h3 id="sp-state-h" className="sp-h3" style={{ margin: 0 }}>Which state do you study in?</h3>
                  <p style={{ margin: '4px 0 0', fontSize: 13, color: t.textMuted }}>We'll only list subjects for your state, like VCE in Victoria or SACE in South Australia.</p>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {AU_STATES.map(([code, label]) => (
                    <button key={code} type="button" className="af-chip" disabled={stateSaving} onClick={() => saveState(code)}
                      style={{ ...choiceChip(t, false), cursor: stateSaving ? 'wait' : 'pointer' }}>
                      {label}
                    </button>
                  ))}
                </div>
                {stateError && <p role="alert" style={{ margin: 0, fontSize: 13, color: t.danger }}>{stateError}</p>}
              </div>
            )}

            <div className="sp-card">{hero}</div>

            {ownOthers.length > 0 && (
              <>
                <h3 className="sp-h3">{ownOthers.length === 1 ? 'Your other subject' : 'Your other subjects'}</h3>
                <div className="sp-card">{rows(ownOthers)}</div>
              </>
            )}
            {more.length > 0 && (
              <>
                <h3 className="sp-h3">{hasOwn ? 'Add a subject' : 'Or another subject'}</h3>
                <div className="sp-card">{rows(more)}</div>
              </>
            )}

            {comingSoon.length > 0 && (
              <p style={{ margin: 0, fontSize: 13, color: t.textMuted }}>
                On the way: {comingSoon.map(s => `${s.name}${s.stage ? ` (${s.stage})` : ''}`).join(', ')}.
              </p>
            )}

            {(hiddenCount > 0 || showAll) && (
              <div>
                <button type="button" className="af-btn" onClick={() => setShowAll(v => !v)} aria-expanded={showAll}
                  style={{ ...authBtn(t, 'secondary'), minHeight: 36, fontSize: 13, padding: '0 14px' }}>
                  {showAll ? 'Show only subjects for me' : `Show all subjects (${hiddenCount} more)`}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </AuthLayout>
  )
}
