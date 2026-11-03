import { useState, useEffect, useRef, useCallback } from 'react'
import {
  listCurriculumResources,
  uploadCurriculumResource,
  deleteCurriculumResource,
  MAX_RESOURCE_BYTES,
} from '../lib/curriculumResources'
import { FileText, X } from 'lucide-react'

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
  // { fileIndex, fileTotal, name, done, total } while a batch uploads.
  const [progress, setProgress] = useState(null)
  const [files, setFiles] = useState([])
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

  // Adds picked files to the selection, skipping non-PDFs, files over the
  // size limit and files already picked.
  const handleFiles = (list) => {
    const picked = Array.from(list || [])
    if (fileRef.current) fileRef.current.value = ''
    if (picked.length === 0) return
    const skipped = []
    const ok = []
    for (const f of picked) {
      if (f.type !== 'application/pdf') skipped.push(`${f.name} (not a PDF)`)
      else if (f.size > MAX_RESOURCE_BYTES) skipped.push(`${f.name} (over 50 MB)`)
      else ok.push(f)
    }
    setFiles(prev => {
      const key = f => `${f.name}:${f.size}:${f.lastModified}`
      const have = new Set(prev.map(key))
      return [...prev, ...ok.filter(f => !have.has(key(f)))]
    })
    setError(skipped.length ? `Skipped ${skipped.join(', ')}.` : null)
  }

  const removeFile = (i) => setFiles(prev => prev.filter((_, j) => j !== i))

  // Uploads one file at a time (each is read by AI, and big books are read in
  // parts), carrying on past failures so one bad file doesn't stop the rest.
  const handleUpload = async () => {
    if (files.length === 0) return
    const batch = files
    setUploading(true)
    setProgress(null)
    setError(null)
    const failed = []
    for (let i = 0; i < batch.length; i++) {
      const file = batch[i]
      setProgress({ fileIndex: i + 1, fileTotal: batch.length, name: file.name, done: 0, total: 1 })
      try {
        await uploadCurriculumResource(curriculumId, file, {
          resourceType,
          onProgress: (done, total) => setProgress(p => ({ ...p, done, total })),
        })
        setFiles(prev => prev.filter(f => f !== file))
      } catch (err) {
        failed.push(`${file.name}: ${err.message}`)
      }
      await refresh()
    }
    if (failed.length) setError(`${failed.length} of ${batch.length} didn't upload. ${failed.join(' · ')}`)
    setUploading(false)
    setProgress(null)
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
        Textbooks, past exams or practice tests as PDFs, up to 50 MB each. Pick several at once to upload them together. Big books are split into page ranges. AI works out which subtopics each covers and keeps example questions and style notes, which shape the questions it writes for this subject.
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
          disabled={uploading}
          style={{
            padding: '8px 14px', borderRadius: 9, border: '1.5px dashed var(--t-borderStrong)',
            background: 'var(--t-bgCard)', color: 'var(--t-textMuted)',
            fontSize: 13, fontWeight: 700, cursor: uploading ? 'not-allowed' : 'pointer', fontFamily: FONT_B,
            opacity: uploading ? 0.6 : 1,
          }}
        >
          {files.length ? 'Add more PDFs' : 'Choose PDFs'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf"
          multiple
          style={{ display: 'none' }}
          onChange={e => handleFiles(e.target.files)}
        />

        <button
          onClick={handleUpload}
          disabled={files.length === 0 || uploading}
          style={btn('primary', files.length === 0 || uploading)}
        >
          {uploading ? 'Reading…' : files.length > 1 ? `Upload and read ${files.length} files` : 'Upload and read'}
        </button>
      </div>

      {/* Picked files, waiting to upload */}
      {files.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          {files.map((f, i) => {
            const current = uploading && progress?.name === f.name
            return (
              <span key={`${f.name}:${f.size}:${f.lastModified}`} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: 280, padding: '4px 6px 4px 9px', borderRadius: 999,
                border: `1px solid ${current ? 'var(--t-borderStrong)' : 'var(--t-border)'}`, background: 'var(--t-bgCard)',
                fontSize: 12, fontWeight: 600, color: current ? 'var(--t-text)' : 'var(--t-textMuted)',
              }}>
                <FileText size={13} aria-hidden="true" style={{ flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                <span style={{ flexShrink: 0, opacity: 0.75 }}>{fmtSize(f.size)}</span>
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  disabled={uploading}
                  aria-label={`Remove ${f.name}`}
                  style={{ border: 'none', background: 'transparent', color: 'inherit', padding: 2, display: 'inline-flex', cursor: uploading ? 'not-allowed' : 'pointer', opacity: uploading ? 0.4 : 1 }}
                >
                  <X size={13} aria-hidden="true" />
                </button>
              </span>
            )
          })}
        </div>
      )}

      {uploading && progress && (
        <div role="status" style={{ fontSize: 12, color: 'var(--t-textMuted)', marginBottom: 10 }}>
          {progress.fileTotal > 1 && `File ${progress.fileIndex} of ${progress.fileTotal}: ${progress.name}. `}
          {progress.total > 1
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
