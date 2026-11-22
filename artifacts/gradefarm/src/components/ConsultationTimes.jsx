import { useState, useEffect, useMemo } from 'react'
import { THEMES } from '../lib/theme'
import SegmentedToggle from './SegmentedToggle'
import { fetchConsultationSlots, fetchBookingSettings } from '../lib/db'
import { groupSlotsByDay, zonedToIso, ZONES } from '../lib/bookingFormat'

const FONT_B = "'Plus Jakarta Sans', sans-serif"

/**
 * The tutor's open times and zone, and the time chosen (an offered one or any
 * future time in the tutor's zone). Shared by the consultation modal and New
 * consultation. `diagnosticId`: the prospect's record when there is one (its
 * open times are loaded only then unless `always`); `always`: load the
 * tutor's open times with no record (a new consultation).
 */
export function useConsultationTimes({ diagnosticId = null, always = false } = {}) {
  const wantSlots = !!diagnosticId || always
  const [loading, setLoading] = useState(wantSlots)
  const [slots, setSlots] = useState([])
  const [zone, setZone] = useState(null)          // the tutor's own zone, from their settings; null until known
  const [zoneError, setZoneError] = useState('')
  const [defaultReminders, setDefaultReminders] = useState(null) // the tutor's reminder defaults, once known
  const [callMinutes, setCallMinutes] = useState(null)
  const [noHours, setNoHours] = useState(false)
  const [loadError, setLoadError] = useState('')

  const [how, setHow] = useState('offered')            // offered | any
  const [chosen, setChosen] = useState('')             // ISO of a chosen offered time
  const [date, setDate] = useState('')
  const [time, setTime] = useState('16:00')

  useEffect(() => {
    let cancelled = false
    fetchBookingSettings()
      .then(s => {
        if (cancelled) return
        if (s?.timeZone) setZone(s.timeZone); else setZoneError("Couldn't find your time zone.")
        if (Array.isArray(s?.reminderMinutes)) setDefaultReminders(s.reminderMinutes)
      })
      .catch(e => { if (!cancelled) setZoneError(e.message || "Couldn't load your time zone.") })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!wantSlots) { setHow('any'); return undefined }
    let cancelled = false
    fetchConsultationSlots(diagnosticId)
      .then(r => {
        if (cancelled) return
        setSlots(r.slots || [])
        setCallMinutes(r.callMinutes ?? null)
        setNoHours(!!r.noHours)
        if (!(r.slots || []).length) setHow('any')
      })
      .catch(e => { if (!cancelled) { setLoadError(e.message || "Couldn't load your open times."); setHow('any') } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [diagnosticId, wantSlots])

  const days = useMemo(() => (zone ? groupSlotsByDay(slots, zone) : []), [slots, zone])
  const zoneLabel = ZONES.find(z => z.value === zone)?.label || zone
  const zoneReady = !!zone
  const anyIso = zoneReady ? zonedToIso(date, time, zone) : null
  const startIso = how === 'offered' ? chosen : anyIso

  return {
    loading, slots, zone, zoneError, zoneLabel, zoneReady, defaultReminders, callMinutes, noHours, loadError, days,
    how, setHow, chosen, setChosen, date, setDate, time, setTime, anyIso, startIso,
  }
}

/**
 * The time picker: notices, then `children` (the caller's own fields), then
 * "Open times / Pick any time" and the chosen way of choosing.
 */
export function TimeChooser({ times, theme, formatWhen, onOpenSettings, showNoHours = false, labelStyle, inputStyle, children }) {
  const t = THEMES[theme]
  const { slots, zone, zoneError, zoneLabel, zoneReady, callMinutes, noHours, loadError, days, how, setHow, chosen, setChosen, date, setDate, time, setTime, anyIso } = times
  return (
    <>
      {showNoHours && noHours && (
        <div style={{ fontSize: 13, color: t.text, padding: '10px 14px', borderRadius: 8, background: 'var(--t-bgSubtle)', border: '1px solid var(--t-border)' }}>
          Set your consultation hours in Lessons first, so open times can be offered.{' '}
          {onOpenSettings && (
            <button type="button" onClick={onOpenSettings} style={{ border: 'none', background: 'transparent', padding: 0, color: t.goldText, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: FONT_B, textDecoration: 'underline' }}>
              Open consultation settings
            </button>
          )}
        </div>
      )}
      {zoneError && <p role="alert" style={{ color: t.danger, fontSize: 13, margin: 0 }}>{zoneError} Times can't be set until it loads. Close this and try again.</p>}
      {loadError && <p role="alert" style={{ color: t.danger, fontSize: 13, margin: 0 }}>{loadError}</p>}

      {children}

      {slots.length > 0 && (
        <SegmentedToggle size="sm" label="How to choose the time" value={how} onChange={setHow} options={[
          { value: 'offered', label: 'Open times' },
          { value: 'any', label: 'Pick any time', disabled: !zoneReady },
        ]} />
      )}

      {how === 'offered' && zoneReady ? (
        <div>
          <div style={labelStyle}>Times shown in {zoneLabel} time{callMinutes ? ` · ${callMinutes} minute call` : ''}</div>
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
      ) : how === 'offered' ? null : (
        <div>
          {slots.length === 0 && !loadError && !noHours && (
            <p style={{ margin: '0 0 10px', fontSize: 13, color: t.textMuted }}>No open times in the next few weeks. Pick a time yourself.</p>
          )}
          <div style={labelStyle}>Date and time{zoneReady ? ` in ${zoneLabel} time` : ''}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <input className="td-input-gold" type="date" aria-label="Date" disabled={!zoneReady} value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
            <input className="td-input-gold" type="time" aria-label="Time" disabled={!zoneReady} value={time} onChange={e => setTime(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ fontSize: 11, color: t.textFaint, marginTop: 6 }}>
            Any future time that doesn't overlap another of your sessions.
            {anyIso && <> Call set for {formatWhen(anyIso, zone)}.</>}
          </div>
        </div>
      )}
    </>
  )
}
