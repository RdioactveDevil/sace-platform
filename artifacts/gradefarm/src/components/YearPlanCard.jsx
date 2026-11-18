import { useEffect, useMemo, useState } from 'react'
import { CalendarCheck, Pencil } from 'lucide-react'
import { THEMES } from '../lib/theme'
import { courseOrder, weekPlan, accuracyBySubtopic, checkInDue, nextSubtopic } from '../lib/yearPlan'
import { curriculumIdOf, loadCourse, loadYearSetup, saveYearSetup } from '../lib/yearSetup'

const FONT_B = "'Plus Jakarta Sans', sans-serif"
const DOT = { keep: 'var(--t-success)', test: 'var(--t-accent)', exam: 'var(--t-accent)', review: 'var(--t-blue)', fix: 'var(--t-danger)', refresh: 'var(--t-blue)' }
const fmtTime = (m) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`)
const laterKey = (cid) => `gf-yearsetup-later-${cid}`

/**
 * At the top of Practice. Before they've set up their year: "Set up your
 * year" (Not now hides it for a week). After: "This week", up to three rows
 * sharing their study hours (lib/yearPlan.js weekPlan), each starting a
 * practice session on its subtopics, and on a new week "Still on …?".
 */
export default function YearPlanCard({ theme, profile, subject, questions, struggleMap, onStartSession, onSetUp }) {
  const t = THEMES[theme]
  const curriculumId = curriculumIdOf(subject)
  const [course, setCourse] = useState(null)
  const [saved, setSaved] = useState(null) // { setup, tests }
  const [hidden, setHidden] = useState(() => {
    try { return Number(localStorage.getItem(laterKey(curriculumId)) || 0) > Date.now() } catch { return false }
  })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!curriculumId || !profile?.id) return
    let alive = true
    Promise.all([loadCourse(curriculumId), loadYearSetup(profile.id, curriculumId)])
      .then(([c, s]) => { if (alive) { setCourse(c); setSaved(s) } })
      .catch(() => {}) // the card just doesn't show; practice works as ever
    return () => { alive = false }
  }, [curriculumId, profile?.id])

  const flat = useMemo(() => courseOrder(course?.topics || []), [course])
  const setup = saved?.setup
  const plan = useMemo(() => (setup?.current_subtopic_id && flat.length
    ? weekPlan({
      flat, currentId: setup.current_subtopic_id, skipped: setup.skipped_subtopic_ids || [], tests: saved.tests,
      examDate: course?.examDate, examName: 'Your exam', accuracy: accuracyBySubtopic(questions, struggleMap),
      hours: Number(profile?.study_hours_per_week) || 3,
    })
    : null), [setup, flat, saved, course, questions, struggleMap, profile?.study_hours_per_week])

  if (!curriculumId || !course || !saved || !flat.length) return null

  const card = { background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 14, marginBottom: 14, fontFamily: FONT_B }

  if (!plan) {
    if (hidden) return null
    const later = () => {
      try { localStorage.setItem(laterKey(curriculumId), String(Date.now() + 7 * 86400000)) } catch {}
      setHidden(true)
    }
    return (
      <section aria-label="Set up your year" style={{ ...card, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', background: 'color-mix(in srgb, var(--t-accent) 7%, var(--t-bgCard))' }}>
        <span aria-hidden="true" style={{ width: 40, height: 40, borderRadius: 12, background: t.bgCard, border: `1px solid ${t.border}`, display: 'grid', placeItems: 'center', color: t.goldText, flexShrink: 0 }}><CalendarCheck size={20} /></span>
        <div style={{ flex: '1 1 260px', minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: t.text }}>Set up your year</div>
          <div style={{ fontSize: 13, color: t.textMuted, marginTop: 2 }}>Tell us where your class is up to and when your tests are, and we&rsquo;ll plan each week around them. About 2 minutes.</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button type="button" onClick={onSetUp} style={{ minHeight: 40, padding: '0 16px', borderRadius: 10, border: 'none', background: 'var(--t-accent)', color: 'var(--t-onAccent)', fontFamily: FONT_B, fontSize: 13.5, fontWeight: 800, cursor: 'pointer' }}>Set up</button>
          <button type="button" onClick={later} style={{ minHeight: 40, padding: '0 10px', border: 'none', background: 'none', color: t.textMuted, fontFamily: FONT_B, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Not now</button>
        </div>
      </section>
    )
  }

  const current = flat.find(s => s.id === setup.current_subtopic_id)
  const following = nextSubtopic(flat, setup.current_subtopic_id)
  const checkIn = async (moved) => {
    setBusy(true)
    try {
      const row = await saveYearSetup(profile.id, curriculumId, {
        ...(moved && following ? { current_subtopic_id: following.id } : {}),
        checked_in_at: new Date().toISOString(),
      })
      setSaved(s => ({ ...s, setup: row }))
    } catch {} finally { setBusy(false) }
  }
  const hours = plan.rows.reduce((s, r) => s + r.minutes, 0) / 60

  return (
    <section aria-label="This week" style={{ ...card, padding: '4px 0' }}>
      {checkInDue(setup) && current && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '12px 18px', margin: '4px 6px 2px', borderRadius: 10, background: 'color-mix(in srgb, var(--t-accent) 10%, transparent)' }}>
          <span style={{ flex: '1 1 220px', fontSize: 13.5, color: t.text }}><b>New week:</b> still on {current.name}?</span>
          <button type="button" disabled={busy} onClick={() => checkIn(false)} style={{ minHeight: 34, padding: '0 12px', borderRadius: 9, border: `1px solid ${t.border}`, background: t.bgCard, color: t.text, fontFamily: FONT_B, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Yes</button>
          {following && <button type="button" disabled={busy} onClick={() => checkIn(true)} style={{ minHeight: 34, padding: '0 12px', borderRadius: 9, border: `1px solid ${t.border}`, background: t.bgCard, color: t.text, fontFamily: FONT_B, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Moved on to {following.name}</button>}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, padding: '12px 18px 6px' }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: t.text }}>This week · {hours % 1 ? hours.toFixed(1) : hours} hour{hours === 1 ? '' : 's'}</h2>
        <button type="button" onClick={onSetUp} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: 'none', background: 'none', color: t.textMuted, fontFamily: FONT_B, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', minHeight: 32 }}>
          <Pencil size={13} aria-hidden="true" />Edit
        </button>
      </div>
      {plan.rows.map(r => (
        <div key={r.kind} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 18px', borderTop: `1px solid ${t.border}`, flexWrap: 'wrap' }}>
          <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: '50%', background: DOT[r.kind], flexShrink: 0 }} />
          <div style={{ flex: '1 1 220px', minWidth: 0 }}>
            <div style={{ fontSize: 11.5, fontWeight: 800, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{r.label}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: t.text, marginTop: 1 }}>{r.subtopics.length > 3 ? `${r.subtopics.slice(0, 3).join(', ')} +${r.subtopics.length - 3} more` : r.subtopics.join(', ')}</div>
            <div style={{ fontSize: 12.5, color: t.textMuted, marginTop: 1 }}>About {fmtTime(r.minutes)} · {r.questions} questions{r.kind === 'fix' && r.accuracy != null ? ` · ${Math.round(r.accuracy * 100)}% so far` : ''}</div>
          </div>
          <button type="button" onClick={() => onStartSession({ mode: 'new', subtopics: r.subtopics })}
            style={{ minHeight: 36, padding: '0 14px', borderRadius: 9, border: r.kind === 'keep' ? 'none' : `1px solid ${t.border}`, background: r.kind === 'keep' ? 'var(--t-accent)' : t.bgCard, color: r.kind === 'keep' ? 'var(--t-onAccent)' : t.text, fontFamily: FONT_B, fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
            Practise
          </button>
        </div>
      ))}
    </section>
  )
}
