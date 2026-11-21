import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Calendar } from 'lucide-react'
import { THEMES } from '../lib/theme'
import SegmentedToggle from './SegmentedToggle'
import InfinityLoader from './InfinityLoader'
import ReminderEditor from './ReminderEditor'
import { fetchConsultationSlots, bookConsultation, updateConsultation } from '../lib/db'
import { groupSlotsByDay, formatWhen, zonedToIso, ZONES } from '../lib/bookingFormat'

const FONT_B = "'Plus Jakarta Sans', sans-serif"
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Book a consultation call for a prospect, or move one. Offered times come
 * from the tutor's hours and calendar; "Pick any time" takes any future time
 * (the server still refuses one that overlaps another session).
 *
 *   mode 'book'        diagnostic { id, prospect_email, parent_email, name }
 *   mode 'reschedule'  session { id, diagnostic_id, scheduled_at, guest_name, guest_email }
 *   onDone()           called after the change is saved; the caller reloads
 *   onOpenSettings()   shown when no weekly hours are set yet (book mode)
 */
export default function ConsultationModal({ mode, diagnostic, session, theme, onClose, onDone, onOpenSettings }) {
  const t = THEMES[theme]
  const dark = theme === 'dark'
  const booking = mode === 'book'
  const diagnosticId = booking ? diagnostic.id : session.diagnostic_id

  const [loading, setLoading] = useState(!!diagnosticId)
  const [slots, setSlots] = useState([])
  const [zone, setZone] = useState(ZONES[0].value)
  const [callMinutes, setCallMinutes] = useState(null)
  const [noHours, setNoHours] = useState(false)
  const [loadError, setLoadError] = useState('')

  const [how, setHow] = useState('offered')            // offered | any
  const [chosen, setChosen] = useState('')             // ISO of a chosen offered time
  const [date, setDate] = useState('')
  const [time, setTime] = useState('16:00')
  const [email, setEmail] = useState(booking ? diagnostic.prospect_email || '' : '')
  const [parentEmail, setParentEmail] = useState(booking ? diagnostic.parent_email || '' : '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!diagnosticId) { setHow('any'); return undefined }
    let cancelled = false
    fetchConsultationSlots(diagnosticId)
      .then(r => {
        if (cancelled) return
        setSlots(r.slots || [])
        setZone(r.timeZone || ZONES[0].value)
        setCallMinutes(r.callMinutes ?? null)
        setNoHours(!!r.noHours)
        if (!(r.slots || []).length) setHow('any')
      })
      .catch(e => { if (!cancelled) { setLoadError(e.message || "Couldn't load your open times."); setHow('any') } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [diagnosticId])

  const days = useMemo(() => groupSlotsByDay(slots, zone), [slots, zone])
  const zoneLabel = ZONES.find(z => z.value === zone)?.label || zone
  const anyIso = zonedToIso(date, time, zone)
  const startIso = how === 'offered' ? chosen : anyIso
  const current = !booking ? session.scheduled_at : null

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!startIso) { setError(how === 'offered' ? 'Choose a time for the call.' : 'Choose a date and time.'); return }
    if (new Date(startIso) <= new Date()) { setError('Choose a time in the future.'); return }
    if (booking) {
      if (!EMAIL_RE.test(email.trim())) { setError("Enter the prospect's email address."); return }
      if (parentEmail.trim() && !EMAIL_RE.test(parentEmail.trim())) { setError('Enter a valid email address for the parent, or leave it blank.'); return }
    }
    setSaving(true)
    try {
      if (booking) {
        await bookConsultation({ diagnosticId, start: startIso, email: email.trim(), parentEmail: parentEmail.trim() || null })
      } else {
        await updateConsultation(session.id, { start: startIso })
      }
      await onDone()
      onClose()
    } catch (err) {
      setError(err.message || 'That didn\'t work. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const inputStyle = {
    width: '100%', padding: '10px 12px', borderRadius: 8,
    border: dark ? '1px solid var(--t-border)' : `1px solid ${t.border}`,
    background: dark ? 'var(--t-bgSubtle)' : t.bgCard,
    color: t.text, fontFamily: FONT_B, fontSize: 14, boxSizing: 'border-box', outline: 'none',
  }
  const labelStyle = { display: 'block', fontSize: 11, fontWeight: 700, color: t.textMuted, marginBottom: 6, fontFamily: FONT_B }
  const who = booking ? (diagnostic.name || diagnostic.prospect_email || 'this prospect') : (session.guest_name || session.guest_email || 'this prospect')

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16, overflowY: 'auto' }}>
      <div role="dialog" aria-label={booking ? 'Book call' : 'Reschedule call'} style={{ background: t.bgCard, border: dark ? '1px solid var(--t-border)' : `1px solid ${t.border}`, borderRadius: 12, padding: 32, width: '100%', maxWidth: 520, fontFamily: FONT_B, margin: 'auto', backdropFilter: 'blur(16px)' }}>
        <h2 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 800, letterSpacing: '-0.01em', color: t.text, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Calendar size={17} aria-hidden="true" />{booking ? 'Book call' : 'Reschedule call'}
        </h2>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: t.textMuted }}>
          {booking ? `A consultation call with ${who}.` : `Move the call with ${who}.`}
          {current && <> Now {formatWhen(current, zone)}.</>}
        </p>

        {loading ? (
          <div style={{ color: t.textMuted, textAlign: 'center', padding: '24px 0', fontSize: 14 }}>
            <InfinityLoader size={40} label={null} style={{ margin: '0 auto 10px' }} />
            Loading your open times…
          </div>
        ) : (
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {booking && noHours && (
              <div style={{ fontSize: 13, color: t.text, padding: '10px 14px', borderRadius: 8, background: 'var(--t-bgSubtle)', border: '1px solid var(--t-border)' }}>
                Set your consultation hours in Lessons first, so open times can be offered.{' '}
                {onOpenSettings && (
                  <button type="button" onClick={onOpenSettings} style={{ border: 'none', background: 'transparent', padding: 0, color: t.goldText, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: FONT_B, textDecoration: 'underline' }}>
                    Open consultation settings
                  </button>
                )}
              </div>
            )}
            {loadError && <p role="alert" style={{ color: t.danger, fontSize: 13, margin: 0 }}>{loadError}</p>}

            {booking && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
                <div>
                  <label style={labelStyle}>Prospect's email</label>
                  <input className="td-input-gold" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="e.g. sarah@example.com" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Parent's email <span style={{ fontWeight: 400, color: t.textFaint }}>(optional)</span></label>
                  <input className="td-input-gold" type="email" value={parentEmail} onChange={e => setParentEmail(e.target.value)} placeholder="e.g. parent@example.com" style={inputStyle} />
                </div>
              </div>
            )}

            {slots.length > 0 && (
              <SegmentedToggle size="sm" label="How to choose the time" value={how} onChange={setHow} options={[
                { value: 'offered', label: 'Open times' },
                { value: 'any', label: 'Pick any time' },
              ]} />
            )}

            {how === 'offered' ? (
              <div>
                <label style={labelStyle}>Times shown in {zoneLabel} time{callMinutes ? ` · ${callMinutes} minute call` : ''}</label>
                <div style={{ maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14, paddingRight: 4 }}>
                  {days.map(g => (
                    <div key={g.day}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: t.text, marginBottom: 6 }}>{g.day}</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {g.times.map(({ iso, label }) => {
                          const sel = chosen === iso
                          return (
                            <button
                              key={iso} type="button" aria-pressed={sel} onClick={() => setChosen(iso)}
                              style={{ padding: '6px 13px', borderRadius: 12, border: `1px solid ${sel ? 'var(--t-text)' : t.border}`, background: sel ? 'var(--t-bgSubtle)' : 'transparent', color: sel ? t.text : t.textMuted, fontSize: 12, fontWeight: sel ? 700 : 500, cursor: 'pointer', fontFamily: FONT_B, transition: 'all 0.15s' }}
                            >{label}</button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                {slots.length === 0 && !loadError && !noHours && (
                  <p style={{ margin: '0 0 10px', fontSize: 13, color: t.textMuted }}>No open times in the next few weeks. Pick a time yourself.</p>
                )}
                <label style={labelStyle}>Date and time in {zoneLabel} time</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <input className="td-input-gold" type="date" aria-label="Date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
                  <input className="td-input-gold" type="time" aria-label="Time" value={time} onChange={e => setTime(e.target.value)} style={inputStyle} />
                </div>
                <div style={{ fontSize: 11, color: t.textFaint, marginTop: 6 }}>
                  Any future time that doesn't overlap another of your sessions.
                  {anyIso && <> Call set for {formatWhen(anyIso, zone)}.</>}
                </div>
              </div>
            )}

            {booking && <div style={{ fontSize: 12, color: t.textMuted }}>Reminders follow your defaults. You can change them for this call afterwards in Lessons.</div>}

            {error && <p role="alert" style={{ color: t.danger, fontSize: 13, margin: 0 }}>{error}</p>}

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
              <button type="button" onClick={onClose} style={{ padding: '10px 20px', borderRadius: 9, border: dark ? '1px solid var(--t-border)' : `1px solid ${t.border}`, background: dark ? 'var(--t-bgSubtle)' : 'transparent', color: t.textMuted, fontFamily: FONT_B, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Cancel
              </button>
              <button type="submit" disabled={saving} className={saving ? '' : 'btn-gold-shimmer'} style={{ padding: '10px 22px', borderRadius: 9, border: 'none', background: saving ? (dark ? 'var(--t-bgSubtle)' : t.border) : 'var(--t-accent)', color: saving ? t.textMuted : 'var(--t-onAccent)', fontFamily: FONT_B, fontSize: 13, fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Saving…' : booking ? 'Book call' : 'Reschedule'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body,
  )
}

/** Edit the reminders on one booked call. */
export function RemindersModal({ session, theme, onClose, onDone }) {
  const t = THEMES[theme]
  const dark = theme === 'dark'
  const [value, setValue] = useState(() => [...(session.reminder_minutes || [])].sort((a, b) => b - a))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const save = async () => {
    setError('')
    if (!value.length) { setError('Keep at least one reminder.'); return }
    setSaving(true)
    try {
      await updateConsultation(session.id, { reminderMinutes: value })
      await onDone()
      onClose()
    } catch (err) {
      setError(err.message || 'That didn\'t work. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16, overflowY: 'auto' }}>
      <div role="dialog" aria-label="Reminders" style={{ background: t.bgCard, border: dark ? '1px solid var(--t-border)' : `1px solid ${t.border}`, borderRadius: 12, padding: 32, width: '100%', maxWidth: 480, fontFamily: FONT_B, margin: 'auto', backdropFilter: 'blur(16px)' }}>
        <h2 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 800, letterSpacing: '-0.01em', color: t.text }}>Reminders for this call</h2>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: t.textMuted }}>The prospect (and parent, if given) are emailed before the call at these times.</p>
        <ReminderEditor value={value} onChange={setValue} theme={theme} />
        {error && <p role="alert" style={{ color: t.danger, fontSize: 13, margin: '14px 0 0' }}>{error}</p>}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 24 }}>
          <button type="button" onClick={onClose} style={{ padding: '10px 20px', borderRadius: 9, border: dark ? '1px solid var(--t-border)' : `1px solid ${t.border}`, background: dark ? 'var(--t-bgSubtle)' : 'transparent', color: t.textMuted, fontFamily: FONT_B, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
          <button type="button" onClick={save} disabled={saving} className={saving ? '' : 'btn-gold-shimmer'} style={{ padding: '10px 22px', borderRadius: 9, border: 'none', background: saving ? (dark ? 'var(--t-bgSubtle)' : t.border) : 'var(--t-accent)', color: saving ? t.textMuted : 'var(--t-onAccent)', fontFamily: FONT_B, fontSize: 13, fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Saving…' : 'Save reminders'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
