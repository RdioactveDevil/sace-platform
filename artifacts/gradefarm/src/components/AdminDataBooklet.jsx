// Admin → Curricula → (subject) → Student features: the subject's official
// data booklet or formula sheet. Students see it in the quiz's Tools menu,
// as the PDF itself (QuizToolsDock), so they practise with exactly what the
// SACE Board or VCAA gives them in the exam. Nothing generic is shown when
// none is uploaded.

import { useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { confirmDialog } from '../lib/dialog'
import { btn, FONT_B } from '../lib/adminUi'

const BUCKET = 'data-booklets'
const MAX_BYTES = 20 * 1024 * 1024

/** What the booklet is usually called for this subject. */
export function defaultBookletTitle(subjectName) {
  return /math|method|specialist|general|essential|statist|calculus/i.test(subjectName || '') ? 'Formula sheet' : 'Data booklet'
}

export default function AdminDataBooklet({ curriculumId, name, booklet, onChange }) {
  const fileRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const official = /\bVCE\b|units?\s*\d/i.test(name || '') ? 'VCAA' : 'SACE Board'

  const upload = async (file) => {
    setError('')
    if (!file) return
    if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) { setError('Upload the booklet as a PDF.'); return }
    if (file.size > MAX_BYTES) { setError('That PDF is over 20 MB.'); return }
    setBusy(true)
    try {
      const path = `${curriculumId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: 'application/pdf', upsert: false })
      if (upErr) throw upErr
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
      const old = booklet?.path
      await onChange({ data_booklet: { url: data.publicUrl, path, name: file.name, title: booklet?.title || defaultBookletTitle(name) } })
      if (old && old !== path) supabase.storage.from(BUCKET).remove([old]).catch(() => {})
    } catch (e) {
      setError(`Couldn't upload: ${e.message || e}`)
    }
    setBusy(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  const remove = async () => {
    if (!(await confirmDialog('Students of this subject will no longer see it in Tools.', { title: 'Remove the data booklet?', confirm: 'Remove', danger: true }))) return
    const old = booklet?.path
    await onChange({ data_booklet: undefined })
    if (old) supabase.storage.from(BUCKET).remove([old]).catch(() => {})
  }

  const setTitle = (title) => {
    const v = title.trim().slice(0, 40)
    if (booklet && v !== (booklet.title || '')) onChange({ data_booklet: { ...booklet, title: v || defaultBookletTitle(name) } })
  }

  const input = {
    padding: '5px 8px', borderRadius: 6, border: '1px solid var(--t-border)',
    background: 'var(--t-bgInput)', color: 'var(--t-text)', fontSize: 13, fontFamily: FONT_B,
  }

  return (
    <div style={{ padding: '8px 0' }}>
      <div style={{ fontSize: 13, color: 'var(--t-text)', fontWeight: 600 }}>Official data booklet</div>
      <div style={{ fontSize: 12, color: 'var(--t-textMuted)', marginBottom: 8 }}>
        Upload the {official}'s own data booklet or formula sheet for this subject (PDF). Students open it from Tools in practice and Exam Mode, exactly as they'll get it in the exam. With none uploaded, students see only the calculator: there's no generic formula list or periodic table.
      </div>
      {booklet?.url ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <a href={booklet.url} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--t-text)' }}>{booklet.name || 'Booklet PDF'}</a>
          <label style={{ fontSize: 12, color: 'var(--t-textMuted)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            Shown as
            <input style={{ ...input, width: 140 }} defaultValue={booklet.title || defaultBookletTitle(name)} onBlur={e => setTitle(e.target.value)} aria-label="Name students see" />
          </label>
          <button type="button" style={btn('secondary', busy)} disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? 'Uploading…' : 'Replace'}</button>
          <button type="button" style={btn('secondary', busy)} disabled={busy} onClick={remove}>Remove</button>
        </div>
      ) : (
        <button type="button" style={btn('secondary', busy)} disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? 'Uploading…' : 'Upload PDF'}</button>
      )}
      <input ref={fileRef} type="file" accept="application/pdf,.pdf" hidden onChange={e => upload(e.target.files?.[0])} />
      {error && <div style={{ fontSize: 12, color: 'var(--t-danger)', marginTop: 6 }}>{error}</div>}
    </div>
  )
}
