import { useId } from 'react'
import { THEMES } from '../lib/theme'
import { confirmDialog } from '../lib/dialog'
import { QUESTION_TYPES, hasOptions, newItem, newOption, moveItem, changeType } from '../lib/questionnaireEdit'

const FONT_B = "'Plus Jakarta Sans', sans-serif"
export const Q_LIMITS = { items: 60, label: 300, help: 500, options: 20, optionLabel: 200, intro: 2000 }

/**
 * The editor for a pre-call questionnaire ({ intro, items }), used for the
 * tutor's own questionnaire and for a copy tailored to one student. It only
 * edits `value`; the parent saves it.
 */
export default function QuestionnaireEditor({ value, onChange, theme }) {
  const t = THEMES[theme]
  const dark = theme === 'dark'
  const uid = useId()
  const { intro, items } = value

  const card = { background: 'var(--t-bgCard)', border: '1px solid var(--t-border)', borderRadius: 12 }
  const inputStyle = { width: '100%', padding: '10px 14px', borderRadius: 9, border: dark ? '1px solid var(--t-border)' : `1px solid ${t.border}`, background: dark ? 'var(--t-bgSubtle)' : t.bg, color: t.text, fontFamily: FONT_B, fontSize: 13, outline: 'none', boxSizing: 'border-box' }
  const labelStyle = { fontSize: 12, fontWeight: 700, color: t.textMuted, display: 'block', marginBottom: 6 }
  const smallBtn = { padding: '6px 12px', borderRadius: 7, border: `1px solid ${t.border}`, background: 'transparent', color: t.text, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B }
  const iconBtn = disabled => ({ ...smallBtn, padding: '6px 10px', color: t.textMuted, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.4 : 1 })
  const checkLabel = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: t.textMuted, fontWeight: 600, cursor: 'pointer', fontFamily: FONT_B }

  const setItems = next => onChange({ ...value, items: next })
  const patch = (i, p) => setItems(items.map((it, k) => (k === i ? { ...it, ...p } : it)))
  const setOptions = (i, options) => patch(i, { options })
  const atLimit = items.length >= Q_LIMITS.items

  const remove = async i => {
    const it = items[i]
    const name = it.label.trim() ? `"${it.label.trim()}"` : 'this question'
    if (await confirmDialog(`Delete ${name}?`, { confirm: 'Delete', cancel: 'Keep it', danger: true })) {
      setItems(items.filter((_, k) => k !== i))
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <label htmlFor={`${uid}-intro`} style={labelStyle}>Introduction <span style={{ fontWeight: 400, color: t.textFaint }}>(shown above the questions)</span></label>
        <textarea id={`${uid}-intro`} className="td-input-gold" rows={3} maxLength={Q_LIMITS.intro} value={intro} onChange={e => onChange({ ...value, intro: e.target.value })} style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }} />
      </div>

      {items.length === 0 && (
        <div style={{ ...card, padding: 24, textAlign: 'center', color: t.textMuted, fontSize: 13 }}>No questions yet. Add one below.</div>
      )}

      {items.map((it, i) => {
        const isSection = it.type === 'section'
        const opts = it.options || []
        return (
          <div key={it.id} style={card}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--t-border)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: t.text }}>{isSection ? 'Section' : `Question ${items.slice(0, i + 1).filter(x => x.type !== 'section').length}`}</span>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button type="button" aria-label={`Move item ${i + 1} up`} disabled={i === 0} onClick={() => setItems(moveItem(items, i, -1))} style={iconBtn(i === 0)}>Up</button>
                <button type="button" aria-label={`Move item ${i + 1} down`} disabled={i === items.length - 1} onClick={() => setItems(moveItem(items, i, 1))} style={iconBtn(i === items.length - 1)}>Down</button>
                <button type="button" aria-label={`Delete item ${i + 1}`} onClick={() => remove(i)} style={{ ...smallBtn, color: t.danger, border: `1px solid ${t.danger}59` }}>Delete</button>
              </div>
            </div>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                <div>
                  <label htmlFor={`${uid}-${it.id}-type`} style={labelStyle}>Type</label>
                  <select id={`${uid}-${it.id}-type`} className="td-input-gold" value={it.type} onChange={e => setItems(items.map((x, k) => (k === i ? changeType(x, e.target.value) : x)))} style={inputStyle}>
                    {QUESTION_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div style={{ gridColumn: 'span 2', minWidth: 0 }}>
                  <label htmlFor={`${uid}-${it.id}-label`} style={labelStyle}>{isSection ? 'Heading' : 'Question'}</label>
                  <input id={`${uid}-${it.id}-label`} className="td-input-gold" maxLength={Q_LIMITS.label} value={it.label} onChange={e => patch(i, { label: e.target.value })} style={inputStyle} />
                </div>
              </div>

              {!isSection && (
                <div>
                  <label htmlFor={`${uid}-${it.id}-help`} style={labelStyle}>Hint <span style={{ fontWeight: 400, color: t.textFaint }}>(optional)</span></label>
                  <input id={`${uid}-${it.id}-help`} className="td-input-gold" maxLength={Q_LIMITS.help} value={it.help || ''} onChange={e => patch(i, { help: e.target.value })} style={inputStyle} />
                </div>
              )}

              {hasOptions(it.type) && (
                <div>
                  <div style={labelStyle}>Choices <span style={{ fontWeight: 400, color: t.textFaint }}>— tick "Red flag" on a choice you want to be told about</span></div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {opts.map((o, k) => (
                      <div key={o.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <input aria-label={`Choice ${k + 1} of item ${i + 1}`} className="td-input-gold" maxLength={Q_LIMITS.optionLabel} value={o.label} onChange={e => setOptions(i, opts.map(x => (x.id === o.id ? { ...x, label: e.target.value } : x)))} style={{ ...inputStyle, flex: 1, minWidth: 160, width: 'auto' }} />
                        <label style={checkLabel}>
                          <input type="checkbox" checked={!!o.flag} onChange={e => setOptions(i, opts.map(x => {
                            if (x.id !== o.id) return x
                            const { flag, ...rest } = x
                            return e.target.checked ? { ...rest, flag: true } : rest
                          }))} />
                          Red flag
                        </label>
                        <button type="button" aria-label={`Remove choice ${k + 1} of item ${i + 1}`} disabled={opts.length <= 1} onClick={() => setOptions(i, opts.filter(x => x.id !== o.id))} style={iconBtn(opts.length <= 1)}>Remove</button>
                      </div>
                    ))}
                  </div>
                  {opts.length < Q_LIMITS.options && (
                    <button type="button" onClick={() => setOptions(i, [...opts, newOption()])} style={{ ...smallBtn, marginTop: 10 }}>Add choice</button>
                  )}
                </div>
              )}

              {!isSection && (
                <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
                  <label style={checkLabel}>
                    <input type="checkbox" checked={!!it.required} onChange={e => patch(i, { required: e.target.checked })} />
                    Required
                  </label>
                  {hasOptions(it.type) && (
                    <label style={checkLabel}>
                      <input type="checkbox" checked={!!it.other} onChange={e => patch(i, { other: e.target.checked })} />
                      Allow "Other" with a text box
                    </label>
                  )}
                </div>
              )}
            </div>
          </div>
        )
      })}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" disabled={atLimit} onClick={() => setItems([...items, newItem('short')])} style={{ ...smallBtn, padding: '9px 16px', opacity: atLimit ? 0.5 : 1, cursor: atLimit ? 'not-allowed' : 'pointer' }}>Add question</button>
        <button type="button" disabled={atLimit} onClick={() => setItems([...items, newItem('section')])} style={{ ...smallBtn, padding: '9px 16px', opacity: atLimit ? 0.5 : 1, cursor: atLimit ? 'not-allowed' : 'pointer' }}>Add section</button>
        <span style={{ fontSize: 11, color: t.textFaint }}>{items.length} of {Q_LIMITS.items}</span>
      </div>
    </div>
  )
}
