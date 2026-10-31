import { useState, useEffect, useRef, useCallback } from 'react'
import {
  listCurriculumResources,
  uploadCurriculumResource,
  deleteCurriculumResource,
} from '../lib/curriculumResources'
import { FileText } from 'lucide-react'

import { btn, FONT_B } from '../lib/adminUi'

const RESOURCE_TYPES = [
  { value: 'textbook', label: 'Textbook' },
  { value: 'exam', label: 'Past exam' },
  { value: 'practice_test', label: 'Practice test' },
  { value: 'assessment', label: 'Assessment' },
  { value: 'notes', label: 'Notes' },
  { value: 'resource', label: 'Other' },
]

const STATUS_STYLE = {
  ready: { color: 'var(--t-success)', label: 'Ready' },
  processing: { color: 'var(--t-goldText)', label: 'Processing…' },
  failed: { color: 'var(--t-danger)', label: 'Failed' },
}

function fmtSize(bytes) {
  if (!bytes) return ''
  const mb = bytes / (1024 * 1024)
  return mb >= 1 ? `${Math.round(mb * 10) / 10} MB` : `${Math.round(bytes / 1024)} KB`
}

/**
 * Admin panel for attaching reference resources (textbooks, exams, practice
 * tests) to a curriculum. Each upload is distilled by Claude into per-subtopic
 * exemplar packs that are injected into question generation for this subject.
 */
export default function CurriculumResourcesPanel({ curriculumId }) {
  const [resources, setResources] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(null)
  const [file, setFile] = useState(null)
  const [resourceType, setResourceType] = useState('textbook')
  const [error, setError] = useState(null)
  const fileRef = useRef()

  const refresh = useCallback(async () => {
    try {
      setResources(await listCurriculumResources(curriculumId))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [curriculumId])

  useEffect(() => { refresh() }, [refresh])

  const handleFile = (f) => {
    if (f && f.type === 'application/pdf') { setFile(f); setError(null) }
    else setError('Please select a PDF file.')
  }

  const handleUpload = async () => {
    if (!file) return
    setUploading(true)
    setProgress(null)
    setError(null)
    try {
      await uploadCurriculumResource(curriculumId, file, {
        resourceType,
        onProgress: (done, total) => setProgress(total > 1 ? { done, total } : null),
      })
      setFile(null)
      if (fileRef.current) fileRef.current.value = ''
      await refresh()
    } catch (err) {
      setError(err.message)
      await refresh()
    } finally {
      setUploading(false)
      setProgress(null)
    }
  }

  const handleDelete = async (id) => {
    try {
      await deleteCurriculumResource(id)
      setResources(prev => prev.filter(r => r.id !== id))
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div style={{
      marginBottom: 20, padding: '14px 16px', borderRadius: 10,
      background: 'var(--t-bgCard)', border: '1px solid var(--t-border)',
    }}>
      <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--t-text)', marginBottom: 4 }}>
        Reference material
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--t-textMuted)', marginBottom: 12 }}>
        Textbooks, past exams or practice tests as PDFs, up to 50 MB. Big books are split into page ranges. AI works out which subtopics each covers and keeps example questions and style notes, which shape the questions it writes for this subject.
      </div>

      {/* Upload row */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <select
          value={resourceType}
          onChange={e => setResourceType(e.target.value)}
          style={{
            padding: '8px 10px', borderRadius: 8, border: '1px solid var(--t-border)',
            background: 'var(--t-bgInput)', color: 'var(--t-text)', fontSize: 13, fontFamily: FONT_B, outline: 'none',
          }}
        >
          {RESOURCE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>

        <button
          onClick={() => fileRef.current?.click()}
          style={{
            padding: '8px 14px', borderRadius: 9, border: file ? '1px solid var(--t-border)' : '1.5px dashed var(--t-borderStrong)',
            background: 'var(--t-bgCard)', color: file ? 'var(--t-text)' : 'var(--t-textMuted)',
            fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B, maxWidth: 260,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
        >
          {file ? <><FileText size={14} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 6 }} />{file.name}</> : 'Choose a PDF'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf"
          style={{ display: 'none' }}
          onChange={e => handleFile(e.target.files[0])}
        />

        <button
          onClick={handleUpload}
          disabled={!file || uploading}
          style={btn('primary', !file || uploading)}
        >
          {uploading ? 'Reading…' : 'Upload and read'}
        </button>
      </div>

      {uploading && (
        <div style={{ fontSize: 12, color: 'var(--t-textMuted)', marginBottom: 10 }}>
          {progress
            ? `Reading part ${progress.done} of ${progress.total}. Keep this tab open for whole textbooks.`
            : 'Reading the document. Large files can take a minute.'}
        </div>
      )}

      {/* Resource list */}
      {loading ? (
        <div style={{ fontSize: 12, color: 'var(--t-textMuted)' }}>Loading resources…</div>
      ) : resources.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--t-textMuted)' }}>No reference resources yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {resources.map(r => {
            const st = STATUS_STYLE[r.status] || STATUS_STYLE.processing
            const statusLabel = r.status === 'processing' && r.total_chunks > 1
              ? `Processing ${r.processed_chunks || 0}/${r.total_chunks}`
              : st.label
            const typeLabel = (RESOURCE_TYPES.find(t => t.value === r.resource_type) || {}).label || r.resource_type
            return (
              <div key={r.id} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8,
                background: 'var(--t-bgCard)', border: '1px solid var(--t-border)',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.title}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--t-textMuted)' }}>
                    {typeLabel}{r.file_size ? ` · ${fmtSize(r.file_size)}` : ''}
                    {r.status === 'ready' && ` · ${r.exemplar_count} exemplar pack${r.exemplar_count === 1 ? '' : 's'}`}
                  </div>
                  {r.status === 'failed' && r.error && (
                    <div style={{ fontSize: 11, color: 'var(--t-danger)', marginTop: 2 }} title={r.error}>
                      {r.error.length > 120 ? `${r.error.slice(0, 120)}…` : r.error}
                    </div>
                  )}
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: st.color, flexShrink: 0 }}>{statusLabel}</span>
                <button
                  onClick={() => handleDelete(r.id)}
                  title="Delete resource and its exemplars"
                  style={{
                    border: 'none', background: 'transparent', color: 'var(--t-textMuted)',
                    fontSize: 16, cursor: 'pointer', flexShrink: 0, lineHeight: 1,
                  }}
                >
                  ×
                </button>
              </div>
            )
          })}
        </div>
      )}

      {error && (
        <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 8, background: 'var(--t-dangerBg)', border: '1px solid var(--t-danger)', color: 'var(--t-danger)', fontSize: 12 }}>
          {error}
        </div>
      )}
    </div>
  )
}
