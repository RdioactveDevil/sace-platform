import { useState, useEffect } from 'react'
import { curriculumToSubjectTile, subjectAccess } from '../lib/subjects'
import { fetchSubjectBankCounts, getBillingConfig, updateProfile } from '../lib/db'
import { AU_STATES, compareSubjects, fitsStudent, subjectYear, stateLabel } from '../lib/subjectFilter'
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
 * student's state and year (lib/subjectFilter.js): never another state's, a
 * year below theirs, or more than 2 above. Subjects they already have always
 * show. `fullAccess` (tutors/admins) unlocks and lists them all. A calm
 * moving background (CalmBackground) sits behind the page.
 */
export default function SubjectPicker({ profile, subscriptions = [], fullAccess = false, onSelect, onGetAccess, onStartFree, onProfileUpdated, theme = 'dark', onToggleTheme }) {
  const t = THEMES[theme]
  const [liveQuestionCounts, setCounts] = useState(() => readCountsCache())
  const [dynamicSubjects, setDynamic]   = useState([])
  const [loadingCurricula, setLoading]  = useState(true)
  const [billing, setBilling]           = useState(null)
  const [stateSaving, setStateSaving]   = useState(false)
  const [stateError, setStateError]     = useState('')
  const [starting, setStarting]         = useState(null) // the subject being made their free one
  const [startError, setStartError]     = useState('')

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
    : billing?.introPrice > 0 ? `$${billing.introPrice} first week`
    : billing?.trialDays > 0 ? `${billing.trialDays} days free`
    : `$${billing?.nextPrice ?? tiers[0]}/${billing?.interval ?? 'week'}`

  const firstName = profile.display_name?.split(' ')[0] ?? 'there'

  const year = Number(profile.year_level) || null
  // Subjects for this student's state and year. Staff see everything.
  const fits = (s) => fullAccess || fitsStudent(s, { state: profile.state, year })
  const forYear = year ? allSubjects.filter(s => s.available && fits(s) && subjectYear(s) === year) : []

  // One subject gets the big card: the one they used last, else their own,
  // else the one for their year. Everything else is a list under it.
  const hasOwn = subscribed.length > 0
  const lastId = (() => { try { return JSON.parse(localStorage.getItem('gf-subject') || 'null')?.id } catch { return null } })()
  const pick = hasOwn
    ? subscribed.find(s => s.id === lastId) || subscribed[0]
    : forYear[0] || notSubscribed.filter(fits).sort(compareSubjects)[0]
  const ownOthers = subscribed.filter(s => s !== pick).sort(compareSubjects)
  const others = notSubscribed.filter(s => s !== pick).sort(compareSubjects)
  const more = others.filter(fits)
  const comingSoon = allSubjects.filter(s => !s.available && fits(s))

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
  const actionOf = (subj) => (starting === subj.id ? 'Starting…' : accessOf(subj) === 'none' ? (hasFreeSubject ? 'Unlock' : 'Start free') : hasOwn && !fullAccess ? 'Continue' : 'Start')
  // "Start free" starts the subject straight away as their free one: no
  // payment page in between. Only a subject past their free one goes there.
  const go = async (subj) => {
    if (starting) return
    if (accessOf(subj) !== 'none') return onSelect(subj)
    if (!hasFreeSubject && onStartFree) {
      setStarting(subj.id); setStartError('')
      try { await onStartFree(subj) } catch (e) {
        setStartError(e?.message && !/fetch/i.test(e.message) ? e.message : "We couldn't start that subject. Check your connection and try again.")
        setStarting(null)
      }
      return
    }
    const count = liveQuestionCounts?.[subj.id]
    onGetAccess?.({ ...subj, questionCount: count ?? subj.questionCount })
  }
  const pill = (status) => status && (
    <span className="sp-pill" data-free={status.startsWith('Free')}>{status}</span>
  )

  const SHOWN_TOPICS = 6
  const hero = pick && (
    <div className="sp-hero">
      <div className="sp-hero-main">
        {hasOwn && !fullAccess && pick.id === lastId && <span className="sp-kick">Pick up where you left off</span>}
        <h2>{pick.name}</h2>
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
    /* Continue: lifts and brightens on hover, presses in when tapped. */
    .sp-go { transition: transform 0.15s ease, box-shadow 0.15s ease, filter 0.15s ease; box-shadow: 0 6px 16px -10px rgba(224,169,31,0.9); }
    .sp-go:hover { transform: translateY(-1px); filter: brightness(1.05); box-shadow: 0 10px 22px -10px rgba(224,169,31,0.95); }
    .sp-go:active { transform: translateY(1px) scale(0.98); filter: brightness(0.97); box-shadow: 0 3px 8px -6px rgba(224,169,31,0.9); }
    @media (prefers-reduced-motion: reduce) { .sp-go { transition: none; } .sp-go:hover, .sp-go:active { transform: none; } }
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
            {allSubjects.length && (profile.state || year)
              ? `No subjects for ${[year ? `Year ${year}` : null, stateLabel(profile.state) || null].filter(Boolean).join(' in ')} yet. Check back soon.`
              : 'No subjects are open yet. Check back soon.'}
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
            {startError && <p role="alert" style={{ margin: 0, fontSize: 13, color: t.danger }}>{startError}</p>}

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

          </>
        )}
      </div>
    </AuthLayout>
  )
}
