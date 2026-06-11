import { useState, useEffect } from 'react'
import { THEMES } from '../lib/theme'
import {
  fetchRoster,
  fetchTutorClasses,
  fetchTutorResources,
  createTutorResource,
  deleteTutorResource,
  uploadTutorResourceFile,
  getTutorResourceDownloadUrl,
} from '../lib/db'

const GOLD   = '#f1be43'
const GOLDL  = '#f9d87a'
const FONT_B = "'Plus Jakarta Sans', sans-serif"

const RESOURCE_TYPES = [
  { id: 'notes',     label: 'Notes',      icon: '📝' },
  { id: 'worksheet', label: 'Worksheet',  icon: '📄' },
  { id: 'recording', label: 'Recording',  icon: '🎥' },
  { id: 'slides',    label: 'Slides',     icon: '📊' },
  { id: 'resource',  label: 'Resource',   icon: '📁' },
  { id: 'link',      label: 'Link',       icon: '🔗' },
]
const TYPE_META = Object.fromEntries(RESOURCE_TYPES.map(t => [t.id, t]))

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtSize(bytes) {
  if (!bytes && bytes !== 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`
}

export default function ResourcesTab({ profile, theme }) {
  const t = THEMES[theme]

  const [resources, setResources] = useState([])
  const [roster, setRoster]       = useState([])
  const [classes, setClasses]     = useState([])
  const [loading, setLoading]     = useState(true)
  const [showForm, setShowForm]   = useState(false)
  const [saving, setSaving]       = useState(false)
  const [uploadProgress, setUploadProgress] = useState(null)
  const [formError, setFormError] = useState('')
  const [status, setStatus]       = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [busyId, setBusyId]       = useState(null)

  const [form, setForm] = useState({
    source: 'file',          // 'file' | 'link'
    file: null,
    external_url: '',
    title: '',
    type: 'notes',
    description: '',
    target_mode: 'all',      // 'all' | 'class' | 'student'
    class_id: '',
    student_id: '',
    visible_to_students: true,
    notify: false,
  })

  const load = async () => {
    setLoading(true)
    try {
      const [res, ros, cls] = await Promise.all([
        fetchTutorResources().catch(() => []),
        fetchRoster(profile.id).catch(() => []),
        fetchTutorClasses().catch(() => []),
      ])
      setResources(res)
      setRoster(ros)
      setClasses(cls)
    } catch {}
    setLoading(false)
  }
  useEffect(() => { load() }, [profile.id])

  const resetForm = () => setForm({
    source: 'file', file: null, external_url: '', title: '', type: 'notes',
    description: '', target_mode: 'all', class_id: '', student_id: '',
    visible_to_students: true, notify: false,
  })

  const handleSubmit = async (e) => {
    e.preventDefault()
    setFormError('')
    setStatus(null)

    const title = form.title.trim()
    if (!title) { setFormError('Please give this resource a title.'); return }
    if (form.source === 'file' && !form.file) { setFormError('Please choose a file to upload.'); return }
    if (form.source === 'link') {
      if (!/^https?:\/\//i.test(form.external_url.trim())) { setFormError('Please enter a valid http(s) link.'); return }
    }
    if (form.target_mode === 'class' && !form.class_id) { setFormError('Please pick a class.'); return }
    if (form.target_mode === 'student' && !form.student_id) { setFormError('Please pick a student.'); return }

    setSaving(true)
    try {
      const payload = {
        title,
        type: form.type,
        description: form.description.trim() || null,
        kind: form.source,
        class_id: form.target_mode === 'class' ? form.class_id : null,
        student_id: form.target_mode === 'student' ? form.student_id : null,
        visible_to_students: form.visible_to_students,
        notify: form.notify,
      }

      if (form.source === 'file') {
        setUploadProgress(0)
        const up = await uploadTutorResourceFile(profile.id, form.file, setUploadProgress)
        payload.storage_path = up.storagePath
        payload.file_name = up.fileName
        payload.file_size = up.fileSize
        payload.mime_type = up.mimeType
      } else {
        payload.external_url = form.external_url.trim()
      }

      const result = await createTutorResource(payload)
      resetForm()
      setShowForm(false)
      await load()

      const recipients = result?.recipients ?? 0
      const notified = result?.notified ?? 0
      let msg = `Resource shared with ${recipients} student${recipients !== 1 ? 's' : ''}.`
      if (notified > 0) msg += ` ${notified} notified by email.`
      setStatus({ ok: true, msg })
      setTimeout(() => setStatus(null), 5000)
    } catch (err) {
      setFormError(err.message || 'Failed to save resource.')
    }
    setUploadProgress(null)
    setSaving(false)
  }

  const handleDelete = async (id) => {
    setDeletingId(id)
    try { await deleteTutorResource(id); await load() } catch {}
    setDeletingId(null)
  }

  const handleOpen = async (id) => {
    setBusyId(id)
    try {
      const url = await getTutorResourceDownloadUrl(id)
      if (url) window.open(url, '_blank', 'noopener,noreferrer')
    } catch {}
    setBusyId(null)
  }

  const targetLabel = (r) => {
    if (r.student_name) return `👤 ${r.student_name}`
    if (r.class_name) return `🏫 ${r.class_name}`
    return '👥 Entire roster'
  }

  const card = theme === 'dark'
    ? { background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 20, boxShadow: '0 4px 28px rgba(0,0,0,0.40)' }
    : { background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 16, boxShadow: t.shadowCard }
  const inputStyle = { padding: '9px 12px', borderRadius: 8, border: theme === 'dark' ? '1px solid rgba(255,255,255,0.10)' : `1px solid ${t.border}`, background: theme === 'dark' ? 'rgba(255,255,255,0.05)' : t.bgInput, color: t.text, fontSize: 13, fontFamily: FONT_B, outline: 'none', width: '100%', boxSizing: 'border-box' }
  const labelStyle = { fontSize: 11, fontWeight: 700, color: t.textMuted, letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Toolbar — page title lives in the shell top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
        <button
          onClick={() => { setShowForm(v => !v); setFormError('') }}
          style={{ padding: '10px 18px', borderRadius: 9, border: 'none', background: showForm ? t.bgHover : `linear-gradient(135deg,${GOLD},${GOLDL})`, color: showForm ? t.textMuted : '#0c1037', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: FONT_B }}
        >
          {showForm ? '✕ Cancel' : '+ Add resource'}
        </button>
      </div>

      {status && (
        <div style={{ padding: '12px 16px', borderRadius: 10, border: `1px solid ${status.ok ? '#4ade8040' : '#f8717140'}`, background: status.ok ? 'rgba(74,222,128,0.08)' : 'rgba(248,113,113,0.08)', fontSize: 13, color: status.ok ? '#4ade80' : '#f87171', fontWeight: 600 }}>
          {status.msg}
        </div>
      )}

      {showForm && (
        <div style={{ ...card, padding: '20px 22px' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: t.text, marginBottom: 16 }}>Add Resource</div>
          <form onSubmit={handleSubmit}>
            {/* Source toggle */}
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Source</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {[
                  { id: 'file', label: '⬆ Upload file' },
                  { id: 'link', label: '🔗 Paste link' },
                ].map(opt => {
                  const active = form.source === opt.id
                  return (
                    <button key={opt.id} type="button" onClick={() => setForm(f => ({ ...f, source: opt.id }))}
                      style={{ flex: 1, padding: '9px 12px', borderRadius: 8, border: `1px solid ${active ? GOLD : t.border}`, background: active ? 'rgba(241,190,67,0.15)' : 'transparent', color: active ? GOLD : t.textMuted, fontSize: 13, fontWeight: active ? 700 : 500, cursor: 'pointer', fontFamily: FONT_B }}>
                      {opt.label}
                    </button>
                  )
                })}
              </div>
              <div style={{ fontSize: 11, color: t.textMuted, marginTop: 6 }}>
                {form.source === 'file'
                  ? 'Notes, worksheets, slides, PDFs, images or video — up to 5 GB (large files upload resumably).'
                  : 'Best for recordings — paste a Zoom, Google Drive, Loom or YouTube link.'}
              </div>
            </div>

            {form.source === 'file' ? (
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>File</label>
                <input type="file" onChange={e => setForm(f => ({ ...f, file: e.target.files?.[0] || null }))} style={{ ...inputStyle, padding: '8px 10px' }} />
                {form.file && <div style={{ fontSize: 11, color: t.textMuted, marginTop: 6 }}>{form.file.name} · {fmtSize(form.file.size)}</div>}
              </div>
            ) : (
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>Link URL</label>
                <input type="url" value={form.external_url} onChange={e => setForm(f => ({ ...f, external_url: e.target.value }))} placeholder="https://…" style={inputStyle} />
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px', gap: 14, marginBottom: 14 }}>
              <div>
                <label style={labelStyle}>Title</label>
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Acids & Bases — class notes" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Type</label>
                <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} style={inputStyle}>
                  {RESOURCE_TYPES.map(rt => <option key={rt.id} value={rt.id}>{rt.icon} {rt.label}</option>)}
                </select>
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Description (optional)</label>
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} placeholder="A short note about this resource…" style={{ ...inputStyle, resize: 'vertical' }} />
            </div>

            {/* Share target */}
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Share with</label>
              <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                {[
                  { id: 'all',     label: 'Entire roster' },
                  { id: 'class',   label: `Class${classes.length > 0 ? ` (${classes.length})` : ''}` },
                  { id: 'student', label: 'Single student' },
                ].map(opt => {
                  const active = form.target_mode === opt.id
                  const disabled = opt.id === 'class' && classes.length === 0
                  return (
                    <button key={opt.id} type="button" disabled={disabled}
                      onClick={() => !disabled && setForm(f => ({ ...f, target_mode: opt.id, class_id: '', student_id: '' }))}
                      style={{ padding: '6px 13px', borderRadius: 20, border: `1px solid ${active ? GOLD : t.border}`, background: active ? 'rgba(241,190,67,0.15)' : 'transparent', color: disabled ? t.textFaint : active ? GOLD : t.textMuted, fontSize: 12, fontWeight: active ? 700 : 500, cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: FONT_B, opacity: disabled ? 0.5 : 1 }}>
                      {opt.label}
                    </button>
                  )
                })}
              </div>
              {form.target_mode === 'class' && (
                <select value={form.class_id} onChange={e => setForm(f => ({ ...f, class_id: e.target.value }))} style={{ ...inputStyle, maxWidth: 320 }}>
                  <option value="">— Choose a class —</option>
                  {classes.map(c => <option key={c.id} value={c.id}>{c.name} · {c.members.length} student{c.members.length !== 1 ? 's' : ''}</option>)}
                </select>
              )}
              {form.target_mode === 'student' && (
                <select value={form.student_id} onChange={e => setForm(f => ({ ...f, student_id: e.target.value }))} style={{ ...inputStyle, maxWidth: 320 }}>
                  <option value="">— Choose a student —</option>
                  {roster.map(s => <option key={s.student_id} value={s.student_id}>{s.profiles?.display_name || 'Unknown'}</option>)}
                </select>
              )}
            </div>

            {/* Options */}
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: t.text, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.visible_to_students} onChange={e => setForm(f => ({ ...f, visible_to_students: e.target.checked }))} style={{ accentColor: GOLD, width: 15, height: 15 }} />
                Visible to students
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: t.text, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.notify} onChange={e => setForm(f => ({ ...f, notify: e.target.checked }))} style={{ accentColor: GOLD, width: 15, height: 15 }} />
                Email students when shared
              </label>
            </div>

            {formError && <div style={{ marginBottom: 12, fontSize: 12, color: '#f87171' }}>{formError}</div>}

            {saving && form.source === 'file' && uploadProgress !== null && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ height: 8, borderRadius: 5, background: t.border, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${uploadProgress}%`, background: `linear-gradient(135deg,${GOLD},${GOLDL})`, borderRadius: 5, transition: 'width 0.2s' }} />
                </div>
                <div style={{ fontSize: 11, color: t.textMuted, marginTop: 5 }}>Uploading… {uploadProgress}%</div>
              </div>
            )}

            <button type="submit" disabled={saving} style={{ padding: '11px 24px', borderRadius: 9, border: 'none', background: saving ? t.border : `linear-gradient(135deg,${GOLD},${GOLDL})`, color: saving ? t.textMuted : '#0c1037', fontSize: 14, fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: FONT_B }}>
              {saving ? (form.source === 'file' ? (uploadProgress !== null && uploadProgress < 100 ? `Uploading… ${uploadProgress}%` : 'Finishing…') : 'Saving…') : 'Share Resource'}
            </button>
          </form>
        </div>
      )}

      <div style={card}>
        <div style={{ padding: '14px 20px', borderBottom: `1px solid ${t.border}` }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: t.text }}>Shared Resources</div>
          <div style={{ fontSize: 12, color: t.textMuted }}>{resources.length} resource{resources.length !== 1 ? 's' : ''}</div>
        </div>
        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: t.textMuted, fontSize: 13 }}>Loading…</div>
        ) : resources.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: t.textMuted, fontSize: 13 }}>No resources yet. Add notes, files or a recording link above.</div>
        ) : (
          <div>
            {resources.map(r => {
              const meta = TYPE_META[r.type] || TYPE_META.resource
              return (
                <div key={r.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '13px 20px', borderBottom: `1px solid ${t.border}` }}>
                  <div style={{ fontSize: 22, flexShrink: 0, lineHeight: 1.2 }}>{meta.icon}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: t.text }}>{r.title}</span>
                      <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, border: `1px solid ${GOLD}40`, background: 'rgba(241,190,67,0.12)', color: GOLD, fontWeight: 700, textTransform: 'uppercase' }}>{meta.label}</span>
                      {!r.visible_to_students && (
                        <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, border: `1px solid ${t.border}`, color: t.textMuted, fontWeight: 700, textTransform: 'uppercase' }}>Hidden</span>
                      )}
                    </div>
                    {r.description && <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 3 }}>{r.description}</div>}
                    <div style={{ fontSize: 11, color: t.textMuted }}>
                      {targetLabel(r)} · {fmtDate(r.created_at)}
                      {r.kind === 'file' && r.file_size != null ? ` · ${fmtSize(r.file_size)}` : ''}
                      {r.kind === 'link' ? ' · external link' : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <button onClick={() => handleOpen(r.id)} disabled={busyId === r.id}
                      style={{ padding: '6px 12px', borderRadius: 7, border: `1px solid ${GOLD}55`, background: 'rgba(241,190,67,0.1)', color: GOLD, fontSize: 12, fontWeight: 700, cursor: busyId === r.id ? 'not-allowed' : 'pointer', fontFamily: FONT_B }}>
                      {busyId === r.id ? '…' : r.kind === 'link' ? 'Open' : 'Download'}
                    </button>
                    <button onClick={() => handleDelete(r.id)} disabled={deletingId === r.id}
                      style={{ padding: '6px 11px', borderRadius: 7, border: '1px solid rgba(239,68,68,0.3)', background: 'transparent', color: '#f87171', fontSize: 12, cursor: deletingId === r.id ? 'not-allowed' : 'pointer', fontFamily: FONT_B }}>
                      {deletingId === r.id ? '…' : 'Delete'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
