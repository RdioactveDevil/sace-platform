import { useState, useEffect, useMemo, useRef, useId } from 'react'
import { Search, X } from 'lucide-react'
import { THEMES } from '../lib/theme'
import { loadSchools, searchSchools } from '../lib/schools'

// Picking a school from the list for the student's state (ACARA's School
// Location list, public/schools/<STATE>.json, built by
// scripts/build-school-list.py), so it's a real school rather than whatever
// was typed. Typing searches the list; "My school isn't listed" lets them
// type it instead. Outside Australia (no list) it's a plain box. `value` is
// the school's name, with its suburb in brackets when the state has more than
// one school of that name ("St Joseph's School (Port Pirie)").

const TYPE = { P: 'Primary', S: 'Secondary', C: 'Primary and secondary' }
export default function SchoolPicker({ id, state, value, onChange, theme = 'dark', autoFocus = false }) {
  const t = THEMES[theme]
  const uid = useId()
  const listId = `${uid}-list`
  const [schools, setSchools] = useState(undefined) // undefined while loading, null with no list
  useEffect(() => {
    let off = false
    setSchools(undefined)
    loadSchools(state).then(list => { if (!off) setSchools(list) })
    return () => { off = true }
  }, [state])

  const dupNames = useMemo(() => {
    const seen = new Set(), dup = new Set()
    for (const [name] of schools || []) (seen.has(name) ? dup : seen).add(name)
    return dup
  }, [schools])
  const valueOf = (s) => (dupNames.has(s[0]) ? `${s[0]} (${s[1]})` : s[0])
  const match = useMemo(() => (schools && value ? schools.find(s => valueOf(s) === value) || null : null), [schools, value, dupNames]) // eslint-disable-line react-hooks/exhaustive-deps

  // Typing their own: a school that isn't listed (or one saved before there was a list).
  const [own, setOwn] = useState(false)
  useEffect(() => { if (schools && value && !match) setOwn(true) }, [schools]) // eslint-disable-line react-hooks/exhaustive-deps
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const input = useRef(null), ownInput = useRef(null)
  const results = useMemo(() => (schools ? searchSchools(schools, query) : []), [schools, query])
  const open = !!query.trim() && !match && !own
  const options = open ? [...results, 'other'] : []
  useEffect(() => { setActive(0) }, [query])
  useEffect(() => {
    document.getElementById(`${uid}-opt-${active}`)?.scrollIntoView({ block: 'nearest' })
  }, [active, uid])

  const choose = (s) => { onChange(valueOf(s)); setQuery('') }
  const typeOwn = () => { setOwn(true); onChange(query.trim()); setQuery(''); requestAnimationFrame(() => ownInput.current?.focus()) }
  const pick = (opt) => (opt === 'other' ? typeOwn() : choose(opt))
  const backToList = () => { setOwn(false); onChange(''); requestAnimationFrame(() => input.current?.focus()) }
  const change = () => { onChange(''); requestAnimationFrame(() => input.current?.focus()) }

  const onKey = (e) => {
    if (!open) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, options.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); pick(options[active]) } // not the form's Next
    else if (e.key === 'Escape') { e.preventDefault(); setQuery('') }
  }

  const css = `
    .scp { width: 100%; max-width: 480px; display: flex; flex-direction: column; gap: 8px; }
    .scp-search { position: relative; }
    .scp-search svg { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: ${t.textFaint}; pointer-events: none; }
    .scp-inp { width: 100%; box-sizing: border-box; padding: 13px 15px; border-radius: 11px; border: 1px solid ${t.border}; background: ${t.bgCard}; color: ${t.text}; font: inherit; font-size: 16px; outline: none; transition: border-color 0.12s, box-shadow 0.12s; }
    .scp-inp::placeholder { color: ${t.textFaint}; }
    .scp-inp:hover { border-color: ${t.borderMid}; }
    .scp-inp:focus { border-color: ${t.text}; box-shadow: 0 0 0 1px ${t.text}; }
    .scp-inp:disabled { opacity: 0.6; }
    .scp-search .scp-inp { padding-left: 42px; }
    .scp-list { list-style: none; margin: 0; padding: 4px; max-height: 300px; overflow-y: auto; background: ${t.bgCard}; border: 1px solid ${t.border}; border-radius: 12px; box-shadow: 0 12px 30px -18px rgba(12,16,55,0.4); }
    .scp-opt { display: flex; flex-direction: column; gap: 1px; padding: 9px 12px; border-radius: 9px; cursor: pointer; color: ${t.text}; }
    .scp-opt b { font-size: 14.5px; font-weight: 700; line-height: 1.35; }
    .scp-opt span { font-size: 12.5px; color: ${t.textMuted}; }
    .scp-opt[aria-selected="true"] { background: ${t.bgSubtle}; }
    .scp-opt.other { border-top: 1px solid ${t.border}; border-radius: 0 0 9px 9px; margin-top: 4px; }
    .scp-opt.other b { color: ${t.textSub}; }
    .scp-none { padding: 10px 12px 4px; font-size: 13.5px; color: ${t.textMuted}; }
    .scp-hint { font-size: 12.5px; color: ${t.textMuted}; }
    .scp-chosen { display: flex; align-items: center; gap: 12px; padding: 13px 14px; border-radius: 12px; border: 1px solid ${t.text}; box-shadow: 0 0 0 1px ${t.text}; background: ${t.bgCard}; }
    .scp-chosen div { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .scp-chosen b { font-size: 15.5px; color: ${t.text}; line-height: 1.35; }
    .scp-chosen span { font-size: 13px; color: ${t.textMuted}; }
    .scp-x { flex: none; display: inline-flex; align-items: center; gap: 4px; border: 1px solid ${t.border}; background: transparent; color: ${t.textSub}; border-radius: 8px; padding: 5px 9px; font: inherit; font-size: 12.5px; font-weight: 700; cursor: pointer; }
    .scp-x:hover { background: ${t.bgSubtle}; }
    .scp-link { align-self: flex-start; border: none; background: none; padding: 0; font: inherit; font-size: 13px; font-weight: 600; color: ${t.textMuted}; text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
    .scp-x:focus-visible, .scp-link:focus-visible { outline: 2px solid ${t.accent}; outline-offset: 2px; }
  `

  // Outside Australia, or the list couldn't load: type it.
  if (schools === null) {
    return (
      <div className="scp"><style>{css}</style>
        <input id={id} className="scp-inp" value={value} onChange={e => onChange(e.target.value)}
          autoComplete="organization" placeholder="Your school's name" autoFocus={autoFocus} />
      </div>
    )
  }

  if (match) {
    return (
      <div className="scp"><style>{css}</style>
        <div className="scp-chosen" aria-live="polite">
          <div><b>{match[0]}</b><span>{[match[1], TYPE[match[2]]].filter(Boolean).join(' · ')}</span></div>
          <button type="button" className="scp-x" onClick={change} aria-label={`Change school (${match[0]})`}><X size={13} aria-hidden="true" />Change</button>
        </div>
      </div>
    )
  }

  if (own) {
    return (
      <div className="scp"><style>{css}</style>
        <input id={id} ref={ownInput} className="scp-inp" value={value}
          onChange={e => onChange(e.target.value)} autoComplete="off" placeholder="Your school's name" />
        <span className="scp-hint">Not on the list? Type its name here.</span>
        {schools && <button type="button" className="scp-link" onClick={backToList}>Back to the list</button>}
      </div>
    )
  }

  const activeId = open ? `${uid}-opt-${active}` : undefined
  return (
    <div className="scp"><style>{css}</style>
      <div className="scp-search">
        <Search size={17} aria-hidden="true" />
        <input id={id} ref={input} className="scp-inp" type="text" role="combobox" aria-expanded={open} aria-controls={listId}
          aria-autocomplete="list" aria-activedescendant={activeId} autoComplete="off" spellCheck={false} autoFocus={autoFocus}
          disabled={schools === undefined} placeholder={schools === undefined ? 'Loading schools…' : 'Start typing its name'}
          value={query} onChange={e => setQuery(e.target.value)} onKeyDown={onKey} />
      </div>
      {open ? (
        <ul className="scp-list" id={listId} role="listbox" aria-label="Schools">
          {!results.length && <li className="scp-none" role="presentation">No school by that name in this state.</li>}
          {options.map((opt, i) => (opt === 'other' ? (
            <li key="other" id={`${uid}-opt-${i}`} className="scp-opt other" role="option" aria-selected={active === i}
              onMouseDown={e => e.preventDefault()} onMouseEnter={() => setActive(i)} onClick={typeOwn}>
              <b>My school isn't listed</b><span>Type its name instead</span>
            </li>
          ) : (
            <li key={`${opt[0]}|${opt[1]}`} id={`${uid}-opt-${i}`} className="scp-opt" role="option" aria-selected={active === i}
              onMouseDown={e => e.preventDefault()} onMouseEnter={() => setActive(i)} onClick={() => choose(opt)}>
              <b>{opt[0]}</b><span>{[opt[1], TYPE[opt[2]]].filter(Boolean).join(' · ')}</span>
            </li>
          )))}
        </ul>
      ) : (
        schools && <span className="scp-hint">{schools.length.toLocaleString()} schools in this state. <button type="button" className="scp-link" onClick={typeOwn} style={{ fontSize: 12.5 }}>Mine isn't listed</button></span>
      )}
    </div>
  )
}
