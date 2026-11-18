import { useEffect, useRef, useState } from 'react'
import { Lock } from 'lucide-react'
import { PALETTES, paletteColors, paletteShell, paletteUnlocked, paletteById } from '../lib/theme'
import { RANKS } from '../lib/engine'

const FONT_B = "'Plus Jakarta Sans', sans-serif"

/** A palette's tile: a tiny window in its own colours (sidebar, card, a line of text, a button). */
export function PaletteSwatch({ palette, on, locked, unlockRank, onPick, compact = false }) {
  const c = paletteColors(palette.id)
  const sh = paletteShell(palette.id)
  return (
    <div style={{ borderRadius: 16, padding: 3, boxShadow: on ? '0 0 0 3px var(--t-accent)' : 'none', transition: 'box-shadow 0.15s' }}>
      <button type="button" role="radio" aria-checked={on} onClick={onPick}
        aria-label={locked ? `${palette.name} (preview; unlocks at ${unlockRank})` : palette.name}
        style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', padding: 8, borderRadius: 13, border: `1px solid ${c.border}`, background: c.bgCard, color: c.text, cursor: 'pointer', textAlign: 'left', fontFamily: FONT_B }}>
        <span aria-hidden="true" style={{ position: 'relative', display: 'block', height: compact ? 52 : 70, borderRadius: 9, background: c.bg, border: `1px solid ${c.border}`, overflow: 'hidden' }}>
          <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '24%', background: sh.bg }} />
          <span style={{ position: 'absolute', left: '5%', top: 9, width: '14%', height: 7, borderRadius: 3, background: sh.icon, opacity: 0.85 }} />
          <span style={{ position: 'absolute', left: '32%', right: '8%', top: 11, bottom: 11, borderRadius: 7, background: c.bgCard, border: `1px solid ${c.border}` }} />
          <span style={{ position: 'absolute', left: '38%', top: compact ? 18 : 21, width: '34%', height: 6, borderRadius: 3, background: c.text, opacity: 0.85 }} />
          <span style={{ position: 'absolute', left: '38%', bottom: compact ? 16 : 19, width: '24%', height: 9, borderRadius: 4, background: c.accent }} />
        </span>
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, fontSize: 13.5, fontWeight: 800, padding: '0 2px 2px' }}>
          <span>{palette.name}</span>
          {locked && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 700, color: c.textMuted }}><Lock size={11} strokeWidth={2.6} aria-hidden="true" />{unlockRank}</span>}
        </span>
      </button>
    </div>
  )
}

/**
 * "Make gradefarm yours": shown once, over the results of a student's first
 * finished session. Tapping a palette restyles the app behind the card at
 * once (onChoose); Done keeps it, Later goes back to what they had. A palette
 * locked to a rank can be previewed, never kept. `level`: their RANK_TIERS
 * index; staff have every palette.
 */
export default function ThemeCard({ palette, onChoose, onClose, level = 0, staff = false }) {
  const [start] = useState(palette) // what they had when the card opened
  const [lastOpen, setLastOpen] = useState(paletteUnlocked(paletteById(palette), { level, staff }) ? palette : 'light')
  const [lockNote, setLockNote] = useState('')
  const doneRef = useRef(null)
  useEffect(() => { doneRef.current?.focus() }, [])

  const pick = (p) => {
    onChoose(p.id)
    if (paletteUnlocked(p, { level, staff })) { setLastOpen(p.id); setLockNote('') }
    else setLockNote(`This is a preview: ${p.name} unlocks when you reach ${RANKS[p.locked]}. Keep practising.`)
  }
  const done = () => {
    const p = paletteById(palette)
    const keep = p && paletteUnlocked(p, { level, staff }) ? palette : lastOpen
    if (keep !== palette) onChoose(keep)
    onClose({ kept: keep, previewOnly: keep !== palette })
  }
  const later = () => { if (palette !== start) onChoose(start); onClose({ kept: start, later: true }) }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 900, background: 'rgba(6,8,28,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, boxSizing: 'border-box', fontFamily: FONT_B }}
      onKeyDown={e => { if (e.key === 'Escape') later() }}>
      <section role="dialog" aria-modal="true" aria-labelledby="theme-card-title"
        style={{ width: '100%', maxWidth: 580, maxHeight: '100%', overflowY: 'auto', boxSizing: 'border-box', background: 'var(--t-bgCard)', color: 'var(--t-text)', border: '1px solid var(--t-border)', borderRadius: 22, padding: 'clamp(20px, 4vw, 28px)', boxShadow: 'var(--t-shadowModal)', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <h2 id="theme-card-title" style={{ margin: 0, textAlign: 'center', fontSize: 28, fontWeight: 800, letterSpacing: '-0.025em' }}>Make gradefarm yours</h2>
        <div role="radiogroup" aria-label="Theme" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
          {PALETTES.map(p => {
            const locked = !paletteUnlocked(p, { level, staff })
            return <PaletteSwatch key={p.id} palette={p} on={palette === p.id} locked={locked} unlockRank={locked ? RANKS[p.locked] : ''} onPick={() => pick(p)} />
          })}
        </div>
        {lockNote && <p role="status" style={{ margin: 0, textAlign: 'center', fontSize: 13.5, color: 'var(--t-textMuted)' }}>{lockNote}</p>}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <button ref={doneRef} type="button" onClick={done}
            style={{ width: '100%', maxWidth: 320, minHeight: 46, borderRadius: 11, border: 'none', background: 'var(--t-accent)', color: '#0c1037', fontFamily: FONT_B, fontSize: 15, fontWeight: 800, cursor: 'pointer' }}>Done</button>
          <button type="button" onClick={later}
            style={{ minHeight: 44, border: 'none', background: 'none', color: 'var(--t-textMuted)', fontFamily: FONT_B, fontSize: 14, fontWeight: 700, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }}>Later</button>
        </div>
      </section>
    </div>
  )
}
