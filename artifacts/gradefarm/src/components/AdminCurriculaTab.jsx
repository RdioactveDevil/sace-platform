import { useState, useEffect, useCallback } from 'react'
import { listCurricula, createCurriculum, seedBuiltInSubjectsIfNeeded, deleteCurriculum } from '../lib/curriculaDb'
import { adminApiPost } from '../lib/adminApi'
import { BUILT_IN_CURRICULA } from '../lib/builtInCurricula'
import { COHORT_LEVEL_OPTIONS, buildCanonicalCurriculumName } from '../lib/subjects'

const BUILT_IN_SUBJECTS = BUILT_IN_CURRICULA.map(c => ({
  name: c.name,
  description: c.description,
  generation_flags: c.generationFlags,
  topics: c.topics,
}))

const FONT_B = "'Plus Jakarta Sans', sans-serif"
const GOLD   = '#f1be43'

function StatusBadge({ status }) {
  const map = {
    live:       { bg: 'rgba(74,222,128,0.1)',  border: 'rgba(74,222,128,0.3)',  color: '#4ade80' },
    generating: { bg: 'rgba(56,189,248,0.1)',  border: 'rgba(56,189,248,0.3)',  color: '#38bdf8' },
    draft:      { bg: 'rgba(241,190,67,0.1)',  border: 'rgba(241,190,67,0.3)',  color: GOLD },
  }
  const s = map[status] || map.draft
  return (
    <span style={{
      padding: '2px 9px', borderRadius: 999, fontSize: 11, fontWeight: 700,
      background: s.bg, border: `1px solid ${s.border}`, color: s.color,
      textTransform: 'capitalize',
      animation: status === 'generating' ? 'curricPulse 1.5s ease-in-out infinite' : 'none',
    }}>
      {status}
    </span>
  )
}

export default function AdminCurriculaTab({ onSelectCurriculum }) {
  const [curricula, setCurricula]       = useState([])
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState('')
  const [showModal, setShowModal]       = useState(false)
  const [description, setDescription]  = useState('')
  const [uploadedDoc, setUploadedDoc]  = useState(null) // { base64, mediaType, name }
  const [creating, setCreating]         = useState(false)
  const [createError, setCreateError]  = useState('')
  const [subjectTitle, setSubjectTitle] = useState('')
  const [cohortLevel, setCohortLevel]   = useState('')
  const [flagLatex, setFlagLatex]       = useState(true)
  const [flagGraphs, setFlagGraphs]     = useState(false)
  const [flagTables, setFlagTables]     = useState(false)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      await seedBuiltInSubjectsIfNeeded(BUILT_IN_SUBJECTS)
      setCurricula(await listCurricula())
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
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      const base64 = result.split(',')[1]
      setUploadedDoc({ base64, mediaType: file.type || 'application/pdf', name: file.name })
    }
    reader.readAsDataURL(file)
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
      if (uploadedDoc) { payload.base64Doc = uploadedDoc.base64; payload.mediaType = uploadedDoc.mediaType }
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

  const handleDelete = async (e, c) => {
    e.stopPropagation()
    if (!window.confirm(`Delete "${c.name}"? This cannot be undone.`)) return
    try {
      await deleteCurriculum(c.id)
      setCurricula(prev => prev.filter(x => x.id !== c.id))
    } catch (err) {
      setError(err.message)
    }
  }

  const fmtDate = (iso) => new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <div style={{ fontFamily: FONT_B, color: '#e2e8f0' }}>
      <style>{`
        @keyframes curricPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.45; }
        }
      `}</style>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 18, color: GOLD }}>Curricula</h2>
        <button onClick={openModal} style={goldBtn}>
          + New Curriculum
        </button>
      </div>

      {error && <div style={errorBox}>{error}</div>}

      {loading ? (
        <div style={{ color: '#64748b', fontSize: 13 }}>Loading curricula…</div>
      ) : curricula.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '64px 24px',
          border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 14,
          color: '#64748b', fontSize: 14,
        }}>
          <div style={{ marginBottom: 16 }}>No curricula yet.</div>
          <button onClick={openModal} style={outlineBtn}>Add your first subject</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {curricula.map(c => (
            <div
              key={c.id}
              onClick={() => onSelectCurriculum(c.id)}
              style={card}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#f1f5f9', lineHeight: 1.3, flex: 1 }}>{c.name}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <StatusBadge status={c.status} />
                  <button
                    onClick={e => handleDelete(e, c)}
                    title="Delete curriculum"
                    style={{
                      background: 'none', border: '1px solid rgba(248,113,113,0.2)',
                      borderRadius: 5, color: 'rgba(248,113,113,0.5)', fontSize: 13,
                      cursor: 'pointer', width: 22, height: 22, display: 'flex',
                      alignItems: 'center', justifyContent: 'center', padding: 0,
                      flexShrink: 0,
                    }}
                    onMouseEnter={e => { e.currentTarget.style.color = '#f87171'; e.currentTarget.style.borderColor = 'rgba(248,113,113,0.5)' }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'rgba(248,113,113,0.5)'; e.currentTarget.style.borderColor = 'rgba(248,113,113,0.2)' }}
                  >
                    ×
                  </button>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 14, fontSize: 12, color: '#64748b', marginBottom: 10 }}>
                <span>{c.topic_count} topic{c.topic_count !== 1 ? 's' : ''}</span>
                <span>{c.subtopic_count} subtopic{c.subtopic_count !== 1 ? 's' : ''}</span>
                {(c.level_label || '').trim() ? (
                  <span style={{ color: GOLD }}>{(c.level_label || '').trim()}</span>
                ) : null}
              </div>
              {c.status !== 'draft' && c.questions_total > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden', marginBottom: 4 }}>
                    <div style={{
                      height: '100%', borderRadius: 2, background: '#4ade80',
                      width: `${Math.min(100, Math.round((c.questions_generated / c.questions_total) * 100))}%`,
                      transition: 'width 0.4s',
                    }} />
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>
                    {c.questions_generated} / {c.questions_total} questions generated
                  </div>
                </div>
              )}
              <div style={{ fontSize: 11, color: '#475569' }}>{fmtDate(c.created_at)}</div>
            </div>
          ))}
        </div>
      )}

      {/* New Curriculum Modal */}
      {showModal && (
        <>
          <div onClick={closeModal} style={backdrop} />
          <div style={modal}>
            <h3 style={{ margin: '0 0 6px', color: '#f1f5f9', fontSize: 16 }}>New Curriculum</h3>
            <p style={{ margin: '0 0 14px', color: '#64748b', fontSize: 13, lineHeight: 1.6 }}>
              Name the subject, choose Stage 1 / Stage 2 or a year level (required), then describe the course or upload a syllabus. Claude will generate a topic and subtopic plan scoped to that cohort.
            </p>
            <label style={{ display: 'block', fontSize: 11, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Subject name (short)
            </label>
            <input
              type="text"
              value={subjectTitle}
              onChange={e => setSubjectTitle(e.target.value)}
              placeholder="e.g. Mathematical Methods, Biology, Specialist Mathematics"
              disabled={creating}
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 9,
                border: '1px solid rgba(255,255,255,0.12)',
                background: '#0c1037', color: '#f1f5f9',
                fontSize: 13, fontFamily: FONT_B, outline: 'none',
                boxSizing: 'border-box', marginBottom: 10,
                opacity: creating ? 0.6 : 1,
              }}
            />
            <label style={{ display: 'block', fontSize: 11, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Stage / year level *
            </label>
            <select
              value={cohortLevel}
              onChange={e => setCohortLevel(e.target.value)}
              disabled={creating}
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 9,
                border: '1px solid rgba(255,255,255,0.12)',
                background: '#0c1037', color: '#f1f5f9',
                fontSize: 13, fontFamily: FONT_B, outline: 'none',
                boxSizing: 'border-box', marginBottom: 12,
                opacity: creating ? 0.6 : 1,
              }}
            >
              <option value="">Select…</option>
              {COHORT_LEVEL_OPTIONS.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
            <label style={{ display: 'block', fontSize: 11, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Question features
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14, opacity: creating ? 0.6 : 1 }}>
              {[
                { key: 'latex',  val: flagLatex,  set: setFlagLatex,  label: 'LaTeX',  desc: 'Mathematical notation in questions and solutions' },
                { key: 'graphs', val: flagGraphs, set: setFlagGraphs, label: 'Graphs', desc: 'AI generates function graphs when relevant' },
                { key: 'tables', val: flagTables, set: setFlagTables, label: 'Tables', desc: 'AI generates data tables when relevant' },
              ].map(({ key, val, set, label, desc }) => (
                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: creating ? 'not-allowed' : 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={val}
                    onChange={e => set(e.target.checked)}
                    disabled={creating}
                    style={{ width: 15, height: 15, accentColor: '#f1be43', cursor: 'inherit' }}
                  />
                  <span style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 600 }}>{label}</span>
                  <span style={{ fontSize: 12, color: '#64748b' }}>{desc}</span>
                </label>
              ))}
            </div>
            <label style={{ display: 'block', fontSize: 11, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Course description (optional if uploading a document)
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="e.g. SACE coverage: calculus, logarithmic/exponential functions, discrete and continuous probability…"
              rows={3}
              disabled={creating}
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 9,
                border: '1px solid rgba(255,255,255,0.12)',
                background: '#0c1037', color: '#f1f5f9',
                fontSize: 13, fontFamily: FONT_B, outline: 'none',
                resize: 'vertical', boxSizing: 'border-box',
                opacity: creating ? 0.6 : 1,
              }}
            />
            <div style={{ marginTop: 10 }}>
              <label style={{ display: 'block', fontSize: 11, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Upload curriculum document (optional)
              </label>
              <label style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 12px', borderRadius: 8, cursor: creating ? 'not-allowed' : 'pointer',
                border: uploadedDoc ? '1px solid rgba(74,222,128,0.3)' : '1px dashed rgba(255,255,255,0.15)',
                background: uploadedDoc ? 'rgba(74,222,128,0.05)' : 'transparent',
              }}>
                <input type="file" accept=".pdf,.txt" disabled={creating} onChange={handleFileUpload} style={{ display: 'none' }} />
                <span style={{ fontSize: 13, color: uploadedDoc ? '#4ade80' : '#64748b' }}>
                  {uploadedDoc ? `✓ ${uploadedDoc.name}` : 'Choose PDF or text file…'}
                </span>
                {uploadedDoc && (
                  <button onClick={e => { e.preventDefault(); setUploadedDoc(null) }} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
                )}
              </label>
            </div>
            {createError && <div style={{ ...errorBox, marginTop: 10 }}>{createError}</div>}
            <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
              <button onClick={closeModal} disabled={creating} style={cancelBtn}>Cancel</button>
              <button
                onClick={handleGeneratePlan}
                disabled={!subjectTitle.trim() || !cohortLevel || (!description.trim() && !uploadedDoc) || creating}
                style={{
                  ...goldBtn,
                  opacity: (!subjectTitle.trim() || !cohortLevel || (!description.trim() && !uploadedDoc) || creating) ? 0.5 : 1,
                  cursor: (!subjectTitle.trim() || !cohortLevel || (!description.trim() && !uploadedDoc) || creating) ? 'not-allowed' : 'pointer',
                }}
              >
                {creating ? 'Generating plan…' : 'Generate Plan'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const goldBtn = {
  padding: '9px 18px', borderRadius: 9, border: 'none',
  background: GOLD, color: '#0c1037', fontSize: 13, fontWeight: 800,
  cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif",
}

const outlineBtn = {
  padding: '10px 22px', borderRadius: 9,
  border: `1px solid ${GOLD}55`, background: `${GOLD}15`,
  color: GOLD, fontSize: 13, fontWeight: 700,
  cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif",
}

const cancelBtn = {
  padding: '9px 18px', borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.12)', background: 'transparent',
  color: '#94a3b8', fontSize: 13, fontWeight: 600,
  cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif",
}

const card = {
  padding: 18, borderRadius: 12,
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.07)',
  cursor: 'pointer', transition: 'background 0.15s',
}

const backdrop = {
  position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.6)',
}

const modal = {
  position: 'fixed', top: '50%', left: '50%',
  transform: 'translate(-50%, -50%)',
  zIndex: 51, width: 480, maxWidth: '95vw',
  background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 16, padding: 28,
  fontFamily: "'Plus Jakarta Sans', sans-serif",
}

const errorBox = {
  padding: '10px 14px', background: 'rgba(239,68,68,0.08)',
  border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8,
  fontSize: 13, color: '#f87171',
}
