import { useState, useEffect } from 'react'
import { curriculumToSubjectTile, subjectAccess, yearFromStage } from '../lib/subjects'
import { fetchSubjectBankCounts, getBillingConfig } from '../lib/db'
import { studentTiers } from '../lib/pricing'
import { fetchLiveCurricula } from '../lib/curriculaDb'
import { SubjectIconByName } from './SubjectIcons'
import { THEMES } from '../lib/theme'
import { AuthLayout, authBtn, linkStyle } from './AuthLayout'

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
 * Choosing a subject. A new student sees the subjects for their year level
 * first; someone with subjects sees theirs. Every subject is a click away
 * under "See every subject". `fullAccess` (tutors/admins) unlocks them all.
 */
export default function SubjectPicker({ profile, subscriptions = [], fullAccess = false, onSelect, onGetAccess, theme = 'dark', onToggleTheme }) {
  const t = THEMES[theme]
  const [showAll, setShowAll]           = useState(false)
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
  const accessOf         = (s) => subjectAccess(subscriptions, s, fullAccess)
  const subscribed       = allSubjects.filter(s => s.available && accessOf(s) !== 'none')
  const notSubscribed    = allSubjects.filter(s => s.available && accessOf(s) === 'none')
  const hasFreeSubject   = subscriptions.some(sub => sub.source === 'free')
  const freeDaily        = billing?.freeDailyQuestions ?? 20
  const tiers            = studentTiers(billing?.tiers)
  const priceLabel       = !hasFreeSubject ? 'Try free'
    : billing?.trialDays > 0 ? `${billing.trialDays} days free`
    : `$${billing?.nextPrice ?? tiers[0]}/${billing?.interval ?? 'week'}`
  const comingSoon       = allSubjects.filter(s => !s.available)

  const firstName = profile.display_name?.split(' ')[0] ?? 'there'

  const year = Number(profile.year_level) || null
  const forYear = year ? allSubjects.filter(s => s.available && yearFromStage(s.stage) === year) : []
  // Lower years first, so a list reads like a school.
  const byYear = (a, b) => (yearFromStage(a.stage) ?? 99) - (yearFromStage(b.stage) ?? 99) || a.name.localeCompare(b.name)

  const hasOwn = subscribed.length > 0
  const primary = hasOwn ? subscribed : forYear.length ? forYear : [...notSubscribed].sort(byYear)
  const rest = [...(hasOwn ? notSubscribed : notSubscribed.filter(s => !primary.includes(s)))].sort(byYear)
  const heading = hasOwn
    ? (subscribed.length === 1 ? 'Your subject' : 'Your subjects')
    : forYear.length
      ? `${forYear.length === 1 ? 'A subject' : `${forYear.length === 2 ? 'Two' : forYear.length === 3 ? 'Three' : forYear.length} subjects`} for Year ${year}`
      : 'Pick your first subject'
  const sub = hasOwn
    ? null
    : !hasFreeSubject
      ? `Pick one to use free, with ${freeDaily} questions a day. Unlimited questions from $${tiers[0]} a week.`
      : null

  const tile = (subj) => {
    const access = accessOf(subj)
    const locked = access === 'none'
    const count = liveQuestionCounts?.[subj.id]
    const topics = subj.topics?.length || 0
    const meta = [subj.stage, topics ? `${topics} topic${topics === 1 ? '' : 's'}` : null, count > 0 ? `${count.toLocaleString()} questions` : null].filter(Boolean).join(' · ')
    // A price once their free subject is used; before that, the button says "Start free".
    const status = locked
      ? (hasFreeSubject ? priceLabel : null)
      : (!fullAccess && access === 'free' ? `Free · ${freeDaily} a day` : null)
    const action = locked ? (hasFreeSubject ? 'Unlock' : 'Start free') : 'Start'
    const go = () => (locked ? onGetAccess?.({ ...subj, questionCount: count ?? subj.questionCount }) : onSelect(subj))
    return (
      <div key={subj.id} style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <span aria-hidden="true" style={{ width: 36, height: 36, borderRadius: 9, background: t.bgSubtle, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <SubjectIconByName name={subj.name} color={t.textMuted} size={20} />
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: t.text, lineHeight: 1.3 }}>{subj.name}</div>
            <div style={{ fontSize: 12.5, color: t.textMuted, marginTop: 2 }}>{meta}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 'auto' }}>
          {status && (
            <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: status.startsWith('Free') ? t.successBg : t.bgSubtle, color: status.startsWith('Free') ? t.success : t.textSub }}>{status}</span>
          )}
          <button type="button" className="af-btn" onClick={go} aria-label={`${action} ${subj.name}`}
            style={{ ...authBtn(t, primary[0] === subj ? 'primary' : 'secondary'), minHeight: 34, fontSize: 13, padding: '0 14px', marginLeft: 'auto' }}>
            {action}
          </button>
        </div>
      </div>
    )
  }
  const grid = (list) => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 260px), 1fr))', gap: 12 }}>{list.map(tile)}</div>
  )

  return (
    <AuthLayout theme={theme} onToggleTheme={onToggleTheme} align="top">
      <div className="af-in" style={{ width: '100%', maxWidth: 860, display: 'flex', flexDirection: 'column', gap: 18, paddingTop: 'clamp(8px, 5vh, 48px)' }}>
        {loadingCurricula ? (
          <p style={{ margin: 0, fontSize: 14, color: t.textMuted }} role="status">Loading subjects…</p>
        ) : !allSubjects.length ? (
          <div style={{ padding: '28px 20px', textAlign: 'center', fontSize: 14, color: t.textMuted, background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 12 }}>
            No subjects are open yet. Check back soon.
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {!hasOwn && <span style={{ fontSize: 13, fontWeight: 600, color: t.textFaint }}>Hi {firstName}.</span>}
              <h1 style={{ margin: 0, fontSize: 'clamp(24px, 5vw, 30px)', fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 1.2, color: t.text }}>{heading}</h1>
              {sub && <p style={{ margin: 0, fontSize: 14.5, color: t.textMuted, lineHeight: 1.6, maxWidth: '60ch' }}>{sub}</p>}
            </div>

            {primary.length > 0 && grid(primary)}

            {rest.length > 0 && (
              showAll ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 10 }}>
                  <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: t.text }}>{hasOwn ? 'Add a subject' : 'Every other subject'}</h2>
                  {grid(rest)}
                </div>
              ) : (
                <div style={{ fontSize: 14 }}>
                  <button type="button" className="af-link" onClick={() => setShowAll(true)} style={linkStyle(t)}>
                    {hasOwn ? 'Add a subject' : 'See every subject'}
                  </button>
                  <span style={{ color: t.textMuted }}> ({rest.length} more)</span>
                </div>
              )
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
