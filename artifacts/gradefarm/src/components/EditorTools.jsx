import { useState } from 'react'
import { insertSnippet, SNIPPETS } from '../lib/mathInsert'
import { FONT_B } from '../lib/adminUi'

export const EDITOR_SIZES = [0.9, 1, 1.15, 1.3, 1.5]
const SIZE_KEY = 'gf-editor-size'

/** The editor's text size, remembered in this browser. */
export function useEditorSize() {
  const [size, setSize] = useState(() => {
    try { const v = Number(localStorage.getItem(SIZE_KEY)); return EDITOR_SIZES.includes(v) ? v : 1 } catch { return 1 }
  })
  const change = (d) => setSize(prev => {
    const next = EDITOR_SIZES[Math.min(EDITOR_SIZES.length - 1, Math.max(0, EDITOR_SIZES.indexOf(prev) + d))]
    try { localStorage.setItem(SIZE_KEY, String(next)) } catch { /* private window: not remembered */ }
    return next
  })
  return [size, change]
}

/** Put text into a React-controlled box as if typed, so its onChange (and the live preview) runs. */
function typeInto(el, value, caret) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.focus()
  requestAnimationFrame(() => el.setSelectionRange(caret, caret))
}

/**
 * Above Admin's question editors: A− / A+ for the editing text's size, and a
 * symbol bar that inserts maths and chemistry (LaTeX) at the cursor of the
 * box last typed in (lib/mathInsert.js). getTarget() returns that box.
 */
export default function EditorTools({ getTarget, size, onSize }) {
  const [hint, setHint] = useState('')
  const insert = (s) => {
    const el = getTarget()
    if (!el || !el.isConnected) { setHint('Click in a box first, then choose a symbol.'); return }
    setHint('')
    const r = insertSnippet(el.value, el.selectionStart ?? el.value.length, el.selectionEnd ?? el.value.length, s)
    typeInto(el, r.value, r.caret)
  }
  const chip = { border: '1px solid var(--t-border)', background: 'var(--t-bgCard)', color: 'var(--t-text)', borderRadius: 7, padding: '3px 8px', fontSize: 12.5, fontFamily: FONT_B, fontWeight: 600, cursor: 'pointer', minWidth: 30 }
  const groups = [...new Set(SNIPPETS.map(s => s.group))]
  return (
    <div style={{ border: '1px solid var(--t-border)', borderRadius: 10, padding: '8px 10px', marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 6, background: 'var(--t-bgSubtle)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--t-textMuted)' }}>
        <span style={{ fontWeight: 700 }}>Text size</span>
        <button type="button" onClick={() => onSize(-1)} disabled={size === EDITOR_SIZES[0]} aria-label="Smaller text" style={chip}>A−</button>
        <button type="button" onClick={() => onSize(1)} disabled={size === EDITOR_SIZES[EDITOR_SIZES.length - 1]} aria-label="Larger text" style={{ ...chip, fontSize: 14 }}>A+</button>
        <span>{Math.round(size * 100)}%</span>
      </div>
      {groups.map(g => (
        <div key={g} role="toolbar" aria-label={`Insert ${g.toLowerCase()}`} style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--t-textMuted)', minWidth: 66 }}>{g}</span>
          {SNIPPETS.filter(s => s.group === g).map(s => (
            // mousedown is cancelled so the box keeps its cursor and selection.
            <button key={s.id} type="button" title={`${s.title}: ${s.code.replace('|', '…').replace(/\n/g, ' ')}`} aria-label={s.title}
              onMouseDown={e => e.preventDefault()} onClick={() => insert(s)} style={chip}>{s.label}</button>
          ))}
        </div>
      ))}
      {hint && <div role="status" style={{ fontSize: 12, color: 'var(--t-danger)' }}>{hint}</div>}
    </div>
  )
}
