import { useState, useRef } from 'react'
import { adminApiPost } from '../lib/adminApi'

const GOLD = '#f1be43'
const FONT_B = "'Plus Jakarta Sans', sans-serif"

const TYPE_OPTIONS = [
  { id: 'mcq',          label: 'Multiple choice' },
  { id: 'multi_select', label: 'Multiple select' },
  { id: 'numeric',      label: 'Numeric' },
  { id: 'short_text',   label: 'Short answer' },
  { id: 'hotspot',      label: 'Click region' },
  { id: 'image_label',  label: 'Label diagram' },
]

const field = {
  width: '100%', padding: '10px 12px', borderRadius: 9, fontSize: 13, fontFamily: FONT_B,
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: '#f1f5f9', outline: 'none',
}
const labelStyle = { display: 'block', fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }

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
    <div style={{ maxWidth: 720, fontFamily: FONT_B, color: '#f1f5f9' }}>
      <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>Generate from Image</h2>
      <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 24, lineHeight: 1.6 }}>
        Upload an exam figure, diagram, graph or map (or paste an image URL). Claude reads the image and writes questions from it — including click-the-region and label-the-diagram formats. The image is hosted and attached to each question.
      </p>

      {/* Image input */}
      <div style={{ marginBottom: 20 }}>
        <label style={labelStyle}>Image</label>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
          <button onClick={() => fileRef.current?.click()} style={{ padding: '9px 16px', borderRadius: 9, border: `1px solid ${GOLD}55`, background: 'rgba(241,190,67,0.1)', color: GOLD, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B }}>
            ⬆ Upload image
          </button>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" onChange={onFile} style={{ display: 'none' }} />
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>or</span>
          <input type="url" value={imageUrl} onChange={(e) => { setImageUrl(e.target.value); setImageData(null) }} placeholder="Paste a public image URL" style={{ ...field, flex: 1, minWidth: 200 }} />
        </div>
        {preview && (
          <img src={preview} alt="Preview" style={{ maxWidth: '100%', maxHeight: 260, borderRadius: 12, border: '1px solid rgba(255,255,255,0.12)' }} />
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 18 }}>
        <div>
          <label style={labelStyle}>Subject</label>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Chemistry Stage 1" style={field} />
        </div>
        <div>
          <label style={labelStyle}>Topic (optional)</label>
          <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Cell biology" style={field} />
        </div>
        <div>
          <label style={labelStyle}>Subtopic</label>
          <input value={subtopic} onChange={(e) => setSubtopic(e.target.value)} placeholder="e.g. Organelles" style={field} />
        </div>
        <div>
          <label style={labelStyle}>How many</label>
          <select value={count} onChange={(e) => setCount(e.target.value)} style={field}>
            {[2, 3, 4, 5, 8].map((c) => <option key={c} value={c}>{c} questions</option>)}
          </select>
        </div>
      </div>

      <div style={{ marginBottom: 22 }}>
        <label style={labelStyle}>Question formats</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {TYPE_OPTIONS.map((tp) => {
            const on = types.has(tp.id)
            return (
              <button key={tp.id} onClick={() => toggleType(tp.id)}
                style={{ padding: '7px 13px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B,
                  background: on ? 'rgba(241,190,67,0.16)' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${on ? 'rgba(241,190,67,0.4)' : 'rgba(255,255,255,0.12)'}`,
                  color: on ? GOLD : 'rgba(255,255,255,0.6)' }}>
                {on ? `${tp.label} ✓` : tp.label}
              </button>
            )
          })}
        </div>
      </div>

      <button onClick={generate} disabled={loading}
        style={{ padding: '12px 28px', borderRadius: 10, border: 'none', background: loading ? 'rgba(255,255,255,0.08)' : GOLD, color: loading ? 'rgba(255,255,255,0.3)' : '#0c1037', fontSize: 14, fontWeight: 800, cursor: loading ? 'default' : 'pointer', fontFamily: FONT_B }}>
        {loading ? 'Reading image & generating…' : 'Generate questions from image'}
      </button>

      {error && <div style={{ marginTop: 14, padding: '12px 14px', borderRadius: 10, background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', color: '#f87171', fontSize: 13 }}>{error}</div>}
      {result && (
        <div style={{ marginTop: 14, padding: '14px 16px', borderRadius: 10, background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.3)', color: '#34d399', fontSize: 13 }}>
          ✓ Inserted {result.inserted} question{result.inserted !== 1 ? 's' : ''} {result.draft ? 'to the review queue' : 'into the live bank'} from this image.
        </div>
      )}
    </div>
  )
}
