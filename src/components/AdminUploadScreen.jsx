import { useState, useRef } from 'react'
import { adminApiPost } from '../lib/adminApi'

const FONT_B = "'Plus Jakarta Sans', sans-serif"
const GOLD   = '#f1be43'

/** ~3 MB raw PDF keeps base64+JSON under Vercel serverless ~4.5 MB body limit */
const MAX_PDF_BYTES = 3 * 1024 * 1024

const STAGES = ['Chemistry Stage 1', 'Chemistry Stage 2']

export default function AdminUploadScreen() {
  const [stage, setStage]     = useState('Chemistry Stage 1')
  const [file, setFile]       = useState(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult]   = useState(null)
  const [error, setError]     = useState(null)
  const fileRef = useRef()

  const handleFile = (f) => {
    if (f && f.type === 'application/pdf') { setFile(f); setResult(null); setError(null) }
    else setError('Please select a PDF file.')
  }

  const handleDrop = (e) => {
    e.preventDefault()
    handleFile(e.dataTransfer.files[0])
  }

  const handleSubmit = async () => {
    if (!file) return
    if (file.size > MAX_PDF_BYTES) {
      setError(
        `This PDF is too large for browser upload (${Math.round((file.size / (1024 * 1024)) * 10) / 10} MB). Use a file under ~3 MB, or split/compress the PDF so the upload stays within hosting limits.`
      )
      return
    }
    setLoading(true)
    setResult(null)
    setError(null)

    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result.split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(file)
      })

      const data = await adminApiPost('/api/extract-pdf', { base64, filename: file.name, stage })
      setResult(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h2 style={{ color: '#fff', marginTop: 0 }}>Upload PDF</h2>
      <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>
        Upload a SACE Chemistry exam or textbook. Claude will extract all MCQs into the draft queue.
        {' '}Use PDFs under ~3 MB so the upload fits hosting limits (base64 expands the file size).
      </p>

      {/* Stage selector */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ display: 'block', fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Stage</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {STAGES.map(s => (
            <button
              key={s}
              onClick={() => setStage(s)}
              style={{
                padding: '8px 16px', borderRadius: 8,
                border: `1px solid ${stage === s ? GOLD : 'rgba(255,255,255,0.12)'}`,
                background: stage === s ? 'rgba(241,190,67,0.1)' : 'transparent',
                color: stage === s ? GOLD : 'rgba(255,255,255,0.5)',
                fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B,
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
        onClick={() => fileRef.current?.click()}
        style={{
          border: `2px dashed ${file ? GOLD : 'rgba(255,255,255,0.15)'}`,
          borderRadius: 12,
          padding: '36px 24px',
          textAlign: 'center',
          cursor: 'pointer',
          background: file ? 'rgba(241,190,67,0.04)' : 'rgba(255,255,255,0.02)',
          marginBottom: 20,
          transition: 'all 0.15s',
        }}
      >
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf"
          style={{ display: 'none' }}
          onChange={e => handleFile(e.target.files[0])}
        />
        {file
          ? <span style={{ color: GOLD, fontWeight: 700, fontSize: 14 }}>📄 {file.name}</span>
          : <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 14 }}>Drop a PDF here or click to browse</span>
        }
      </div>

      <button
        onClick={handleSubmit}
        disabled={!file || loading}
        style={{
          padding: '12px 28px', borderRadius: 10, border: 'none',
          background: (!file || loading) ? 'rgba(255,255,255,0.08)' : GOLD,
          color: (!file || loading) ? 'rgba(255,255,255,0.3)' : '#0c1037',
          fontSize: 14, fontWeight: 800,
          cursor: (!file || loading) ? 'not-allowed' : 'pointer',
          fontFamily: FONT_B,
        }}
      >
        {loading ? 'Extracting…' : 'Extract Questions'}
      </button>

      {result && (
        <div style={{ marginTop: 20, padding: 16, borderRadius: 10, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)' }}>
          <div style={{ color: '#4ade80', fontWeight: 700 }}>
            ✓ {result.inserted} questions extracted
            {result.needs_review > 0 && ` (${result.needs_review} need topic review)`}
          </div>
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 4 }}>
            Go to the Review Queue tab to approve them.
          </div>
        </div>
      )}

      {error && (
        <div style={{ marginTop: 20, padding: 16, borderRadius: 10, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171', fontSize: 13 }}>
          {error}
        </div>
      )}
    </div>
  )
}
