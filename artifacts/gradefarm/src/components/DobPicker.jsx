import { useState, useEffect, useRef, useId } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { THEMES } from '../lib/theme'

// A date of birth as a calendar: month and year menus (birthdays are years
// back, so arrows alone would be a long way), a week grid starting Monday,
// and the date and age written out underneath. `value` / onChange use
// "YYYY-MM-DD". It opens on `startYear` (onboarding guesses it from their
// school year) until a date is picked. Arrow keys move a day or a week,
// Page Up / Page Down a month, Home / End the start or end of the week.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const pad = (n) => String(n).padStart(2, '0')
const iso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`
const parse = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '')
  return m ? { y: Number(m[1]), m: Number(m[2]) - 1, d: Number(m[3]) } : null
}
const daysIn = (y, m) => new Date(y, m + 1, 0).getDate()
/** The date `days` from `s`, as YYYY-MM-DD. */
const shift = (s, days) => {
  const p = parse(s)
  const dt = new Date(p.y, p.m, p.d + days)
  return iso(dt.getFullYear(), dt.getMonth(), dt.getDate())
}
/** Same day `months` on, or the month's last day if it's shorter. */
const shiftMonth = (s, months) => {
  const p = parse(s)
  const first = new Date(p.y, p.m + months, 1)
  const y = first.getFullYear(), m = first.getMonth()
  return iso(y, m, Math.min(p.d, daysIn(y, m)))
}

/** "14 March 2010 · 16 years old" */
export function describeDob(value, today = new Date()) {
  const p = parse(value)
  if (!p) return ''
  let age = today.getFullYear() - p.y
  if (today.getMonth() < p.m || (today.getMonth() === p.m && today.getDate() < p.d)) age -= 1
  return `${p.d} ${MONTHS[p.m]} ${p.y}${age >= 0 ? ` · ${age} year${age === 1 ? '' : 's'} old` : ''}`
}

export default function DobPicker({ value, onChange, min = '1920-01-01', max, startYear, theme = 'dark', labelledBy }) {
  const t = THEMES[theme]
  const uid = useId()
  const now = new Date()
  const maxIso = max || iso(now.getFullYear(), now.getMonth(), now.getDate())
  const lo = parse(min), hi = parse(maxIso)
  const picked = parse(value)
  const [view, setView] = useState(() => (picked
    ? { y: picked.y, m: picked.m }
    : { y: Math.min(Math.max(startYear || hi.y - 15, lo.y), hi.y), m: now.getMonth() }))
  // The day keyboard focus sits on (roving tabindex): the picked one, else the 1st.
  const [cursor, setCursor] = useState(() => value || iso(view.y, view.m, 1))
  const grid = useRef(null)
  const moved = useRef(false)

  const inRange = (s) => s >= min && s <= maxIso
  const go = (y, m) => {
    const first = new Date(y, m, 1)
    const ny = first.getFullYear(), nm = first.getMonth()
    if (iso(ny, nm, daysIn(ny, nm)) < min || iso(ny, nm, 1) > maxIso) return
    setView({ y: ny, m: nm })
    const c = parse(cursor)
    setCursor(iso(ny, nm, Math.min(c?.d || 1, daysIn(ny, nm))))
  }

  // Keyboard moves focus with the cursor, even into another month.
  useEffect(() => {
    if (!moved.current) return
    moved.current = false
    grid.current?.querySelector(`[data-day="${cursor}"]`)?.focus()
  }, [cursor, view])

  const onKey = (e) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key]
    const c = parse(cursor)
    const weekday = (new Date(c.y, c.m, c.d).getDay() + 6) % 7
    let next = null
    if (step) next = shift(cursor, step)
    else if (e.key === 'PageUp') next = shiftMonth(cursor, e.shiftKey ? -12 : -1)
    else if (e.key === 'PageDown') next = shiftMonth(cursor, e.shiftKey ? 12 : 1)
    else if (e.key === 'Home') next = shift(cursor, -weekday)
    else if (e.key === 'End') next = shift(cursor, 6 - weekday)
    if (!next) return
    e.preventDefault()
    if (!inRange(next)) return
    const n = parse(next)
    moved.current = true
    setView({ y: n.y, m: n.m })
    setCursor(next)
  }

  const lead = (new Date(view.y, view.m, 1).getDay() + 6) % 7
  const count = daysIn(view.y, view.m)
  const cells = [...Array(lead).fill(null), ...Array.from({ length: count }, (_, i) => i + 1)]
  const cursorInView = parse(cursor)?.y === view.y && parse(cursor)?.m === view.m
  const years = Array.from({ length: hi.y - lo.y + 1 }, (_, i) => hi.y - i)
  const canBack = iso(view.y, view.m, 1) > min
  const canFwd = iso(view.y, view.m, daysIn(view.y, view.m)) < maxIso

  const css = `
    .dob { width: 100%; max-width: 380px; background: ${t.bgCard}; border: 1px solid ${t.border}; border-radius: 16px; padding: 14px; box-shadow: 0 10px 30px -18px rgba(12,16,55,0.35); }
    .dob-top { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
    .dob-nav { width: 36px; height: 36px; flex: none; display: grid; place-items: center; border-radius: 10px; border: 1px solid ${t.border}; background: transparent; color: ${t.textSub}; cursor: pointer; }
    .dob-nav:hover:not(:disabled) { background: ${t.bgSubtle}; }
    .dob-nav:disabled { opacity: 0.35; cursor: default; }
    .dob-sel { flex: 1; min-width: 0; height: 36px; padding: 0 30px 0 12px; border-radius: 10px; border: 1px solid ${t.border}; background: ${t.bgCard}; color: ${t.text}; font: inherit; font-size: 14.5px; font-weight: 700; cursor: pointer; appearance: none; -webkit-appearance: none;
      background-image: linear-gradient(45deg, transparent 50%, ${t.textMuted} 50%), linear-gradient(135deg, ${t.textMuted} 50%, transparent 50%); background-position: calc(100% - 15px) 15px, calc(100% - 10px) 15px; background-size: 5px 5px; background-repeat: no-repeat; }
    .dob-sel.yr { flex: 0 0 92px; }
    .dob-sel:hover { border-color: ${t.borderMid}; }
    .dob-week, .dob-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
    .dob-week span { text-align: center; font-size: 11.5px; font-weight: 700; color: ${t.textFaint}; padding: 4px 0; }
    .dob-day { aspect-ratio: 1; border: none; border-radius: 10px; background: transparent; color: ${t.text}; font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; font-variant-numeric: tabular-nums; transition: background 0.12s, color 0.12s, transform 0.12s; }
    .dob-day:hover:not(:disabled):not([aria-pressed="true"]) { background: ${t.bgSubtle}; }
    .dob-day[aria-pressed="true"] { background: ${t.text}; color: ${t.bg}; font-weight: 800; transform: scale(1.04); }
    .dob-day:disabled { color: ${t.textFaint}; opacity: 0.45; cursor: default; }
    .dob-day:focus-visible, .dob-nav:focus-visible, .dob-sel:focus-visible { outline: 2px solid ${t.accent}; outline-offset: 2px; }
    .dob-out { margin-top: 10px; min-height: 22px; font-size: 14.5px; font-weight: 700; color: ${t.text}; }
    .dob-out span { color: ${t.textMuted}; font-weight: 600; }
    @media (prefers-reduced-motion: reduce) { .dob-day { transition: none; } }
  `

  const said = describeDob(value)
  return (
    <div className="dob" role="group" aria-labelledby={labelledBy} aria-label={labelledBy ? undefined : 'Date of birth'}>
      <style>{css}</style>
      <div className="dob-top">
        <button type="button" className="dob-nav" onClick={() => go(view.y, view.m - 1)} disabled={!canBack} aria-label="Previous month"><ChevronLeft size={17} /></button>
        <select className="dob-sel" aria-label="Month" value={view.m} onChange={e => go(view.y, Number(e.target.value))}>
          {MONTHS.map((name, i) => <option key={name} value={i}>{name}</option>)}
        </select>
        <select className="dob-sel yr" aria-label="Year" value={view.y} onChange={e => go(Number(e.target.value), view.m)}>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <button type="button" className="dob-nav" onClick={() => go(view.y, view.m + 1)} disabled={!canFwd} aria-label="Next month"><ChevronRight size={17} /></button>
      </div>
      <div className="dob-week" aria-hidden="true">{DAYS.map(d => <span key={d}>{d}</span>)}</div>
      <div className="dob-grid" ref={grid} role="grid" aria-label={`${MONTHS[view.m]} ${view.y}`} onKeyDown={onKey}>
        {cells.map((d, i) => {
          if (!d) return <span key={`b${i}`} />
          const day = iso(view.y, view.m, d)
          const on = value === day
          const focusable = cursorInView ? cursor === day : d === 1
          return (
            <button key={day} type="button" className="dob-day" data-day={day} aria-pressed={on} disabled={!inRange(day)}
              tabIndex={focusable ? 0 : -1} aria-label={`${d} ${MONTHS[view.m]} ${view.y}`}
              onClick={() => { setCursor(day); onChange(day) }}>
              {d}
            </button>
          )
        })}
      </div>
      <p className="dob-out" id={`${uid}-out`} aria-live="polite">
        {said ? <>{said.split(' · ')[0]}{said.includes(' · ') && <span> · {said.split(' · ')[1]}</span>}</> : <span>Pick the day.</span>}
      </p>
    </div>
  )
}
