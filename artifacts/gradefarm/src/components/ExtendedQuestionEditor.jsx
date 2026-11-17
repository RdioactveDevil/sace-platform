import { useEffect, useRef, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import MathText from './MathText'
import { btn, ui, FONT_B } from '../lib/adminUi'

/**
 * Edit a multi-part exam question (Section B of a loaded paper): the stem and
 * each part's label, question, marks and worked solution. Maths is typed as
 * LaTeX in $…$, with a preview under each box. onSave({ question, parts }).
 *
 * Optional: onChange(body) on every edit (a live preview), and
 * renderFigure(where, url, setUrl) to show and change the question's figure
 * (where '') and each part's (its label); body then carries the question's
 * image_url too.
 */
export default function ExtendedQuestionEditor({ question, onSave, onCancel, busy, onChange, renderFigure }) {
  const [stem, setStem] = useState(question.question || '')
  const [stemImage, setStemImage] = useState(question.image_url || null)
  const [parts, setParts] = useState(() => (Array.isArray(question.parts) && question.parts.length ? question.parts : [{ label: 'a', level: 1, text: '', marks: 1, solution: '' }])
    .map((p, i) => ({ key: i, label: p.label || '', level: p.level || 1, text: p.text || '', marks: p.marks ?? 0, solution: p.solution || '', image_url: p.image_url || null })))
  const set = (key, field, value) => setParts(prev => prev.map(p => (p.key === key ? { ...p, [field]: value } : p)))
  const body = () => ({
    question: stem,
    parts: parts.map(({ key, ...p }) => ({ ...p, marks: Number(p.marks) || 0 })),
    ...(renderFigure ? { image_url: stemImage } : {}),
  })
  const changed = useRef(onChange)
  changed.current = onChange
  useEffect(() => { changed.current?.(body()) }, [stem, parts, stemImage]) // eslint-disable-line react-hooks/exhaustive-deps
  const total = parts.reduce((s, p) => s + (Number(p.marks) || 0), 0)
  const box = { ...ui.input, width: '100%', fontSize: 13, resize: 'vertical' }
  const preview = (text) => text.trim() && (
    <div style={{ fontSize: 13, color: 'var(--t-textSub)', padding: '6px 2px 0', lineHeight: 1.6 }}><MathText text={text} /></div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontFamily: FONT_B }}>
      <label style={{ display: 'block' }}>
        <span style={ui.label}>Question (the stem, before the parts)</span>
        <textarea rows={3} value={stem} onChange={e => setStem(e.target.value)} style={box} />
        {preview(stem)}
      </label>
      {renderFigure
        ? renderFigure('', stemImage, setStemImage)
        : question.image_url && <img src={question.image_url} alt="The question's figure" style={{ maxWidth: 360, borderRadius: 8, border: '1px solid var(--t-border)' }} />}

      {parts.map((p, i) => (
        <div key={p.key} style={{ border: '1px solid var(--t-border)', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 8, marginLeft: (p.level - 1) * 18, background: 'var(--t-bgCard)' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--t-textMuted)' }}>Part
              <input value={p.label} onChange={e => set(p.key, 'label', e.target.value)} style={{ ...ui.input, width: 56, marginLeft: 6 }} aria-label={`Part ${i + 1} label`} />
            </label>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--t-textMuted)' }}>Level
              <select value={p.level} onChange={e => set(p.key, 'level', Number(e.target.value))} style={{ ...ui.input, marginLeft: 6 }} aria-label={`Part ${i + 1} level`}>
                <option value={1}>a, b, c</option><option value={2}>i, ii, iii</option><option value={3}>deeper</option>
              </select>
            </label>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--t-textMuted)' }}>Marks
              <input type="number" min={0} max={40} value={p.marks} onChange={e => set(p.key, 'marks', e.target.value === '' ? '' : Math.round(Number(e.target.value)))} style={{ ...ui.input, width: 64, marginLeft: 6 }} aria-label={`Part ${i + 1} marks`} />
            </label>
            <span style={{ flex: 1 }} />
            <button type="button" onClick={() => setParts(prev => prev.filter(x => x.key !== p.key))} disabled={parts.length < 2 || busy}
              aria-label={`Remove part ${p.label || i + 1}`} style={{ ...btn('secondary', parts.length < 2), padding: '5px 8px', display: 'inline-flex' }}><Trash2 size={14} aria-hidden="true" /></button>
          </div>
          <label style={{ display: 'block' }}><span style={{ ...ui.label, fontSize: 12 }}>Question</span>
            <textarea rows={2} value={p.text} onChange={e => set(p.key, 'text', e.target.value)} style={box} />
            {preview(p.text)}
          </label>
          {renderFigure
            ? renderFigure(p.label, p.image_url, (url) => set(p.key, 'image_url', url))
            : p.image_url && <img src={p.image_url} alt={`Figure for part ${p.label}`} style={{ maxWidth: 300, borderRadius: 8, border: '1px solid var(--t-border)' }} />}
          <label style={{ display: 'block' }}><span style={{ ...ui.label, fontSize: 12 }}>Worked solution</span>
            <textarea rows={3} value={p.solution} onChange={e => set(p.key, 'solution', e.target.value)} style={box} />
            {preview(p.solution)}
          </label>
        </div>
      ))}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" disabled={busy} onClick={() => setParts(prev => [...prev, { key: Date.now(), label: '', level: 1, text: '', marks: 1, solution: '', image_url: null }])}
          style={{ ...btn('secondary', busy), display: 'inline-flex', alignItems: 'center', gap: 6 }}><Plus size={14} aria-hidden="true" /> Add a part</button>
        <span style={{ flex: 1, fontSize: 12.5, color: 'var(--t-textMuted)' }}>{total} mark{total === 1 ? '' : 's'} in all</span>
        {onCancel && <button type="button" onClick={onCancel} disabled={busy} style={btn('secondary', busy)}>Cancel</button>}
        <button type="button" disabled={busy} style={btn('primary', busy)}
          onClick={() => onSave(body())}>
          {busy ? 'Saving…' : 'Save question'}
        </button>
      </div>
    </div>
  )
}
