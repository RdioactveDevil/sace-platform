import { useState, useEffect, useCallback } from 'react'
import { listCurricula, createCurriculum } from '../lib/curriculaDb'
import { adminApiPost } from '../lib/adminApi'

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
  const [creating, setCreating]         = useState(false)
  const [createError, setCreateError]  = useState('')

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      setCurricula(await listCurricula())
    } catch (e) {
      if (!silent) setError(e.message)
    }
    if (!silent) setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const openModal = () => { setShowModal(true); setCreateError(''); setDescription('') }
  const closeModal = () => { if (!creating) setShowModal(false) }

  const handleGeneratePlan = async () => {
    if (!description.trim()) return
    setCreating(true)
    setCreateError('')
    try {
      const { topics } = await adminApiPost('/api/admin/curriculum-plan', { subjectDescription: description.trim() })
      const name = description.trim().split('\n')[0].slice(0, 120)
      const id = await createCurriculum({ name, subject_description: description.trim(), topics })
      setShowModal(false)
      onSelectCurriculum(id)
    } catch (e) {
      setCreateError(e.message)
    }
    setCreating(false)
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
                <StatusBadge status={c.status} />
              </div>
              <div style={{ display: 'flex', gap: 14, fontSize: 12, color: '#64748b', marginBottom: 10 }}>
                <span>{c.topic_count} topic{c.topic_count !== 1 ? 's' : ''}</span>
                <span>{c.subtopic_count} subtopic{c.subtopic_count !== 1 ? 's' : ''}</span>
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
            <p style={{ margin: '0 0 18px', color: '#64748b', fontSize: 13, lineHeight: 1.6 }}>
              Describe the subject and level. Claude will generate a full topic and subtopic plan.
            </p>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="e.g. Year 11 SACE Biology — Australian curriculum, covering cells, genetics, ecosystems, and evolution"
              rows={4}
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
            {createError && <div style={{ ...errorBox, marginTop: 10 }}>{createError}</div>}
            <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
              <button onClick={closeModal} disabled={creating} style={cancelBtn}>Cancel</button>
              <button
                onClick={handleGeneratePlan}
                disabled={!description.trim() || creating}
                style={{
                  ...goldBtn,
                  opacity: (!description.trim() || creating) ? 0.5 : 1,
                  cursor: (!description.trim() || creating) ? 'not-allowed' : 'pointer',
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
