import { useState, useEffect } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { THEMES } from '../lib/theme'
import InfinityLoader from './InfinityLoader'
import ReminderEditor from './ReminderEditor'
import { fetchBookingSettings, saveBookingSettings } from '../lib/db'
import { ZONES, WEEK_DAYS, emptyWeek, isValidHHMM } from '../lib/bookingFormat'

const FONT_B = "'Plus Jakarta Sans', sans-serif"

const fmtChecked = (iso) => new Date(iso).toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

/** Fields held as text while typing, turned into numbers on save. */
const toForm = (s) => ({
  timeZone: s.timeZone,
  weeklyHours: { ...emptyWeek(), ...Object.fromEntries(Object.entries(s.weeklyHours || {}).map(([k, v]) => [k, v.map(b => [...b])])) },
  callMinutes: String(s.callMinutes),
  gapMinutes: String(s.gapMinutes),
  minNoticeHours: String(s.minNoticeHours),
  maxDaysAhead: String(s.maxDaysAhead),
  reminderMinutes: [...s.reminderMinutes],
  inviteEmail: s.inviteEmail || '',
})

/**
 * Lessons tab card where a tutor sets when prospects can book a consultation
 * call: weekly hours, call length, notice, reminders, and a calendar whose busy
 * times are kept free. Collapsed until opened.
 */
export default function ConsultationSettings({ theme, defaultOpen = false }) {
  const t = THEMES[theme]
  const dark = theme === 'dark'
  const [open, setOpen] = useState(defaultOpen)
  const [settings, setSettings] = useState(null)   // what the server has
  const [form, setForm] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [calendarUrl, setCalendarUrl] = useState('')
  const [removeCalendar, setRemoveCalendar] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => { if (defaultOpen) setOpen(true) }, [defaultOpen])

  // Load once, the first time the card is opened.
  useEffect(() => {
    if (!open || settings || loadError) return
    let cancelled = false
    fetchBookingSettings()
      .then(s => { if (!cancelled) { setSettings(s); setForm(toForm(s)) } })
      .catch(e => { if (!cancelled) setLoadError(e.message || "Couldn't load your consultation settings.") })
    return () => { cancelled = true }
  }, [open, settings, loadError])

  const card = { background: 'var(--t-bgCard)', border: '1px solid var(--t-border)', borderRadius: 12, marginBottom: 20, fontFamily: FONT_B, color: t.text }
  const inputStyle = { width: '100%', padding: '10px 14px', borderRadius: 9, border: dark ? '1px solid var(--t-border)' : `1px solid ${t.border}`, background: dark ? 'var(--t-bgSubtle)' : t.bg, color: t.text, fontFamily: FONT_B, fontSize: 13, outline: 'none', boxSizing: 'border-box' }
  const labelStyle = { fontSize: 12, fontWeight: 700, color: t.textMuted, display: 'block', marginBottom: 6 }
  const hint = { fontSize: 11, color: t.textFaint, marginTop: 4 }
  const ghostBtn = { padding: '6px 12px', borderRadius: 7, border: `1px solid ${t.border}`, background: 'transparent', color: t.textMuted, fontSize: 12, cursor: 'pointer', fontFamily: FONT_B }

  const set = (patch) => { setForm(f => ({ ...f, ...patch })); setSaved(false) }
  const setBlocks = (day, blocks) => set({ weeklyHours: { ...form.weeklyHours, [day]: blocks } })

  const summary = !settings
    ? 'Set the hours prospects can book a call with you'
    : Object.values(settings.weeklyHours || {}).some(b => b.length)
      ? `${settings.callMinutes} minute calls · ${WEEK_DAYS.filter(d => settings.weeklyHours[d.key]?.length).length} days a week`
      : 'No hours set yet. Add your weekly hours so prospects can book'

  const save = async (e) => {
    e.preventDefault()
    setError('')
    for (const { key, label } of WEEK_DAYS) {
      for (const [from, to] of form.weeklyHours[key]) {
        if (!isValidHHMM(from) || !isValidHHMM(to)) { setError(`Enter a start and end time for each block on ${label}.`); return }
      }
    }
    const body = {
      timeZone: form.timeZone,
      weeklyHours: Object.fromEntries(WEEK_DAYS.filter(d => form.weeklyHours[d.key].length).map(d => [d.key, form.weeklyHours[d.key]])),
      callMinutes: Number(form.callMinutes),
      gapMinutes: Number(form.gapMinutes),
      minNoticeHours: Number(form.minNoticeHours),
      maxDaysAhead: Number(form.maxDaysAhead),
      reminderMinutes: form.reminderMinutes,
      inviteEmail: form.inviteEmail.trim(),
    }
    if (calendarUrl.trim()) body.busyIcalUrl = calendarUrl.trim()
    else if (removeCalendar) body.busyIcalUrl = null
    setSaving(true)
    try {
      const next = await saveBookingSettings(body)
      setSettings(next)
      setForm(toForm(next))
      setCalendarUrl('')
      setRemoveCalendar(false)
      setSaved(true)
    } catch (err) {
      setError(err.message || 'Couldn\'t save your settings. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={card}>
      <button
        type="button" aria-expanded={open} onClick={() => setOpen(o => !o)}
        style={{ width: '100%', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: 'transparent', border: 'none', borderBottom: open ? '1px solid var(--t-border)' : 'none', cursor: 'pointer', textAlign: 'left', fontFamily: FONT_B }}
      >
        <span>
          <span style={{ display: 'block', fontSize: 14.5, fontWeight: 800, color: t.text }}>Consultation calls</span>
          <span style={{ display: 'block', fontSize: 12, color: t.textMuted, marginTop: 3 }}>{summary}</span>
        </span>
        <span style={{ color: t.textMuted, display: 'flex' }}>{open ? <ChevronUp size={18} aria-hidden="true" /> : <ChevronDown size={18} aria-hidden="true" />}</span>
      </button>

      {open && !form && !loadError && (
        <div style={{ padding: 32, textAlign: 'center', color: t.textMuted, fontSize: 13 }}>
          <InfinityLoader size={40} label={null} style={{ margin: '0 auto 10px' }} />
          Loading…
        </div>
      )}
      {open && loadError && (
        <div role="alert" style={{ margin: 20, fontSize: 13, color: t.danger, padding: '10px 14px', borderRadius: 8, background: t.dangerBg, border: `1px solid ${t.danger}40` }}>{loadError}</div>
      )}

      {open && form && (
        <form onSubmit={save} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Weekly hours */}
          <div>
            <label style={labelStyle}>Weekly hours <span style={{ fontWeight: 400, color: t.textFaint }}>— when prospects can book a call</span></label>
            <div style={{ border: '1px solid var(--t-border)', borderRadius: 10 }}>
              {WEEK_DAYS.map(({ key, label }, i) => {
                const blocks = form.weeklyHours[key]
                return (
                  <div key={key} style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '10px 14px', borderTop: i ? '1px solid var(--t-border)' : 'none', flexWrap: 'wrap' }}>
                    <div style={{ width: 92, fontSize: 13, fontWeight: 700, color: t.text, paddingTop: 9 }}>{label}</div>
                    <div style={{ flex: 1, minWidth: 220, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {blocks.length === 0 && <div style={{ fontSize: 13, color: t.textMuted, paddingTop: 9 }}>Not available</div>}
                      {blocks.map(([from, to], bi) => (
                        <div key={bi} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <input className="td-input-gold" type="time" aria-label={`${label} block ${bi + 1} starts`} value={from}
                            onChange={e => setBlocks(key, blocks.map((b, j) => j === bi ? [e.target.value, b[1]] : b))} style={{ ...inputStyle, width: 130 }} />
                          <span style={{ color: t.textMuted, fontSize: 12 }}>to</span>
                          <input className="td-input-gold" type="time" aria-label={`${label} block ${bi + 1} ends`} value={to}
                            onChange={e => setBlocks(key, blocks.map((b, j) => j === bi ? [b[0], e.target.value] : b))} style={{ ...inputStyle, width: 130 }} />
                          <button type="button" aria-label={`Remove ${label} block ${bi + 1}`} onClick={() => setBlocks(key, blocks.filter((_, j) => j !== bi))} style={ghostBtn}>Remove</button>
                        </div>
                      ))}
                    </div>
                    <button type="button" onClick={() => setBlocks(key, [...blocks, blocks.length ? [blocks[blocks.length - 1][1], blocks[blocks.length - 1][1]] : ['09:00', '17:00']])} style={{ ...ghostBtn, color: t.text, fontWeight: 700 }}>
                      Add hours
                    </button>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Zone and call rules */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
            <div>
              <label style={labelStyle}>Time zone</label>
              <select className="td-input-gold" value={form.timeZone} onChange={e => set({ timeZone: e.target.value })} style={inputStyle}>
                {ZONES.map(z => <option key={z.value} value={z.value}>{z.label}</option>)}
              </select>
              <div style={hint}>Your hours above are in this zone.</div>
            </div>
            <div>
              <label style={labelStyle}>Call length (minutes)</label>
              <input className="td-input-gold" type="number" min={15} max={180} value={form.callMinutes} onChange={e => set({ callMinutes: e.target.value })} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Gap between calls (minutes)</label>
              <input className="td-input-gold" type="number" min={0} max={120} value={form.gapMinutes} onChange={e => set({ gapMinutes: e.target.value })} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Earliest booking (hours ahead)</label>
              <input className="td-input-gold" type="number" min={0} max={168} value={form.minNoticeHours} onChange={e => set({ minNoticeHours: e.target.value })} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Furthest ahead (days)</label>
              <input className="td-input-gold" type="number" min={1} max={90} value={form.maxDaysAhead} onChange={e => set({ maxDaysAhead: e.target.value })} style={inputStyle} />
            </div>
          </div>

          {/* Default reminders */}
          <div>
            <label style={labelStyle}>Default reminders <span style={{ fontWeight: 400, color: t.textFaint }}>— emailed to the prospect before each call</span></label>
            <ReminderEditor value={form.reminderMinutes} onChange={v => set({ reminderMinutes: v })} theme={theme} />
          </div>

          {/* Invites and calendar */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
            <div>
              <label style={labelStyle}>Send calendar invites to <span style={{ fontWeight: 400, color: t.textFaint }}>(optional)</span></label>
              <input className="td-input-gold" type="email" value={form.inviteEmail} onChange={e => set({ inviteEmail: e.target.value })} placeholder={settings.defaultInviteEmail || 'you@example.com'} style={inputStyle} />
              <div style={hint}>Leave blank to use your sign-in email{settings.defaultInviteEmail ? ` (${settings.defaultInviteEmail})` : ''}.</div>
            </div>
            <div>
              <label style={labelStyle}>Google Calendar secret address <span style={{ fontWeight: 400, color: t.textFaint }}>(optional)</span></label>
              <input
                className="td-input-gold" type="password" autoComplete="off" value={calendarUrl}
                onChange={e => { setCalendarUrl(e.target.value); setSaved(false) }}
                placeholder={settings.hasCalendar && !removeCalendar ? 'Saved. Paste a new address to replace it' : 'https://calendar.google.com/calendar/ical/…'}
                style={inputStyle}
              />
              {settings.hasCalendar && !removeCalendar && (
                <div style={{ fontSize: 12, marginTop: 6, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', color: settings.calendarError ? t.danger : t.success }}>
                  <span>
                    {settings.calendarError
                      ? `Couldn't read your calendar: ${settings.calendarError}`
                      : settings.calendarCheckedAt ? `Connected · last read ${fmtChecked(settings.calendarCheckedAt)}` : 'Saved · not read yet'}
                  </span>
                  <button type="button" onClick={() => { setRemoveCalendar(true); setSaved(false) }} style={ghostBtn}>Remove calendar</button>
                </div>
              )}
              {removeCalendar && (
                <div style={{ fontSize: 12, marginTop: 6, color: t.textMuted }}>
                  Your calendar will be removed when you save.{' '}
                  <button type="button" onClick={() => setRemoveCalendar(false)} style={{ ...ghostBtn, padding: '3px 8px' }}>Undo</button>
                </div>
              )}
              <div style={hint}>
                Times busy in your calendar aren't offered. In Google Calendar open Settings, choose your calendar, then copy the "Secret address in iCal format".
              </div>
            </div>
          </div>

          {error && <div role="alert" style={{ fontSize: 13, color: t.danger, padding: '10px 14px', borderRadius: 8, background: t.dangerBg, border: `1px solid ${t.danger}40` }}>{error}</div>}

          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <button
              type="submit" disabled={saving}
              style={{ padding: '10px 22px', borderRadius: 9, border: 'none', background: saving ? t.border : 'var(--t-accent)', color: saving ? t.textMuted : 'var(--t-onAccent)', fontSize: 13, fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: FONT_B }}
            >
              {saving ? 'Saving…' : 'Save settings'}
            </button>
            {saved && <span role="status" style={{ fontSize: 13, color: t.success, fontWeight: 600 }}>Saved</span>}
          </div>
        </form>
      )}
    </div>
  )
}
