import { useState } from 'react'
import { THEMES } from '../lib/theme'
import { reminderLabel, reminderToMinutes } from '../lib/bookingFormat'

const FONT_B = "'Plus Jakarta Sans', sans-serif"
export const MAX_REMINDERS = 5

/**
 * Reminder offsets (minutes before a call) as removable chips, with a number
 * and unit to add another. The server needs at least one and at most five.
 */
export default function ReminderEditor({ value, onChange, theme }) {
  const t = THEMES[theme]
  const [amount, setAmount] = useState('')
  const [unit, setUnit] = useState('hours')
  const [problem, setProblem] = useState('')
  const dark = theme === 'dark'
  const inputStyle = { padding: '9px 12px', borderRadius: 9, border: dark ? '1px solid var(--t-border)' : `1px solid ${t.border}`, background: dark ? 'var(--t-bgSubtle)' : t.bg, color: t.text, fontFamily: FONT_B, fontSize: 13, outline: 'none', boxSizing: 'border-box' }

  const add = () => {
    const minutes = reminderToMinutes(amount, unit)
    if (minutes === null) { setProblem('Enter a whole number.'); return }
    if (minutes < 5 || minutes > 10080) { setProblem('Between 5 minutes and 7 days before.'); return }
    if (value.includes(minutes)) { setProblem('That reminder is already on the list.'); return }
    setProblem('')
    setAmount('')
    onChange([...value, minutes].sort((a, b) => b - a))
  }

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        {value.map(m => (
          <span key={m} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 8px 5px 12px', borderRadius: 12, border: '1px solid var(--t-border)', background: 'var(--t-bgSubtle)', color: t.text, fontSize: 12, fontWeight: 600, fontFamily: FONT_B }}>
            {reminderLabel(m)}
            <button
              type="button"
              aria-label={`Remove the ${reminderLabel(m)} reminder`}
              disabled={value.length <= 1}
              onClick={() => onChange(value.filter(x => x !== m))}
              style={{ border: 'none', background: 'transparent', color: t.textMuted, cursor: value.length <= 1 ? 'not-allowed' : 'pointer', fontSize: 14, lineHeight: 1, padding: '0 2px', opacity: value.length <= 1 ? 0.4 : 1, fontFamily: FONT_B }}
            >×</button>
          </span>
        ))}
      </div>
      {value.length < MAX_REMINDERS && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            className="td-input-gold" type="number" min={1} inputMode="numeric" aria-label="Reminder amount" placeholder="e.g. 2"
            value={amount} onChange={e => setAmount(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
            style={{ ...inputStyle, width: 90 }}
          />
          <select className="td-input-gold" aria-label="Reminder unit" value={unit} onChange={e => setUnit(e.target.value)} style={inputStyle}>
            <option value="minutes">minutes before</option>
            <option value="hours">hours before</option>
            <option value="days">days before</option>
          </select>
          <button type="button" onClick={add} style={{ padding: '9px 14px', borderRadius: 9, border: `1px solid ${t.border}`, background: 'transparent', color: t.text, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B }}>
            Add reminder
          </button>
        </div>
      )}
      {problem && <div style={{ fontSize: 12, color: t.danger, marginTop: 6 }}>{problem}</div>}
    </div>
  )
}
