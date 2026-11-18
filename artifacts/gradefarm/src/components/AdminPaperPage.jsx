import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { stripSizeTags } from '../lib/textSize'
import { MATH_SCALES, mathScaleOf, stepMathScale, mathScaleLabel } from '../lib/mathScale'
import { appZoom } from '../lib/appZoom'
import { AlertTriangle, ArrowLeft, Crop, ExternalLink, Eye, FileText, Minus, PanelRightClose, PanelRightOpen, Plus, Trash2, Upload } from 'lucide-react'
import ExamPaper from './ExamPaper'
import CropTool from './CropTool'
import EditorTools, { useEditorSize } from './EditorTools'
import ExtendedQuestionEditor from './ExtendedQuestionEditor'
import { QuestionEditor } from './AdminQuestionPanel'
import { confirmDialog } from '../lib/dialog'
import { btn, note, FONT_B } from '../lib/adminUi'
import { groupLoadedPapers } from '../lib/examPapers'
import { groupSubject } from '../lib/homeSubjects'
import { isMathsSubject } from '../lib/examBuilder'
import { fillShared, setUnits } from '../lib/questionSets'
import { reviewFlags, reviewState, needsAttention, reviewSummary, paperStatus } from '../lib/questionChecks'
import { draftQuestion, changedFigures, originalNumber, previewSrc, isPendingImage } from '../lib/paperPage'
import {
  fetchLoadedPaperQuestions, fetchPaperPdfLinks, fetchReviewerNames, reviewQuestions, bulkEditQuestions,
  editQuestion, editExtendedQuestion, saveQuestionVisuals, figureChanged, uploadQuestionImage, updateQuestionSet, setQuestionMathScale,
} from '../lib/adminDb'

const PAGE_PX = 210 * 96 / 25.4 // an A4 page's width on screen at 100%
const strip = (name = '') => String(name).replace(/^(VCE|SACE)\s+/i, '').replace(/\s*(Units?\s*\d.*|Stage\s*\d.*)$/i, '').trim()
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : '')
const isMcq = (q) => q.exam_section === 'A' || q.question_type === 'mcq'
const STATE = { pending: ['To review', 'color-mix(in srgb, var(--t-accent) 20%, transparent)', 'var(--t-goldText)'], approved: ['Approved', 'var(--t-successBg)', 'var(--t-success)'], rejected: ['Rejected', 'var(--t-bgHover)', 'var(--t-textMuted)'] }

function Chip({ bg, fg, children }) {
  return <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: bg || 'var(--t-bgHover)', color: fg || 'var(--t-textMuted)', whiteSpace: 'nowrap' }}>{children}</span>
}
function StateChip({ q }) {
  if (!q.review_status) return null
  const [label, bg, fg] = STATE[reviewState(q)]
  return <Chip bg={bg} fg={fg}>{label}</Chip>
}

/** Questions (one, or a set sharing information) exactly as the exam builder prints them, scaled to the column. */
function Printed({ questions, meta, zoom }) {
  const exam = useMemo(() => ({ A: questions.filter(isMcq), B: questions.filter(x => !isMcq(x)) }), [questions])
  return <div style={{ zoom }}><ExamPaper exam={exam} meta={meta} /></div>
}

/**
 * The paper page takes the whole window: no app sidebar, subject header or
 * subject tools, just the paper and its own tools. It sits under the crop tool
 * (z-index 1000) and the app's dialogs and toasts.
 */
function Focus({ label, children }) {
  return (
    <div role="region" aria-label={label} style={{ position: 'fixed', inset: 0, zIndex: 900, overflow: 'auto', background: 'var(--t-bg)', padding: '16px 20px 24px' }}>
      {children}
    </div>
  )
}

/** A figure in the editor: what it is now, and crop it from the paper, upload one, or remove it. */
function FigureSlot({ where, url, canCrop, onCrop, onUpload, onRemove, title }) {
  const file = useRef(null)
  const name = title || (where ? `Part ${where}'s figure` : "The question's figure")
  const small = { ...btn('secondary'), padding: '5px 9px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }
  return (
    <div style={{ border: '1px dashed var(--t-borderMid, var(--t-border))', borderRadius: 9, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t-textMuted)' }}>{name}{isPendingImage(url) ? ' · not saved yet' : ''}</div>
      {url ? <img src={url} alt={name} style={{ maxWidth: '100%', maxHeight: 220, objectFit: 'contain', alignSelf: 'flex-start', background: '#fff', borderRadius: 6, border: '1px solid var(--t-border)' }} />
        : <div style={{ fontSize: 12.5, color: 'var(--t-textFaint)' }}>No figure.</div>}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button type="button" onClick={onCrop} disabled={!canCrop} title={canCrop ? undefined : "The paper's PDF isn't available for this paper, so it can't be cropped here. Upload an image instead."}
          style={{ ...small, ...(canCrop ? {} : { opacity: 0.5, cursor: 'not-allowed' }) }}><Crop size={13} aria-hidden="true" /> Crop from the paper</button>
        <button type="button" onClick={() => file.current?.click()} style={small}><Upload size={13} aria-hidden="true" /> Upload</button>
        {url && <button type="button" onClick={onRemove} style={small}><Trash2 size={13} aria-hidden="true" /> Remove</button>}
        <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onUpload(f) }} />
      </div>
    </div>
  )
}

/**
 * One loaded exam paper, at /admin/subjects/<id>/papers/<label>: its
 * questions, each previewed exactly as it prints (ExamPaper's preview), the
 * original PDF beside it, editing with the preview following each change,
 * figures cropped from the paper, and approving or rejecting each question.
 */
export default function AdminPaperPage({ curriculum, label, onBack }) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [pdf, setPdf] = useState(undefined) // undefined: looking; null: not available
  const [names, setNames] = useState(() => new Map())
  const [selectedId, setSelectedId] = useState(null)
  const [onlyAttention, setOnlyAttention] = useState(null) // null: decided once the paper loads
  const [whole, setWhole] = useState(false)
  const [zoom, setZoom] = useState(null) // null: fit the column
  const [side, setSide] = useState('pdf') // 'pdf' | 'editor' | 'hidden'
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(null) // the editor's latest draft, for the preview (debounced)
  const [cropping, setCropping] = useState(null) // { setUrl }
  const [sharedDraft, setSharedDraft] = useState(null) // { info, image } while editing a set's shared information
  const [editorSize, changeEditorSize] = useEditorSize()
  const lastField = useRef(null) // the edit box last typed in, for the symbol bar
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState(null)
  const latest = useRef(null) // the newest draft, before the debounce
  const baseline = useRef(null) // the draft as the editor opened, to tell if anything changed
  const pending = useRef(new Map()) // preview address → { blob, kind } for images not uploaded yet
  const [previewEl, setPreviewEl] = useState(null) // the preview column, once it's on screen
  const [fit, setFit] = useState(0.8)

  const load = useCallback(async () => {
    try {
      const all = await fetchLoadedPaperQuestions(curriculum.id)
      const paper = groupLoadedPapers(all).find(p => p.key === label)
      setRows(paper ? [...paper.a, ...paper.b] : [])
      setError('')
      const ids = (paper ? [...paper.a, ...paper.b] : []).map(q => q.reviewed_by).filter(Boolean)
      fetchReviewerNames(ids).then(setNames).catch(() => {})
    } catch (e) { setError(e.message || "The paper couldn't be loaded.") }
  }, [curriculum.id, label])
  useEffect(() => { load() }, [load])
  useEffect(() => { fetchPaperPdfLinks(curriculum.name).then(m => setPdf(m.get(label) || null)).catch(() => setPdf(null)) }, [curriculum.name, label])

  // Each question of a set with the set's shared information (kept on its first question).
  const questions = useMemo(() => fillShared(rows || []), [rows])
  const membersOf = useCallback((x) => (x?.set_key
    ? questions.filter(m => m.set_key === x.set_key).sort((a, b) => (Number(a.set_position) || 0) - (Number(b.set_position) || 0))
    : x ? [x] : []), [questions])
  const sum = useMemo(() => reviewSummary(questions), [questions])
  const status = useMemo(() => paperStatus(questions), [questions])
  // Once the paper loads: list only what needs checking if anything does, and open on its first question.
  useEffect(() => {
    if (!rows || onlyAttention !== null) return
    const first = rows.find(x => needsAttention(x)) || rows[0]
    setOnlyAttention(sum.attention > 0)
    if (first && !selectedId) setSelectedId(first.id)
  }, [rows, onlyAttention, sum.attention, selectedId])
  const visible = useMemo(() => (onlyAttention ? questions.filter(q => needsAttention(q)) : questions), [questions, onlyAttention])
  const q = onlyAttention === null ? null : questions.find(x => x.id === selectedId) || visible[0] || questions[0] || null
  useEffect(() => { if (q && q.id !== selectedId) setSelectedId(q.id) }, [q, selectedId])

  // The board and style the exam builder would print this subject in.
  const meta = useMemo(() => {
    const board = groupSubject({ name: curriculum.name, level: curriculum.level_label }).group === 'sace' ? 'sace' : 'vce'
    return { board, isMaths: isMathsSubject(curriculum.name), headerTitle: `GradeFarm Practice ${strip(curriculum.name)} Examination`, showSources: false, preview: true, numberOf: originalNumber }
  }, [curriculum.name, curriculum.level_label])

  // The preview follows the editor, a moment after typing stops.
  const debounce = useRef(null)
  const onDraft = useCallback((body) => {
    latest.current = body
    if (baseline.current === null) baseline.current = JSON.stringify(body)
    clearTimeout(debounce.current)
    debounce.current = setTimeout(() => setDraft(body), 250)
  }, [])
  useEffect(() => () => clearTimeout(debounce.current), [])
  const lead = q?.set_key ? (rows || []).filter(m => m.set_key === q.set_key).sort((a, b) => (Number(a.set_position) || 0) - (Number(b.set_position) || 0))[0] : null
  const sharedDirty = !!(editing && sharedDraft && lead && ((sharedDraft.info || '') !== (lead.shared_info || '') || (sharedDraft.image || null) !== (lead.shared_image_url || null)))
  const dirty = (editing && latest.current !== null && JSON.stringify(latest.current) !== baseline.current) || sharedDirty
  const shown = useMemo(() => (editing && draft ? draftQuestion(q, draft) : q), [editing, draft, q])
  // What the preview prints: the question, or its whole set, with any unsaved changes.
  const previewList = useMemo(() => {
    if (!q) return []
    const list = membersOf(q).map(m => (m.id === q.id ? shown : m))
    if (!editing || !sharedDraft || !q.set_key) return list
    return list.map(m => ({ ...m, shared_info: sharedDraft.info || null, shared_image_url: sharedDraft.image || null }))
  }, [q, shown, membersOf, editing, sharedDraft])

  useEffect(() => {
    if (!dirty) return
    const warn = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  })

  const stopEditing = () => {
    setEditing(false); setDraft(null); setSharedDraft(null); latest.current = null; baseline.current = null
    for (const url of pending.current.keys()) URL.revokeObjectURL(url.split('#')[0])
    pending.current.clear()
    setSide(s => (s === 'editor' ? 'pdf' : s))
  }
  /** True if it's fine to leave the current edit (nothing changed, or the admin says discard). */
  const leaveEdit = async () => {
    if (!editing) return true
    if (dirty && !(await confirmDialog('This question has changes that aren\'t saved. Discard them?', { confirm: 'Discard changes', danger: true }))) return false
    stopEditing()
    return true
  }
  const select = async (id) => { if (id !== q?.id && (await leaveEdit())) setSelectedId(id) }
  const back = async () => { if (await leaveEdit()) onBack() }
  const toggleWhole = async () => { if (await leaveEdit()) setWhole(w => !w) }

  // Fit the printed page to the preview column, and keep it fitted as the column changes size.
  useEffect(() => {
    const el = previewEl
    if (!el) return
    const measure = () => setFit(Math.max(0.3, Math.min(1.4, (el.clientWidth - 24) / PAGE_PX)))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [previewEl])
  const scale = zoom ?? fit

  const run = async (key, fn, ok) => {
    setBusy(key); setMsg(null)
    try { await fn(); setMsg({ ok: true, text: ok }); await load(); return true }
    catch (e) { setMsg({ ok: false, text: e.message || "That didn't work." }); return false }
    finally { setBusy('') }
  }
  const name = (x) => `${x.exam_section || (isMcq(x) ? 'A' : 'B')}${originalNumber(x)}`
  const review = (status) => run('review', () => reviewQuestions([q.id], status), status === 'approved' ? `Approved ${name(q)}.` : status === 'rejected' ? `Rejected ${name(q)}: students won't see it.` : `${name(q)} is back in review.`)
  // How big this question's maths prints. Saved straight away; the preview shows it at once.
  const changeMathScale = async (dir) => {
    const before = mathScaleOf(q)
    const k = stepMathScale(before, dir)
    if (k === before) return
    const id = q.id, qName = name(q)
    const put = (v) => setRows(rs => rs.map(r => (r.id === id ? { ...r, math_scale: v === 1 ? null : v } : r)))
    put(k); setMsg(null)
    try {
      await setQuestionMathScale(id, k)
      setMsg({ ok: true, text: `${qName}'s maths prints at ${mathScaleLabel(k)}${k === 1 ? ', the normal size' : ''}.` })
    } catch (e) {
      put(before)
      setMsg({ ok: false, text: e.message || "The maths size couldn't be saved." })
    }
  }
  const approveClean = async () => {
    if (!(await confirmDialog(`Approve the ${plural(sum.cleanPending.length, 'question')} in ${label} that the checks found nothing wrong with? They go to students straight away.`, { confirm: 'Approve' }))) return
    run('review', () => reviewQuestions(sum.cleanPending, 'approved'), `Approved ${plural(sum.cleanPending.length, 'question')}.`)
  }
  const deletePaper = async () => {
    if (!(await confirmDialog(`Delete ${label}? Its ${plural(questions.length, 'question')} come out of the bank and the exam builder. Practice exams already built from it just leave them out. This can't be undone.`, { confirm: 'Delete paper', danger: true }))) return
    if (await run('delete', () => bulkEditQuestions({ curriculumId: curriculum.id, ids: questions.map(x => x.id), action: 'delete' }), `Deleted ${label}.`)) onBack()
  }
  const startEdit = () => {
    baseline.current = null; latest.current = null; setDraft(null)
    setSharedDraft(lead ? { info: lead.shared_info || '', image: lead.shared_image_url || null } : null)
    setEditing(true); setSide('editor')
  }

  // ── Sets: the shared information, linking and breaking up ──────────────────
  const setName = (x) => {
    const ms = membersOf(x)
    return `${name(ms[0])}–${originalNumber(ms[ms.length - 1])}`
  }
  const saveShared = async () => {
    if (!lead || !sharedDraft) return
    setBusy('shared'); setMsg(null)
    try {
      let image = sharedDraft.image || null
      if (isPendingImage(image)) {
        const p = pending.current.get(image)
        if (!p) throw new Error('The figure chosen for the set is missing; choose it again.')
        image = await uploadQuestionImage(p.blob, { questionId: lead.id, where: 'set', kind: p.kind })
      }
      await updateQuestionSet(lead.id, { shared_info: sharedDraft.info || null, shared_image_url: image })
      setSharedDraft({ info: sharedDraft.info || '', image })
      setMsg({ ok: true, text: `Saved the shared information for ${setName(q)}.` })
      await load()
    } catch (e) {
      setMsg({ ok: false, text: e.message || "The shared information couldn't be saved." })
    } finally { setBusy('') }
  }
  // The next multiple-choice question in the paper, for linking.
  const nextMc = (() => {
    if (!q || !isMcq(q)) return null
    const mcs = questions.filter(isMcq).sort((a, b) => Number(originalNumber(a)) - Number(originalNumber(b)))
    const last = membersOf(q).slice(-1)[0]
    return mcs[mcs.findIndex(x => x.id === last.id) + 1] || null
  })()
  const linkNext = async () => {
    if (!nextMc || nextMc.set_key || !(await leaveEdit())) return
    const ms = membersOf(q)
    const key = q.set_key || q.id
    run('set', async () => {
      if (!q.set_key) await updateQuestionSet(q.id, { set_key: key, set_position: 1 })
      await updateQuestionSet(nextMc.id, { set_key: key, set_position: ms.length + 1 })
    }, `Linked ${name(nextMc)} into the set. Put the information they share in the set's shared information (Edit).`)
  }
  const breakUp = async () => {
    if (!q?.set_key || !(await leaveEdit())) return
    const ms = membersOf(q)
    const first = (rows || []).find(m => m.id === ms[0].id)
    if (!(await confirmDialog(`Break up the set ${setName(q)}? Its shared information goes back into ${name(first)}'s question, and the questions are no longer kept together.`, { confirm: 'Break up the set', danger: true }))) return
    run('set', async () => {
      if (first.shared_info) await editQuestion(first.id, { question: [first.shared_info, first.question].filter(Boolean).join('\n\n') })
      if (first.shared_image_url && !first.image_url) await saveQuestionVisuals(first.id, { source: 'live', graph: first.graph ?? null, table_data: first.table_data ?? null, image_url: first.shared_image_url })
      await updateQuestionSet(first.id, { set_key: null, set_position: null, shared_info: null, shared_image_url: null })
      for (const m of ms.slice(1)) await updateQuestionSet(m.id, { set_key: null, set_position: null })
    }, 'The set is broken up.')
  }

  const save = async (body) => {
    setBusy('edit'); setMsg(null)
    try {
      const up = async (url, where) => {
        if (!isPendingImage(url)) return url ?? null
        const p = pending.current.get(url)
        if (!p) throw new Error('An image chosen for this question is missing; choose it again.')
        return uploadQuestionImage(p.blob, { questionId: q.id, where, kind: p.kind })
      }
      const b = { ...body }
      if ('image_url' in b) b.image_url = await up(b.image_url, '')
      if (Array.isArray(b.parts)) b.parts = await Promise.all(b.parts.map(async p => ({ ...p, image_url: await up(p.image_url, p.label) })))
      const changed = changedFigures(q, b)
      if (Array.isArray(b.parts)) await editExtendedQuestion(q.id, { question: b.question, parts: b.parts })
      else await editQuestion(q.id, { question: b.question, options: b.options, answerIndex: b.answerIndex, solution: b.solution, ...(b.difficulty != null ? { difficulty: b.difficulty } : {}) })
      if (changed.includes('')) await saveQuestionVisuals(q.id, { source: 'live', graph: q.graph ?? null, table_data: q.table_data ?? null, image_url: b.image_url })
      for (const where of changed) await figureChanged(q.id, where)
      stopEditing()
      setMsg({ ok: true, text: `Saved ${name(q)}. It keeps its review status: approve it when it's right.` })
      await load()
    } catch (e) {
      setMsg({ ok: false, text: e.message || "The question couldn't be saved." })
    } finally { setBusy('') }
  }

  const pendingFile = (file, setUrl) => { const u = previewSrc(URL.createObjectURL(file), 'upload'); pending.current.set(u, { blob: file, kind: 'upload' }); setUrl(u) }
  const renderFigure = (where, url, setUrl) => (
    <FigureSlot where={where} url={url} canCrop={!!pdf}
      onCrop={() => setCropping({ setUrl })}
      onUpload={(file) => { const u = previewSrc(URL.createObjectURL(file), 'upload'); pending.current.set(u, { blob: file, kind: 'upload' }); setUrl(u) }}
      onRemove={() => setUrl(null)} />
  )

  // Up / down move through the list (not while typing).
  const onListKey = (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const i = visible.findIndex(x => x.id === q?.id)
    const next = visible[Math.min(visible.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1)))]
    if (next) select(next.id)
  }

  if (error) return <Focus label={label}><div role="alert" style={note('danger')}>{error}</div></Focus>
  if (!rows) return <Focus label={label}><div style={{ color: 'var(--t-textMuted)', fontSize: 13.5 }}>Loading the paper…</div></Focus>
  if (!questions.length) {
    return (
      <Focus label={label}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button type="button" onClick={onBack} style={{ ...btn('secondary'), alignSelf: 'flex-start', display: 'inline-flex', gap: 6, alignItems: 'center' }}><ArrowLeft size={14} /> Loaded papers</button>
          <div style={note('info')}>No questions are loaded for “{label}”.</div>
        </div>
      </Focus>
    )
  }

  if (!q) return <Focus label={label}><div style={{ color: 'var(--t-textMuted)', fontSize: 13.5 }}>Loading the paper…</div></Focus>

  const flags = shown ? reviewFlags(shown) : []
  const page = Number(q?.review?.page) || 0
  const statusText = status.state === 'checked'
    ? `Checked${status.lastAt ? ` ${fmtDate(status.lastAt)}` : ''}${status.lastBy && names.get(status.lastBy) ? ` by ${names.get(status.lastBy)}` : ''}`
    : status.state === 'partway' ? `${status.checked} of ${status.total} checked` : 'Not checked'
  const tool = { ...btn('secondary'), padding: '6px 10px', fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 5 }

  // One window tall in the app's own (zoomed) CSS pixels (lib/appZoom.js).
  const screenH = `calc(100vh / ${appZoom()})`
  return (
    <Focus label={label}>
    <div className="pp" style={{ display: 'flex', flexDirection: 'column', gap: 12, fontFamily: FONT_B, color: 'var(--t-text)', '--pp-h': screenH }}>
      <style>{`
        .pp-grid { display: grid; grid-template-columns: 230px minmax(0, 1fr) minmax(320px, 0.85fr); gap: 12px; align-items: start; }
        .pp-grid.no-side { grid-template-columns: 230px minmax(0, 1fr); }
        .pp-col { border: 1px solid var(--t-border); border-radius: 12px; background: var(--t-bgCard); min-width: 0; }
        .pp-sticky { position: sticky; top: 0; max-height: calc(var(--pp-h) - 40px); overflow: auto; }
        .pp-row { display: flex; gap: 8px; align-items: flex-start; width: 100%; text-align: left; padding: 8px 10px; border: 0; border-bottom: 1px solid var(--t-border); background: transparent; color: var(--t-text); cursor: pointer; font: inherit; }
        .pp-row[aria-current="true"] { background: var(--t-bgHover); box-shadow: inset 3px 0 0 var(--t-accent); }
        .pp-preview .xp-page { margin-bottom: 6mm; }
        @media (max-width: 1100px) { .pp-grid, .pp-grid.no-side { grid-template-columns: 1fr; } .pp-sticky { position: static; max-height: none; } .pp-list { max-height: 260px; overflow: auto; } }
      `}</style>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" onClick={back} style={tool}><ArrowLeft size={14} aria-hidden="true" /> Loaded papers</button>
        <div style={{ flex: '1 1 240px', minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 800, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {label}
            <Chip>{questions[0]?.source_kind === 'commercial' ? 'Trial' : 'Past paper'}</Chip>
            <Chip bg={status.state === 'checked' ? 'var(--t-successBg)' : status.state === 'partway' ? 'color-mix(in srgb, var(--t-accent) 20%, transparent)' : undefined}
              fg={status.state === 'checked' ? 'var(--t-success)' : status.state === 'partway' ? 'var(--t-goldText)' : undefined}>{statusText}</Chip>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--t-textMuted)', marginTop: 3 }}>
            {[sum.pending && `${sum.pending} to review`, sum.flagged && plural(sum.flagged, 'possible problem'), sum.rejected && `${sum.rejected} rejected`, plural(questions.length, 'question')].filter(Boolean).join(' · ')}
          </div>
        </div>
        <button type="button" onClick={toggleWhole} aria-pressed={whole} style={tool}><FileText size={14} aria-hidden="true" /> {whole ? 'One question' : 'Whole paper'}</button>
        {sum.cleanPending.length > 0 && <button type="button" onClick={approveClean} disabled={!!busy} style={{ ...tool, ...btn('secondary', !!busy) }}>Approve {sum.cleanPending.length} without problems</button>}
        <button type="button" onClick={deletePaper} disabled={!!busy} style={{ ...btn('danger', !!busy), padding: '6px 10px', fontSize: 12.5 }}>Delete paper</button>
      </div>
      {msg && <div role="status" style={note(msg.ok ? 'success' : 'danger')}>{msg.text}</div>}

      <div className={`pp-grid${side === 'hidden' ? ' no-side' : ''}`}>
        {/* Questions */}
        <div className="pp-col pp-sticky">
          <div style={{ padding: '10px 10px 8px', borderBottom: '1px solid var(--t-border)', fontSize: 12.5 }}>
            {sum.attention > 0 ? (
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                <input type="checkbox" checked={!!onlyAttention} onChange={e => setOnlyAttention(e.target.checked)} />
                Only the {sum.attention} that need checking
              </label>
            ) : <span style={{ color: 'var(--t-textMuted)' }}>Nothing needs checking.</span>}
          </div>
          <div className="pp-list" role="listbox" aria-label="Questions" tabIndex={0} onKeyDown={onListKey}>
            {visible.length === 0 && <div style={{ padding: 10, fontSize: 12.5, color: 'var(--t-textMuted)' }}>None left to check.</div>}
            {visible.map(x => {
              const fl = reviewFlags(x).length
              return (
                <button key={x.id} type="button" role="option" aria-selected={x.id === q?.id} aria-current={x.id === q?.id} className="pp-row" onClick={() => select(x.id)}>
                  <b style={{ fontSize: 12.5, minWidth: 30 }}>{name(x)}</b>
                  <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span style={{ fontSize: 12, color: 'var(--t-textSub)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stripSizeTags(x.question || x.parts?.find(p => p?.text)?.text || '').replace(/\$|\\ce\{|\}/g, '').slice(0, 70)}</span>
                    <span style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                      <StateChip q={x} />
                      {x.set_key && <Chip>Set {setName(x)}</Chip>}
                      {fl > 0 && reviewState(x) !== 'rejected' && reviewState(x) !== 'approved' && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color: 'var(--t-goldText)' }}><AlertTriangle size={11} aria-hidden="true" />{fl}</span>}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Printed preview */}
        <div className="pp-col" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <b style={{ fontSize: 13 }}>{whole ? 'Whole paper, as it prints' : q.set_key ? `Set ${setName(q)} as it prints` : `${name(q)} as it prints`}</b>
            {editing && (draft || sharedDirty) && !whole && <Chip bg="var(--t-blueBg)" fg="var(--t-blue)">Showing your unsaved changes</Chip>}
            <span style={{ flex: 1 }} />
            {!whole && (
              <span role="group" aria-label={`Maths size for ${name(q)}`} title="How big this question's equations print: superscripts, fractions, integrals and all"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, paddingRight: 8, marginRight: 2, borderRight: '1px solid var(--t-border)' }}>
                <span style={{ fontSize: 12, color: 'var(--t-textMuted)' }}>Maths</span>
                <button type="button" onClick={() => changeMathScale(-1)} disabled={mathScaleOf(q) === MATH_SCALES[0]} style={{ ...tool, ...(mathScaleOf(q) === MATH_SCALES[0] ? { opacity: 0.45, cursor: 'default' } : {}) }} aria-label="Smaller maths"><Minus size={13} /></button>
                <span aria-live="polite" style={{ fontSize: 12.5, fontWeight: 700, minWidth: 38, textAlign: 'center' }}>{mathScaleLabel(mathScaleOf(q))}</span>
                <button type="button" onClick={() => changeMathScale(1)} disabled={mathScaleOf(q) === MATH_SCALES[MATH_SCALES.length - 1]} style={{ ...tool, ...(mathScaleOf(q) === MATH_SCALES[MATH_SCALES.length - 1] ? { opacity: 0.45, cursor: 'default' } : {}) }} aria-label="Bigger maths"><Plus size={13} /></button>
              </span>
            )}
            <button type="button" onClick={() => setZoom(Math.max(0.3, scale / 1.2))} style={tool} aria-label="Zoom out"><Minus size={13} /></button>
            <button type="button" onClick={() => setZoom(null)} style={tool}>Fit</button>
            <button type="button" onClick={() => setZoom(Math.min(2, scale * 1.2))} style={tool} aria-label="Zoom in"><Plus size={13} /></button>
            {side === 'hidden'
              ? <button type="button" onClick={() => setSide(editing ? 'editor' : 'pdf')} style={tool}><PanelRightOpen size={14} aria-hidden="true" /> Show side panel</button>
              : <button type="button" onClick={() => setSide('hidden')} style={tool}><PanelRightClose size={14} aria-hidden="true" /> Hide side panel</button>}
          </div>
          <div ref={setPreviewEl} className="pp-preview" style={{ background: 'var(--t-bgSubtle)', borderRadius: 10, padding: 12, overflow: 'auto', maxHeight: 'calc(var(--pp-h) - 150px)' }}>
            {whole ? setUnits(visible).map(unit => (
              // A set prints together, as in a built exam.
              <div key={unit[0].id} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                  {unit.map(x => (
                    <button key={x.id} type="button" onClick={() => select(x.id)} style={{ ...tool, ...(x.id === q?.id ? { borderColor: 'var(--t-accent)' } : {}) }}>
                      {name(x)} <StateChip q={x} />
                    </button>
                  ))}
                </div>
                <Printed key={unit[0].id} questions={unit.length > 1 || unit[0].set_key ? membersOf(unit[0]).map(m => (m.id === q?.id ? shown : m)) : [unit[0].id === q?.id ? shown : unit[0]]} meta={meta} zoom={scale} />
              </div>
            )) : shown && <Printed key={q.set_key || shown.id} questions={previewList} meta={meta} zoom={scale} />}
          </div>

          {!whole && q && (
            <>
              {flags.length > 0 && reviewState(q) !== 'rejected' && (
                <div role="note" style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '8px 10px', borderRadius: 8, background: 'color-mix(in srgb, var(--t-accent) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--t-accent) 40%, transparent)', fontSize: 12.5 }}>
                  {flags.map((f, i) => (
                    <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                      <AlertTriangle size={13} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2, color: 'var(--t-goldText)' }} /><span>{f.message}</span>
                    </div>
                  ))}
                </div>
              )}
              {isMcq(q) && (q.set_key || (nextMc && !nextMc.set_key)) && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', fontSize: 12.5, color: 'var(--t-textMuted)' }}>
                  {q.set_key
                    ? <span>In set {setName(q)}: these questions share information and are always kept together.</span>
                    : <span>Shares information with {name(nextMc)}?</span>}
                  <span style={{ flex: 1 }} />
                  {nextMc && !nextMc.set_key && membersOf(q).slice(-1)[0]?.id && <button type="button" onClick={linkNext} disabled={!!busy} style={{ ...btn('secondary', !!busy), padding: '5px 10px', fontSize: 12 }}>Link with {name(nextMc)}</button>}
                  {q.set_key && <button type="button" onClick={breakUp} disabled={!!busy} style={{ ...btn('secondary', !!busy), padding: '5px 10px', fontSize: 12 }}>Break up this set</button>}
                </div>
              )}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <StateChip q={q} />
                {q.reviewed_at && reviewState(q) !== 'pending' && <span style={{ fontSize: 12, color: 'var(--t-textMuted)' }}>{fmtDate(q.reviewed_at)}{names.get(q.reviewed_by) ? ` by ${names.get(q.reviewed_by)}` : ''}</span>}
                <span style={{ flex: 1 }} />
                {reviewState(q) !== 'approved' && <button type="button" onClick={() => review('approved')} disabled={!!busy || dirty} title={dirty ? 'Save or discard your changes first' : undefined} style={{ ...btn('primary', !!busy || dirty), padding: '6px 12px', fontSize: 12.5 }}>Approve</button>}
                {reviewState(q) !== 'rejected' && <button type="button" onClick={() => review('rejected')} disabled={!!busy} style={{ ...btn('secondary', !!busy), padding: '6px 12px', fontSize: 12.5 }} title="Keep it out of exams and practice without deleting it">{q.review_status ? 'Reject' : 'Hide from students'}</button>}
                {!editing && <button type="button" onClick={startEdit} disabled={!!busy} style={{ ...btn('secondary', !!busy), padding: '6px 12px', fontSize: 12.5 }}>Edit</button>}
              </div>
            </>
          )}
        </div>

        {/* Original paper / editor */}
        {side !== 'hidden' && (
          <div className="pp-col pp-sticky" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {editing && (
              <div role="tablist" style={{ display: 'flex', gap: 6 }}>
                <button type="button" role="tab" aria-selected={side === 'editor'} onClick={() => setSide('editor')} style={{ ...tool, ...(side === 'editor' ? { borderColor: 'var(--t-accent)' } : {}) }}>Editor</button>
                <button type="button" role="tab" aria-selected={side === 'pdf'} onClick={() => setSide('pdf')} style={{ ...tool, ...(side === 'pdf' ? { borderColor: 'var(--t-accent)' } : {}) }}><Eye size={13} aria-hidden="true" /> Original</button>
              </div>
            )}
            {/* The editor stays mounted while the original is shown, so nothing typed is lost. */}
            {editing && q && (
              <div style={{ display: side === 'editor' ? 'block' : 'none' }}>
                <EditorTools getTarget={() => lastField.current} size={editorSize} onSize={changeEditorSize} />
                {/* The editing side at the chosen text size; the printed preview stays the real size. */}
                <div style={{ zoom: editorSize }} onFocusCapture={e => { if (e.target.matches?.('textarea, input:not([type]), input[type="text"]')) lastField.current = e.target }}>
                {q.set_key && sharedDraft && (
                  // The set's shared information lives on its first question; it's saved on its own.
                  <div style={{ border: '1px solid var(--t-border)', borderRadius: 10, padding: 12, marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--t-bgSubtle)' }}>
                    <div style={{ fontSize: 13, fontWeight: 800 }}>Shared information for set {setName(q)}</div>
                    <div style={{ fontSize: 12, color: 'var(--t-textMuted)' }}>Printed once, before the set's first question, after "Use the following information to answer Questions …". Don't include that sentence.</div>
                    <textarea rows={5} value={sharedDraft.info} onChange={e => setSharedDraft(d => ({ ...d, info: e.target.value }))} aria-label="Shared information"
                      style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 9, border: '1px solid var(--t-border)', background: 'var(--t-bgCard)', color: 'var(--t-text)', fontSize: 13, resize: 'vertical', fontFamily: 'inherit' }} />
                    <FigureSlot where="set" title="The set's shared figure" url={sharedDraft.image} canCrop={!!pdf}
                      onCrop={() => setCropping({ setUrl: (u) => setSharedDraft(d => ({ ...d, image: u })) })}
                      onUpload={(f) => pendingFile(f, (u) => setSharedDraft(d => ({ ...d, image: u })))}
                      onRemove={() => setSharedDraft(d => ({ ...d, image: null }))} />
                    <button type="button" onClick={saveShared} disabled={!sharedDirty || !!busy} style={{ ...btn('primary', !sharedDirty || !!busy), alignSelf: 'flex-start', padding: '6px 12px', fontSize: 12.5 }}>
                      {busy === 'shared' ? 'Saving…' : 'Save shared information'}
                    </button>
                  </div>
                )}
                {isMcq(q)
                  ? <QuestionEditor key={q.id} q={q} busy={busy === 'edit' ? 'edit' : ''} onSave={save} onCancel={async () => { await leaveEdit() }} onChange={onDraft} renderFigure={renderFigure} />
                  : <ExtendedQuestionEditor key={q.id} question={q} busy={busy === 'edit'} onSave={save} onCancel={async () => { await leaveEdit() }} onChange={onDraft} renderFigure={renderFigure} />}
                </div>
              </div>
            )}
            {(side === 'pdf' || !editing) && (
              pdf === undefined ? <div style={{ fontSize: 13, color: 'var(--t-textMuted)' }}>Finding the paper…</div>
                : pdf === null ? <div style={note('info')}>The original PDF isn't available for this paper (it was loaded from a link or an older batch). You can still edit, and upload figures.</div>
                  : (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                        <b>Original paper{page ? `, page ${page}` : ''}</b>
                        <span style={{ flex: 1 }} />
                        <a href={`${pdf}#page=${page || 1}`} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--t-text)' }}>Open in a tab <ExternalLink size={12} aria-hidden="true" /></a>
                      </div>
                      <iframe key={`${q?.id}-${page}`} title="The original paper" src={`${pdf}#page=${page || 1}&view=FitH`} style={{ width: '100%', height: 'calc(var(--pp-h) - 110px)', border: '1px solid var(--t-border)', borderRadius: 8, background: '#fff' }} />
                    </>
                  )
            )}
          </div>
        )}
      </div>

      {cropping && pdf && (
        <CropTool pdfUrl={pdf} startPage={page || 1} onCancel={() => setCropping(null)}
          onUse={(blob) => { const u = previewSrc(URL.createObjectURL(blob), 'crop'); pending.current.set(u, { blob, kind: 'crop' }); cropping.setUrl(u); setCropping(null) }} />
      )}
    </div>
    </Focus>
  )
}
