import { useState, useMemo } from 'react'
import { bookConsultationAsProspect } from '../lib/db'
import { groupSlotsByDay, formatWhen, zoneCity } from '../lib/bookingFormat'
import { Field } from './AuthLayout'
import { C, FONT, P, OkLine, btnStyle } from './publicUi'

const DAYS_AT_FIRST = 5

/** The prospect's own zone; the tutor's when the browser won't say. */
const browserZone = (fallback) => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || fallback } catch { return fallback }
}

function Booked({ start, zone, joinUrl, questionnaireUrl, fresh, senderName }) {
  return (
    <>
      <OkLine>{fresh ? `Booked for ${formatWhen(start, zone)}` : `Your call is booked for ${formatWhen(start, zone)}`}</OkLine>
      <P>{fresh ? "We've emailed you the details." : `${senderName ? `${senderName} will` : 'You will'} meet you on a video call. The email we sent has the link too.`}</P>
      {questionnaireUrl && (
        <>
          <P muted>Before the call, please fill in this short questionnaire.</P>
          <a className="af-btn" href={questionnaireUrl} style={{ ...btnStyle('primary'), textDecoration: 'none', boxSizing: 'border-box' }}>Open the questionnaire</a>
        </>
      )}
      {joinUrl && <a className="af-btn" href={joinUrl} style={{ ...btnStyle('secondary'), textDecoration: 'none', boxSizing: 'border-box' }}>Your call page</a>}
    </>
  )
}

/**
 * Pick a time for the consultation call: days as rows, times as buttons, in the
 * prospect's own time zone. `data` is the slots response. Render inside a Panel.
 */
export default function BookingPicker({ token, data, theme = 'dark', name, heading = true }) {
  const zone = useMemo(() => browserZone(data.timeZone), [data.timeZone])
  const [slots, setSlots] = useState(data.slots || [])
  const [booking, setBooking] = useState(data.booking || null)
  const [questionnaireUrl, setQuestionnaireUrl] = useState(data.questionnaireUrl || null)
  const [fresh, setFresh] = useState(false)
  const [start, setStart] = useState(null)
  const [email, setEmail] = useState(data.email || '')
  const [parentEmail, setParentEmail] = useState(data.parentEmail || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [daysShown, setDaysShown] = useState(DAYS_AT_FIRST)

  const days = useMemo(() => groupSlotsByDay(slots, zone), [slots, zone])

  if (booking) {
    return <Booked start={booking.start} zone={zone} joinUrl={booking.joinUrl} questionnaireUrl={questionnaireUrl} fresh={fresh} senderName={data.senderName} />
  }

  const confirm = async () => {
    if (!start || busy) return
    if (!email.trim()) { setError('Enter your email address so we can send the details.'); return }
    setError('')
    setBusy(true)
    try {
      const res = await bookConsultationAsProspect(token, { start, email: email.trim(), parentEmail: parentEmail.trim() || undefined, name: name?.trim() || undefined, timeZone: zone })
      if (res.questionnaireUrl) setQuestionnaireUrl(res.questionnaireUrl)
      setFresh(true)
      setBooking({ start: res.start, joinUrl: res.joinUrl })
    } catch (err) {
      if (err.status === 409 && err.body?.booking) {
        setBooking(err.body.booking)
      } else if (err.status === 409 && Array.isArray(err.body?.slots)) {
        setSlots(err.body.slots)
        setStart(null)
        setError(err.body.slots.length ? 'That time was just taken — pick another.' : 'That time was just taken, and there are no other times open right now.')
      } else {
        setError(err.message || "That didn't send. Try again.")
      }
    } finally {
      setBusy(false)
    }
  }

  const visible = days.slice(0, daysShown)
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {heading && <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>Book a call{data.senderName ? ` with ${data.senderName}` : ''}</div>}
        <P muted>{data.callMinutes ? `${data.callMinutes} minutes, on video. ` : ''}Times are in {zoneCity(zone)} time.</P>
      </div>

      {days.length === 0 && <P muted>There are no times open right now. Check back soon.</P>}
      {visible.map(d => (
        <div key={d.day} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.sub }}>{d.day}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {d.times.map(t => {
              const on = start === t.iso
              return (
                <button key={t.iso} type="button" className="af-btn" aria-pressed={on} onClick={() => { setStart(t.iso); setError('') }}
                  style={{ ...btnStyle(on ? 'primary' : 'secondary', false), minHeight: 38, padding: '0 14px', fontSize: 13.5 }}>
                  {t.label}
                </button>
              )
            })}
          </div>
        </div>
      ))}
      {days.length > daysShown && (
        <button type="button" className="af-btn" onClick={() => setDaysShown(n => n + DAYS_AT_FIRST)} style={btnStyle('secondary')}>Show more days</button>
      )}

      {days.length > 0 && (
        <>
          <Field id="bk-email" label="Your email" theme={theme}>
            <input id="bk-email" className="af-inp" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} />
          </Field>
          <Field id="bk-parent" label="Parent's email" optional theme={theme} hint="They get the details too.">
            <input id="bk-parent" className="af-inp" type="email" value={parentEmail} onChange={e => setParentEmail(e.target.value)} />
          </Field>
          {error && <div role="alert" style={{ fontSize: 13.5, color: 'var(--t-danger)', lineHeight: 1.45 }}>{error}</div>}
          <button type="button" className="af-btn" onClick={confirm} disabled={!start || busy}
            style={{ ...btnStyle('primary'), opacity: !start || busy ? 0.55 : 1, cursor: !start || busy ? 'default' : 'pointer' }}>
            {busy ? 'Booking…' : start ? `Confirm ${formatWhen(start, zone)}` : 'Choose a time'}
          </button>
        </>
      )}
      {days.length === 0 && error && <div role="alert" style={{ fontSize: 13.5, color: 'var(--t-danger)' }}>{error}</div>}
    </>
  )
}
