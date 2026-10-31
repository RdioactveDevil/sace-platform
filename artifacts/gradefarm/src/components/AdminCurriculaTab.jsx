import { useState, useEffect, useCallback } from 'react'
import { listCurricula, createCurriculum, deleteCurriculum, setCurriculumArchived } from '../lib/curriculaDb'
import { fetchSubjectBankCounts } from '../lib/db'
import { adminApiPost, prepareCurriculumDoc } from '../lib/adminApi'
import { COHORT_LEVEL_OPTIONS, buildCanonicalCurriculumName } from '../lib/subjects'
import { ui, chip, btn, note, FONT_B } from '../lib/adminUi'

// Which subjects the list shows.
const SHOW = [
  ['all', 'All'],
  ['live', 'Live'],
  ['draft', 'Draft'],
  ['archived', 'Archived'],
]

function StatusBadge({ status }) {
  const map = {
    live:       ['Live', 'var(--t-success)'],
    generating: ['Generating', 'var(--t-textSub)'],
    draft:      ['Draft', 'var(--t-goldText)'],
    archived:   ['Archived', 'var(--t-textMuted)'],
  }
  const [label, color] = map[status] || map.draft
  return (
    <span className={status === 'generating' ? 'cu-pulse' : undefined} style={{ fontSize: 12.5, fontWeight: 700, color, animation: status === 'generating' ? 'curricPulse 1.5s ease-in-out infinite' : 'none' }}>
      {label}
    </span>
  )
}

export default function AdminCurriculaTab({ onSelectCurriculum }) {
  const [curricula, setCurricula]       = useState([])
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState('')
  const [showModal, setShowModal]       = useState(false)
  const [description, setDescription]  = useState('')
  const [uploadedDoc, setUploadedDoc]  = useState(null) // the picked File
  const [creating, setCreating]         = useState(false)
  const [createError, setCreateError]  = useState('')
  const [subjectTitle, setSubjectTitle] = useState('')
  const [cohortLevel, setCohortLevel]   = useState('')
  const [flagLatex, setFlagLatex]       = useState(true)
  const [flagGraphs, setFlagGraphs]     = useState(false)
  const [flagTables, setFlagTables]     = useState(false)

  const [bankCounts, setBankCounts]     = useState({})
  const [search, setSearch]             = useState('')
  const [show, setShow]                 = useState('all')
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const rows = await listCurricula()
      // Active subjects first, archived at the bottom.
      rows.sort((a, b) => Number(!!a.archived_at) - Number(!!b.archived_at))
      setCurricula(rows)
      fetchSubjectBankCounts(rows.map(c => ({ subject: c.name, levelLabel: c.level_label, curriculumId: c.id })))
        .then(setBankCounts)
        .catch(() => {})
    } catch (e) {
      if (!silent) setError(e.message)
    }
    if (!silent) setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const openModal = () => { setShowModal(true); setCreateError(''); setDescription(''); setUploadedDoc(null); setSubjectTitle(''); setCohortLevel(''); setFlagLatex(true); setFlagGraphs(false); setFlagTables(false) }
  const closeModal = () => { if (!creating) setShowModal(false) }

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0]
    if (file) setUploadedDoc(file)
  }

  const handleGeneratePlan = async () => {
    if (!subjectTitle.trim()) {
      setCreateError('Enter a short subject name (e.g. Mathematical Methods).')
      return
    }
    if (!cohortLevel) {
      setCreateError('Select Stage 1 / Stage 2 or a year level.')
      return
    }
    if (!description.trim() && !uploadedDoc) return
    setCreating(true)
    setCreateError('')
    try {
      let canonicalName
      try {
        canonicalName = buildCanonicalCurriculumName(subjectTitle.trim(), cohortLevel)
      } catch (err) {
        setCreateError(err.message || 'Invalid subject name or cohort.')
        setCreating(false)
        return
      }
      const payload = { subjectDescription: description.trim(), cohortLevel }
      if (uploadedDoc) Object.assign(payload, await prepareCurriculumDoc(uploadedDoc))
      const { topics } = await adminApiPost('/api/admin/curriculum-plan', payload)
      const subject_description = [description.trim(), uploadedDoc ? `Source: ${uploadedDoc.name}` : '']
        .filter(Boolean)
        .join('\n\n') || `Managed curriculum: ${canonicalName}`
      const id = await createCurriculum({
        name: canonicalName,
        subject_description,
        topics,
        level_label: cohortLevel,
        generation_flags: { latex: flagLatex, graphs: flagGraphs, tables: flagTables },
      })
      setShowModal(false)
      onSelectCurriculum(id)
    } catch (e) {
      setCreateError(e.message)
    }
    setCreating(false)
  }

  const handleArchive = async (e, c) => {
    e.stopPropagation()
    const archiving = !c.archived_at
    if (archiving && !window.confirm(`Archive "${c.name}"?\n\nStudents won't see it any more. Its topics, questions and student history are kept, and you can unarchive it any time.`)) return
    try {
      await setCurriculumArchived(c.id, archiving)
      await load(true)
    } catch (err) {
      setError(err.message)
    }
  }

  const handleDelete = async (e, c) => {
    e.stopPropagation()
    if (!window.confirm(`Permanently delete "${c.name}"?\n\nThis removes its topics, subtopics and uploaded resources and cannot be undone. Its questions stay in the database but are no longer attached to any subject.\n\nTo just hide it from students, use Archive instead.`)) return
    try {
      await deleteCurriculum(c.id)
      setCurricula(prev => prev.filter(x => x.id !== c.id))
    } catch (err) {
      setError(err.message)
    }
  }

  const fmtDate = (iso) => new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })

  const statusOf = (c) => (c.archived_at ? 'archived' : c.status)
  const counts = Object.fromEntries(SHOW.map(([id]) => [id, curricula.filter(c => id === 'all' || statusOf(c) === id || (id === 'draft' && statusOf(c) === 'generating')).length]))
  const shown = curricula
    .filter(c => show === 'all' || statusOf(c) === show || (show === 'draft' && statusOf(c) === 'generating'))
    .filter(c => !search.trim() || c.name.toLowerCase().includes(search.trim().toLowerCase()))
  const createDisabled = !subjectTitle.trim() || !cohortLevel || (!description.trim() && !uploadedDoc) || creating
  const modalInput = { ...ui.input, width: '100%', opacity: creating ? 0.6 : 1 }

  return (
    <div style={{ fontFamily: FONT_B, color: 'var(--t-textSub)', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <style>{`
        @keyframes curricPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
        @media (prefers-reduced-motion: reduce) { .cu-pulse { animation: none !important; } }
        .cu-row:hover { background: var(--t-bgHover); }
        .cu-row:focus-visible { outline: 2px solid var(--t-accent); outline-offset: -2px; }
      `}</style>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search subjects" aria-label="Search subjects" style={{ ...ui.input, flex: '1 1 200px', maxWidth: 320 }} />
        <div role="group" aria-label="Show" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {SHOW.map(([id, label]) => (
            <button key={id} type="button" aria-pressed={show === id} onClick={() => setShow(id)} style={chip(show === id)}>{label} · {counts[id]}</button>
          ))}
        </div>
        <button type="button" onClick={openModal} style={{ ...btn('primary'), marginLeft: 'auto' }}>New subject</button>
      </div>

      {error && <div role="alert" style={note('danger')}>{error}</div>}

      {loading ? (
        <div style={{ color: 'var(--t-textMuted)', fontSize: 13 }}>Loading subjects…</div>
      ) : curricula.length === 0 ? (
        <div style={ui.empty}>
          <div style={{ marginBottom: 12 }}>No subjects yet.</div>
          <button type="button" onClick={openModal} style={btn('secondary')}>Add your first subject</button>
        </div>
      ) : shown.length === 0 ? (
        <div style={ui.empty}>No subjects match.</div>
      ) : (
        <div style={{ ...ui.card, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
            <thead>
              <tr>
                <th style={ui.th}>Subject</th>
                <th style={ui.th}>Status</th>
                <th style={{ ...ui.th, textAlign: 'right' }}>Topics</th>
                <th style={{ ...ui.th, textAlign: 'right' }}>In the bank</th>
                <th style={ui.th}>Generated</th>
                <th style={{ ...ui.th, textAlign: 'right' }}>Added</th>
                <th style={ui.th}><span className="sr-only" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {shown.map(c => {
                const status = statusOf(c)
                const pct = c.questions_total > 0 ? Math.min(100, Math.round((c.questions_generated / c.questions_total) * 100)) : null
                return (
                  <tr key={c.id} className="cu-row" tabIndex={0} onClick={() => onSelectCurriculum(c.id)}
                    onKeyDown={e => { if (e.key === 'Enter') onSelectCurriculum(c.id) }}
                    style={{ cursor: 'pointer', opacity: c.archived_at ? 0.6 : 1 }}>
                    <td style={ui.td}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--t-text)' }}>{c.name}</div>
                      {(c.level_label || '').trim() && <div style={{ fontSize: 12, color: 'var(--t-textMuted)' }}>{c.level_label.trim()}</div>}
                    </td>
                    <td style={ui.td}><StatusBadge status={status} /></td>
                    <td style={{ ...ui.td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {c.topic_count}<span style={{ color: 'var(--t-textMuted)' }}> · {c.subtopic_count} sub</span>
                    </td>
                    <td style={{ ...ui.td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: bankCounts[c.name] ? 'var(--t-text)' : 'var(--t-textFaint)' }}>
                      {bankCounts[c.name] != null ? bankCounts[c.name].toLocaleString() : '—'}
                    </td>
                    <td style={ui.td}>
                      {pct == null || status === 'draft' ? <span style={{ color: 'var(--t-textFaint)' }}>—</span> : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 80, height: 5, borderRadius: 3, background: 'var(--t-bgSubtle)', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? 'var(--t-success)' : 'var(--t-text)', opacity: pct === 100 ? 1 : 0.55 }} />
                          </div>
                          <span style={{ fontSize: 12, color: 'var(--t-textMuted)', fontVariantNumeric: 'tabular-nums' }}>{c.questions_generated} of {c.questions_total}</span>
                        </div>
                      )}
                    </td>
                    <td style={{ ...ui.td, textAlign: 'right', color: 'var(--t-textMuted)', whiteSpace: 'nowrap' }}>{fmtDate(c.created_at)}</td>
                    <td style={{ ...ui.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button type="button" onClick={e => handleArchive(e, c)}
                        title={c.archived_at ? 'Show to students again' : 'Hide from students and keep everything'}
                        style={rowBtn()}>{c.archived_at ? 'Unarchive' : 'Archive'}</button>
                      <button type="button" onClick={e => handleDelete(e, c)} title="Delete this subject" style={rowBtn('var(--t-danger)')}>Delete</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* New subject */}
      {showModal && (
        <>
          <div onClick={closeModal} style={backdrop} />
          <div role="dialog" aria-modal="true" aria-labelledby="cu-new-title" style={modal}>
            <h3 id="cu-new-title" style={{ margin: '0 0 4px', color: 'var(--t-text)', fontSize: 17, fontWeight: 800 }}>New subject</h3>
            <p style={{ ...ui.hint, fontSize: 13, margin: '0 0 16px' }}>
              Name it, pick the stage or year level, then describe the course or upload a syllabus. AI drafts a topic and subtopic plan for that level, which you can edit before generating questions.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label htmlFor="cu-name" style={ui.label}>Subject name</label>
                <input id="cu-name" type="text" value={subjectTitle} onChange={e => setSubjectTitle(e.target.value)}
                  placeholder="e.g. Mathematical Methods, Biology" disabled={creating} style={modalInput} />
              </div>
              <div>
                <label htmlFor="cu-level" style={ui.label}>Stage or year level</label>
                <select id="cu-level" value={cohortLevel} onChange={e => setCohortLevel(e.target.value)} disabled={creating} style={modalInput}>
                  <option value="">Choose…</option>
                  {COHORT_LEVEL_OPTIONS.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
              <div>
                <span style={ui.label}>Questions can include</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, opacity: creating ? 0.6 : 1 }}>
                  {[
                    { key: 'latex',  val: flagLatex,  set: setFlagLatex,  label: 'Maths notation', desc: 'LaTeX in questions and solutions' },
                    { key: 'graphs', val: flagGraphs, set: setFlagGraphs, label: 'Graphs', desc: 'Function graphs where they help' },
                    { key: 'tables', val: flagTables, set: setFlagTables, label: 'Tables', desc: 'Data tables where they help' },
                  ].map(({ key, val, set, label, desc }) => (
                    <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: creating ? 'not-allowed' : 'pointer' }}>
                      <input type="checkbox" checked={val} onChange={e => set(e.target.checked)} disabled={creating}
                        style={{ width: 15, height: 15, accentColor: 'var(--t-text)', cursor: 'inherit' }} />
                      <span style={{ fontSize: 13, color: 'var(--t-text)', fontWeight: 600 }}>{label}</span>
                      <span style={{ fontSize: 12, color: 'var(--t-textMuted)' }}>{desc}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label htmlFor="cu-desc" style={ui.label}>Course description <span style={{ fontWeight: 500, color: 'var(--t-textMuted)' }}>(or upload a document below)</span></label>
                <textarea id="cu-desc" value={description} onChange={e => setDescription(e.target.value)}
                  placeholder="e.g. Calculus, logarithmic and exponential functions, discrete and continuous probability…"
                  rows={3} disabled={creating} style={{ ...modalInput, resize: 'vertical' }} />
              </div>
              <div>
                <span style={ui.label}>Curriculum document <span style={{ fontWeight: 500, color: 'var(--t-textMuted)' }}>(optional)</span></span>
                <label style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 12px', borderRadius: 9, cursor: creating ? 'not-allowed' : 'pointer',
                  border: uploadedDoc ? '1px solid var(--t-border)' : '1.5px dashed var(--t-borderStrong)',
                }}>
                  <input type="file" accept=".pdf,.txt" disabled={creating} onChange={handleFileUpload} style={{ display: 'none' }} />
                  <span style={{ fontSize: 13, color: uploadedDoc ? 'var(--t-text)' : 'var(--t-textMuted)', fontWeight: uploadedDoc ? 600 : 400 }}>
                    {uploadedDoc ? uploadedDoc.name : 'Choose a PDF or text file'}
                  </span>
                  {uploadedDoc && (
                    <button type="button" aria-label="Remove the document" onClick={e => { e.preventDefault(); setUploadedDoc(null) }} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--t-textMuted)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
                  )}
                </label>
              </div>
            </div>
            {createError && <div role="alert" style={{ ...note('danger'), marginTop: 12 }}>{createError}</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
              <button type="button" onClick={closeModal} disabled={creating} style={btn('secondary', creating)}>Cancel</button>
              <button type="button" onClick={handleGeneratePlan} disabled={createDisabled} style={btn('primary', createDisabled)}>
                {creating ? 'Drafting the plan…' : 'Draft topic plan'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const rowBtn = (color = 'var(--t-textSub)') => ({
  background: 'none', border: 'none', padding: '4px 6px', marginLeft: 4,
  color, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B,
})

const backdrop = {
  position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.45)',
}

const modal = {
  position: 'fixed', top: '50%', left: '50%',
  transform: 'translate(-50%, -50%)',
  zIndex: 1001, width: 500, maxWidth: 'calc(100vw - 32px)', maxHeight: 'calc(100vh - 32px)', overflowY: 'auto', boxSizing: 'border-box',
  background: 'var(--t-bgCard)', border: '1px solid var(--t-border)',
  borderRadius: 14, padding: 24, boxShadow: 'var(--t-shadowModal)',
  fontFamily: FONT_B,
}
