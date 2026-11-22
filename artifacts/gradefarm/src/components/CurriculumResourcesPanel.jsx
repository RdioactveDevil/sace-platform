import { useState, useEffect, useRef, useCallback } from 'react'
import {
  listCurriculumResources,
  uploadCurriculumResource,
  deleteCurriculumResource,
  MAX_RESOURCE_BYTES,
  RESOURCE_ACCEPT,
  resourceFileFormat,
} from '../lib/curriculumResources'
import { FileText, X } from 'lucide-react'

import { btn, FONT_B } from '../lib/adminUi'
import { guessResourceType } from '../lib/resourceTypes'

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
  // Picked files waiting to upload: [{ file, type }].
  const [files, setFiles] = useState([])
  const [resourceType, setResourceType] = useState('textbook')
  const [error, setError] = useState(null)
  const [dragOver, setDragOver] = useState(false)
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

  // Adds picked files to the selection, skipping files we can't read, files over the
  // size limit and files already picked.
  const handleFiles = (list) => {
    const picked = Array.from(list || [])
    if (fileRef.current) fileRef.current.value = ''
    if (picked.length === 0) return
    const skipped = []
    const ok = []
    for (const f of picked) {
      if (!resourceFileFormat(f)) skipped.push(`${f.name} (${/\.(doc|ppt)$/i.test(f.name) ? 'save it as .docx or .pptx first' : 'not a PDF, Word or PowerPoint file'})`)
      else if (f.size > MAX_RESOURCE_BYTES) skipped.push(`${f.name} (over 50 MB)`)
      else ok.push(f)
    }
    setFiles(prev => {
      const key = f => `${f.name}:${f.size}:${f.lastModified}`
      const have = new Set(prev.map(p => key(p.file)))
      return [...prev, ...ok.filter(f => !have.has(key(f))).map(file => ({ file, type: guessResourceType(file.name, resourceType) }))]
    })
    setError(skipped.length ? `Skipped ${skipped.join(', ')}.` : null)
  }

  const removeFile = (i) => setFiles(prev => prev.filter((_, j) => j !== i))
  const setFileType = (i, type) => setFiles(prev => prev.map((p, j) => (j === i ? { ...p, type } : p)))

  // Drag and drop: any number of files onto the panel.
  const onDragOver = (e) => { if (uploading) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; if (!dragOver) setDragOver(true) }
  const onDragLeave = (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false) }
  const onDrop = (e) => { e.preventDefault(); setDragOver(false); if (!uploading) handleFiles(e.dataTransfer.files) }

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
      const { file, type } = batch[i]
      setProgress({ fileIndex: i + 1, fileTotal: batch.length, name: file.name, done: 0, total: 1 })
      try {
        await uploadCurriculumResource(curriculumId, file, {
          resourceType: type,
          onProgress: (done, total) => setProgress(p => ({ ...p, done, total })),
        })
        setFiles(prev => prev.filter(p => p.file !== file))
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
        Textbooks, past exams, practice tests, notes or slides as PDF, Word (.docx) or PowerPoint (.pptx), up to 50 MB each. Drop in as many as you like and they upload one after another. Big books are split into parts. From Word and PowerPoint files AI reads the text, including equations and speaker notes, but not pictures: for diagram-heavy material, upload a PDF. AI works out which subtopics each covers and keeps example questions and style notes, which shape the questions it writes for this subject.
      </div>

      {/* Drop zone */}
      <div
        onDragOver={onDragOver} onDragEnter={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
        onClick={() => !uploading && fileRef.current?.click()}
        role="button" tabIndex={0} aria-label="Add files: drop them here or press to choose"
        onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && !uploading) { e.preventDefault(); fileRef.current?.click() } }}
        style={{
          marginBottom: 12, padding: '22px 16px', borderRadius: 12, textAlign: 'center',
          border: `2px dashed ${dragOver ? 'var(--t-accent)' : 'var(--t-borderStrong, var(--t-border))'}`,
          background: dragOver ? 'color-mix(in srgb, var(--t-accent) 10%, transparent)' : 'var(--t-bgSubtle)',
          cursor: uploading ? 'not-allowed' : 'pointer', opacity: uploading ? 0.6 : 1, transition: 'background 0.12s, border-color 0.12s',
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--t-text)' }}>{dragOver ? 'Drop to add them' : 'Drag PDF, Word or PowerPoint files here'}</div>
        <div style={{ fontSize: 12.5, color: 'var(--t-textMuted)', marginTop: 4 }}>
          or <span style={{ fontWeight: 700, color: 'var(--t-text)', textDecoration: 'underline' }}>{files.length ? 'choose more' : 'choose files'}</span>. As many as you like.
        </div>
      </div>

      {/* Upload row */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--t-textMuted)' }}>
          New files are
          <select
            value={resourceType}
            onChange={e => setResourceType(e.target.value)}
            title="Used when the file name doesn't say what it is. Each file's type can be changed below."
            style={{
              padding: '7px 10px', borderRadius: 8, border: '1px solid var(--t-border)',
              background: 'var(--t-bgInput)', color: 'var(--t-text)', fontSize: 13, fontFamily: FONT_B, outline: 'none',
            }}
          >
            {RESOURCE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>
        <input
          ref={fileRef}
          type="file"
          accept={RESOURCE_ACCEPT}
          multiple
          style={{ display: 'none' }}
          onChange={e => handleFiles(e.target.files)}
        />

        <span style={{ flex: 1 }} />
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
          {files.map(({ file: f, type }, i) => {
            const current = uploading && progress?.name === f.name
            return (
              <span key={`${f.name}:${f.size}:${f.lastModified}`} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: 380, padding: '4px 6px 4px 9px', borderRadius: 999,
                border: `1px solid ${current ? 'var(--t-borderStrong)' : 'var(--t-border)'}`, background: 'var(--t-bgCard)',
                fontSize: 12, fontWeight: 600, color: current ? 'var(--t-text)' : 'var(--t-textMuted)',
              }}>
                <FileText size={13} aria-hidden="true" style={{ flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                <span style={{ flexShrink: 0, opacity: 0.75 }}>{fmtSize(f.size)}</span>
                <select value={type} onChange={e => setFileType(i, e.target.value)} disabled={uploading} aria-label={`What ${f.name} is`}
                  style={{ flexShrink: 0, border: 'none', background: 'var(--t-bgHover)', color: 'var(--t-text)', borderRadius: 999, padding: '2px 6px', fontSize: 11.5, fontWeight: 700, fontFamily: FONT_B, cursor: 'pointer' }}>
                  {RESOURCE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
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
