import { useState, useRef } from 'react'
import { Upload } from 'lucide-react'
import { adminApiPost } from '../lib/adminApi'

import { ui, chip, btn, note, FONT_B } from '../lib/adminUi'

const TYPE_OPTIONS = [
  { id: 'mcq',          label: 'Multiple choice' },
  { id: 'multi_select', label: 'Multiple select' },
  { id: 'numeric',      label: 'Numeric' },
  { id: 'short_text',   label: 'Short answer' },
  { id: 'hotspot',      label: 'Click region' },
  { id: 'image_label',  label: 'Label diagram' },
]


export default function AdminVisionScreen() {
  const [subject, setSubject] = useState('')
  const [topic, setTopic] = useState('')
  const [subtopic, setSubtopic] = useState('')
  const [count, setCount] = useState(4)
  const [types, setTypes] = useState(new Set(['mcq']))
  const [imageData, setImageData] = useState(null)   // { base64, mediaType, preview }
  const [imageUrl, setImageUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const fileRef = useRef(null)

  const onFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result)
      setImageData({ base64: dataUrl, mediaType: file.type, preview: dataUrl })
      setImageUrl('')
    }
    reader.readAsDataURL(file)
  }

  const toggleType = (id) => setTypes((prev) => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    if (next.size === 0) next.add('mcq')
    return next
  })

  const generate = async () => {
    setError(null); setResult(null)
    if (!subject.trim() || !subtopic.trim()) { setError('Subject and subtopic are required.'); return }
    if (!imageData && !imageUrl.trim()) { setError('Upload an image or paste an image URL.'); return }
    setLoading(true)
    try {
      const payload = {
        subject: subject.trim(),
        topic: topic.trim() || subtopic.trim(),
        subtopic: subtopic.trim(),
        count: Number(count) || 4,
        questionTypes: Array.from(types),
        autoApprove: true,
        ...(imageData
          ? { imageBase64: imageData.base64, mediaType: imageData.mediaType }
          : { imageUrl: imageUrl.trim() }),
      }
      const data = await adminApiPost('/api/generate-from-image', payload)
      setResult(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const preview = imageData?.preview || imageUrl

  return (
    <div style={{ maxWidth: 760, fontFamily: FONT_B, color: 'var(--t-text)', display: 'flex', flexDirection: 'column', gap: 18 }}>
      <p style={{ ...ui.hint, fontSize: 13, margin: 0 }}>
        Upload an exam figure, diagram, graph or map, or paste a link to one. AI reads the image and writes questions from it, including click-the-region and label-the-diagram questions. The image is attached to each question.
      </p>

      {/* Image input */}
      <div>
        <span style={ui.label}>Image</span>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" onClick={() => fileRef.current?.click()} style={{ ...btn('secondary'), display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Upload size={14} aria-hidden="true" /> Upload image
          </button>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" onChange={onFile} style={{ display: 'none' }} />
          <span style={ui.hint}>or</span>
          <input type="url" aria-label="Image link" value={imageUrl} onChange={(e) => { setImageUrl(e.target.value); setImageData(null) }} placeholder="Paste a public image link" style={{ ...ui.input, flex: 1, minWidth: 200 }} />
        </div>
        {preview && (
          <img src={preview} alt="The image questions will be written from" style={{ display: 'block', marginTop: 10, maxWidth: '100%', maxHeight: 260, borderRadius: 12, border: '1px solid var(--t-border)' }} />
        )}
      </div>

      <div className="av-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        <div>
          <label htmlFor="vis-subject" style={ui.label}>Subject</label>
          <input id="vis-subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Chemistry Stage 1" style={{ ...ui.input, width: '100%' }} />
        </div>
        <div>
          <label htmlFor="vis-topic" style={ui.label}>Topic <span style={{ fontWeight: 500, color: 'var(--t-textMuted)' }}>(optional)</span></label>
          <input id="vis-topic" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Cell biology" style={{ ...ui.input, width: '100%' }} />
        </div>
        <div>
          <label htmlFor="vis-subtopic" style={ui.label}>Subtopic</label>
          <input id="vis-subtopic" value={subtopic} onChange={(e) => setSubtopic(e.target.value)} placeholder="e.g. Organelles" style={{ ...ui.input, width: '100%' }} />
        </div>
        <div>
          <label htmlFor="vis-count" style={ui.label}>How many</label>
          <select id="vis-count" value={count} onChange={(e) => setCount(e.target.value)} style={{ ...ui.input, width: '100%' }}>
            {[2, 3, 4, 5, 8].map((c) => <option key={c} value={c}>{c} questions</option>)}
          </select>
        </div>
      </div>

      <div>
        <span style={ui.label}>Question formats</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {TYPE_OPTIONS.map((tp) => {
            const on = types.has(tp.id)
            return (
              <button key={tp.id} type="button" aria-pressed={on} onClick={() => toggleType(tp.id)} style={chip(on)}>{tp.label}</button>
            )
          })}
        </div>
      </div>

      <div>
        <button type="button" onClick={generate} disabled={loading} style={btn('primary', loading)}>
          {loading ? 'Reading the image…' : 'Write questions from this image'}
        </button>
      </div>

      {error && <div role="alert" style={note('danger')}>{error}</div>}
      {result && (
        <div role="status" style={note('success')}>
          Added {result.inserted} question{result.inserted !== 1 ? 's' : ''} {result.draft ? 'to the review queue' : 'straight to the live bank'} from this image.
        </div>
      )}
    </div>
  )
}
