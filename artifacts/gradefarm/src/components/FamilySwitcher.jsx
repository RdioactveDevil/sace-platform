import { useEffect, useState } from 'react'
import { Users, Check, Plus, ChevronDown } from 'lucide-react'
import { addFamilyChild, fetchFamily, switchToChild } from '../lib/db'

const GOLD = '#f1be43'
const FONT_B = "'Plus Jakarta Sans', sans-serif"

// One load per page: the family only changes by adding a child, which reloads.
let cached = null

/** The signed-in family (api-server routes/family.ts), or null if this account has none. */
export function useFamily(profile) {
  const [family, setFamily] = useState(cached)
  useEffect(() => {
    if (profile?.account_holder !== 'parent' || profile?.is_tutor) return
    if (cached && cached.currentId === profile.id) { setFamily(cached); return }
    let cancelled = false
    fetchFamily()
      .then(f => { cached = f.canAddChildren ? f : null; if (!cancelled) setFamily(cached) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [profile?.id, profile?.account_holder, profile?.is_tutor])
  return profile?.account_holder === 'parent' ? family : null
}

/**
 * For a parent's account: which child is open, a list to switch to another
 * one (no password), and adding a child. Sits in the sidebar footer.
 */
export default function FamilySwitcher({ profile }) {
  const family = useFamily(profile)
  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')
  if (!family) return null

  const children = family.children || []
  const current = children.find(c => c.id === family.currentId)
  const others = children.filter(c => c.id !== family.currentId)

  const switchTo = async (id) => {
    setBusy(id); setError('')
    try { await switchToChild(id) } catch (e) { setError(e.message || "Couldn't switch."); setBusy(null) }
  }
  const add = async (e) => {
    e.preventDefault()
    if (!name.trim() || busy) return
    setBusy('add'); setError('')
    try {
      const child = await addFamilyChild(name.trim())
      await switchToChild(child.id) // they set the new child up next (onboarding)
    } catch (err) { setError(err.message || "Couldn't add them."); setBusy(null) }
  }

  const row = { width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 8, border: 'none', background: 'transparent', color: 'rgba(255,255,255,0.75)', fontSize: 12.5, fontWeight: 600, fontFamily: FONT_B, cursor: 'pointer', textAlign: 'left' }

  return (
    <div style={{ borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)', marginBottom: 2 }}>
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
        style={{ ...row, padding: '8px 10px', color: '#f1f5f9' }}>
        <Users size={15} color={GOLD} aria-hidden="true" style={{ flexShrink: 0 }} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{current?.name || profile.display_name}</span>
          <span style={{ display: 'block', fontSize: 10.5, color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>{others.length ? 'Switch child' : 'Add a child'}</span>
        </span>
        <ChevronDown size={14} aria-hidden="true" style={{ flexShrink: 0, color: 'rgba(255,255,255,0.4)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>
      {open && (
        <div style={{ padding: '0 4px 6px' }}>
          {children.map(c => (
            <button key={c.id} type="button" disabled={c.id === family.currentId || !!busy} onClick={() => switchTo(c.id)}
              style={{ ...row, cursor: c.id === family.currentId ? 'default' : 'pointer', color: c.id === family.currentId ? GOLD : row.color }}>
              <span style={{ width: 14, display: 'flex', flexShrink: 0 }}>{c.id === family.currentId && <Check size={14} aria-hidden="true" />}</span>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
              {busy === c.id && <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Opening…</span>}
              {!c.set_up && busy !== c.id && <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.4)' }}>Not set up</span>}
            </button>
          ))}
          {adding ? (
            <form onSubmit={add} style={{ display: 'flex', gap: 6, padding: '4px 6px 0' }}>
              <input autoFocus value={name} onChange={e => setName(e.target.value)} maxLength={40} placeholder="Child's first name" aria-label="Child's first name"
                style={{ flex: 1, minWidth: 0, padding: '7px 9px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.04)', color: '#f1f5f9', fontSize: 12.5, fontFamily: FONT_B, outline: 'none' }} />
              <button type="submit" disabled={!name.trim() || !!busy}
                style={{ padding: '0 10px', borderRadius: 7, border: 'none', background: GOLD, color: '#0c1037', fontSize: 12, fontWeight: 800, fontFamily: FONT_B, cursor: 'pointer', opacity: !name.trim() || busy ? 0.6 : 1 }}>
                {busy === 'add' ? '…' : 'Add'}
              </button>
            </form>
          ) : (
            <button type="button" onClick={() => setAdding(true)} style={{ ...row, color: GOLD }}>
              <Plus size={14} aria-hidden="true" style={{ flexShrink: 0 }} /> Add a child
            </button>
          )}
          {error && <div role="alert" style={{ fontSize: 11.5, color: '#f87171', padding: '6px 10px 0', lineHeight: 1.4 }}>{error}</div>}
        </div>
      )}
    </div>
  )
}
