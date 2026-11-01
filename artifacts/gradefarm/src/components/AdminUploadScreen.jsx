import { useState, useEffect, useRef } from 'react'
import { adminApiPost } from '../lib/adminApi'
import { fetchLiveCurricula } from '../lib/curriculaDb'
import { supabase } from '../lib/supabase'
import { FileText } from 'lucide-react'

import { ui, chip, btn, note, FONT_B } from '../lib/adminUi'

/** 50 MB — file goes to Supabase Storage, not base64 through Vercel */
const MAX_PDF_BYTES = 50 * 1024 * 1024

export default function AdminUploadScreen() {
  const [stageOptions, setStageOptions] = useState([])
  const [stage, setStage]     = useState('')
  const [file, setFile]       = useState(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult]   = useState(null)
  const [error, setError]     = useState(null)
  const fileRef = useRef()

  useEffect(() => {
    fetchLiveCurricula()
      .then(curricula => {
        // All live curricula from DB are available for upload
        const opts = curricula.map(c => ({ value: c.name, label: c.name }))
        setStageOptions(opts)
        if (opts.length > 0) setStage(opts[0].value)
      })
      .catch(() => {})
  }, [])

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
      setError(`PDF too large (${Math.round((file.size / (1024 * 1024)) * 10) / 10} MB). Max 50 MB.`)
      return
    }
    setLoading(true)
    setResult(null)
    setError(null)

    try {
      // Upload PDF to Supabase Storage so the API receives only a path, not the raw bytes
      const storagePath = `pdf-uploads/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      const { error: upErr } = await supabase.storage.from('admin-uploads').upload(storagePath, file, {
        contentType: 'application/pdf',
        upsert: false,
      })
      if (upErr) throw new Error(`Storage upload failed: ${upErr.message}`)

      const data = await adminApiPost('/api/extract-pdf', { storagePath, filename: file.name, stage })
      setResult(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 760, fontFamily: FONT_B, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <p style={{ ...ui.hint, fontSize: 13, margin: 0 }}>
        Upload a past exam or textbook as a PDF, up to 50 MB. AI pulls out the multiple-choice questions and puts them in the review queue.
      </p>

      {/* Stage selector */}
      <div>
        <span style={ui.label}>Stage</span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {stageOptions.map(opt => (
            <button key={opt.value} type="button" aria-pressed={stage === opt.value} onClick={() => setStage(opt.value)} style={chip(stage === opt.value)}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        aria-label={file ? `Chosen file: ${file.name}. Choose another` : 'Choose a PDF'}
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
        onClick={() => fileRef.current?.click()}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileRef.current?.click() } }}
        style={{
          border: `1.5px dashed ${file ? 'var(--t-text)' : 'var(--t-borderStrong)'}`,
          borderRadius: 12,
          padding: '32px 24px',
          textAlign: 'center',
          cursor: 'pointer',
          background: 'var(--t-bgCard)',
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
          ? <span style={{ color: 'var(--t-text)', fontWeight: 700, fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 6 }}><FileText size={16} aria-hidden="true" /> {file.name}</span>
          : <span style={{ color: 'var(--t-textMuted)', fontSize: 14 }}>Drop a PDF here, or click to choose one</span>
        }
      </div>

      <div>
        <button type="button" onClick={handleSubmit} disabled={!file || loading} style={btn('primary', !file || loading)}>
          {loading ? 'Reading the PDF…' : 'Pull out questions'}
        </button>
      </div>

      {result && (
        <div role="status" style={note('success')}>
          <div style={{ fontWeight: 700 }}>
            {result.inserted} question{result.inserted === 1 ? '' : 's'} added to the review queue
            {result.needs_review > 0 ? `, ${result.needs_review} without a clear topic` : ''}.
          </div>
          <div style={{ color: 'var(--t-textSub)', marginTop: 4 }}>Approve them in Review queue before students see them.</div>
        </div>
      )}

      {error && <div role="alert" style={note('danger')}>{error}</div>}
    </div>
  )
}
