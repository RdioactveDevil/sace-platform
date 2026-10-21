import { useEffect, useState } from 'react'
import { THEMES } from '../lib/theme'
import { fetchTutorProfile, saveTutorProfile } from '../lib/db'

const GOLD = '#f1be43'
const GOLDL = '#f9d87a'
const FONT_B = "'Plus Jakarta Sans', sans-serif"

const FIELDS = [
  { key: 'headline', label: 'Headline', max: 120, rows: 1, placeholder: 'e.g. SACE Chemistry & Maths Methods tutor · 6 years' },
  { key: 'subjects', label: 'Subjects you teach', max: 300, rows: 1, placeholder: 'e.g. Chemistry, Mathematical Methods, Physics' },
  { key: 'qualifications', label: 'Qualifications & experience', max: 1000, rows: 3, placeholder: 'e.g. BSc (Chemistry), University of Adelaide. 99.5 ATAR. Merit in Stage 2 Chemistry.' },
  { key: 'bio', label: 'About you', max: 2000, rows: 6, placeholder: 'How you teach, what students can expect from lessons, and how best to reach you.' },
]

/** Tutor portal → My Profile: what students see on their "My Tutor" page. */
export default function TutorProfileTab({ profile, theme }) {
  const t = THEMES[theme]
  const [values, setValues] = useState(null)
  const [saved, setSaved] = useState(null)
  const [state, setState] = useState(null) // 'saving' | 'saved' | error string

  useEffect(() => {
    fetchTutorProfile()
      .then(p => { const v = Object.fromEntries(FIELDS.map(f => [f.key, p?.[f.key] || ''])); setValues(v); setSaved(v) })
      .catch(e => setState(e.message || 'Could not load your profile.'))
  }, [])

  const dirty = values && saved && FIELDS.some(f => values[f.key] !== saved[f.key])
  const save = async (e) => {
    e.preventDefault()
    setState('saving')
    try {
      const p = await saveTutorProfile(values)
      const v = Object.fromEntries(FIELDS.map(f => [f.key, p?.[f.key] || '']))
      setValues(v); setSaved(v); setState('saved')
    } catch (err) { setState(err.message || 'Could not save.') }
  }

  const card = theme === 'dark'
    ? { background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 20 }
    : { background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 20, boxShadow: t.shadowCard }
  const input = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, border: `1px solid ${t.border}`, background: theme === 'dark' ? 'rgba(255,255,255,0.05)' : t.bgInput, color: t.text, fontSize: 14, fontFamily: FONT_B, outline: 'none', resize: 'vertical' }

  if (!values) {
    return <div style={{ ...card, padding: 24, color: typeof state === 'string' && state !== 'saving' ? t.danger : t.textMuted, fontSize: 13.5 }}>{state || 'Loading…'}</div>
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20, alignItems: 'start' }}>
      <form onSubmit={save} style={{ ...card, padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.55 }}>Your students see this on the <strong style={{ color: t.text }}>My Tutor</strong> page of their Student Portal.</div>
        {FIELDS.map(f => (
          <label key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, color: t.textSub }}>
              {f.label}
              <span style={{ fontWeight: 500, color: values[f.key].length > f.max * 0.9 ? t.danger : t.textMuted }}>{values[f.key].length}/{f.max}</span>
            </span>
            {f.rows === 1
              ? <input className="td-input-gold" value={values[f.key]} maxLength={f.max} placeholder={f.placeholder} onChange={e => { setValues(v => ({ ...v, [f.key]: e.target.value })); setState(null) }} style={input} />
              : <textarea className="td-input-gold" value={values[f.key]} maxLength={f.max} rows={f.rows} placeholder={f.placeholder} onChange={e => { setValues(v => ({ ...v, [f.key]: e.target.value })); setState(null) }} style={input} />}
          </label>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button type="submit" disabled={!dirty || state === 'saving'}
            style={{ padding: '10px 20px', borderRadius: 10, border: 'none', fontFamily: FONT_B, fontSize: 13.5, fontWeight: 800, cursor: !dirty || state === 'saving' ? 'default' : 'pointer',
              background: !dirty || state === 'saving' ? t.border : `linear-gradient(135deg,${GOLD},${GOLDL})`, color: !dirty || state === 'saving' ? t.textMuted : '#0c1037' }}>
            {state === 'saving' ? 'Saving…' : 'Save profile'}
          </button>
          {state === 'saved' && <span style={{ fontSize: 12.5, color: t.success, fontWeight: 600 }}>Saved</span>}
          {state && state !== 'saving' && state !== 'saved' && <span style={{ fontSize: 12.5, color: t.danger }}>{state}</span>}
        </div>
      </form>

      {/* Preview */}
      <div style={{ ...card, overflow: 'hidden' }}>
        <div style={{ padding: '10px 18px', fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', color: t.textMuted, borderBottom: `1px solid ${t.border}` }}>PREVIEW</div>
        <div style={{ padding: 20, display: 'flex', gap: 14, alignItems: 'center' }}>
          <div style={{ width: 54, height: 54, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 22, color: '#0c1037', background: `linear-gradient(135deg,${GOLD},${GOLDL})` }}>
            {(profile.display_name || '?')[0].toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: t.text }}>{profile.display_name}</div>
            <div style={{ fontSize: 13.5, color: values.headline ? t.textSub : t.textMuted }}>{values.headline || 'Add a headline'}</div>
          </div>
        </div>
        <div style={{ padding: '0 20px 20px', display: 'flex', flexDirection: 'column', gap: 14, fontSize: 13.5, lineHeight: 1.6 }}>
          <div><div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', color: t.textMuted, marginBottom: 4 }}>ABOUT</div><div style={{ color: values.bio ? t.text : t.textMuted, whiteSpace: 'pre-wrap' }}>{values.bio || 'Your bio appears here.'}</div></div>
          {values.subjects && <div><div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', color: t.textMuted, marginBottom: 4 }}>TEACHES</div><div style={{ color: t.text }}>{values.subjects}</div></div>}
          {values.qualifications && <div><div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', color: t.textMuted, marginBottom: 4 }}>QUALIFICATIONS</div><div style={{ color: t.text, whiteSpace: 'pre-wrap' }}>{values.qualifications}</div></div>}
        </div>
      </div>
    </div>
  )
}
