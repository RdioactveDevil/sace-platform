import { useState, useEffect, useCallback } from 'react'
import { getDraftQuestions, upsertDraftQuestion, approveDraftQuestion, rejectDraftQuestion } from '../lib/adminDb'
import { S1_TOPICS, S2_TOPICS } from '../lib/adminTopics'
import MathText from './MathText'

const FONT_B = "'Plus Jakarta Sans', sans-serif"
const GOLD   = '#f1be43'
const OPTION_LABELS = ['A', 'B', 'C', 'D']

function StatusBadge({ status }) {
  const map = {
    pending:      { bg: 'rgba(241,190,67,0.1)',   border: 'rgba(241,190,67,0.3)',   color: GOLD },
    needs_review: { bg: 'rgba(239,68,68,0.1)',    border: 'rgba(239,68,68,0.3)',    color: '#f87171' },
    approved:     { bg: 'rgba(16,185,129,0.1)',   border: 'rgba(16,185,129,0.3)',   color: '#4ade80' },
    rejected:     { bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.1)',  color: 'rgba(255,255,255,0.3)' },
  }
  const c = map[status] || map.pending
  return (
    <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: c.bg, border: `1px solid ${c.border}`, color: c.color }}>
      {status}
    </span>
  )
}

export default function AdminReviewScreen({ profile }) {
  const [drafts,       setDrafts]       = useState([])
  const [loading,      setLoading]      = useState(true)
  const [filterStatus, setFilterStatus] = useState('pending')
  const [selected,     setSelected]     = useState(null)
  const [editState,    setEditState]    = useState(null)
  const [saving,       setSaving]       = useState(false)
  const [checked,      setChecked]      = useState(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getDraftQuestions({
        status: filterStatus === 'all' ? undefined : filterStatus,
      })
      setDrafts(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [filterStatus])

  useEffect(() => { load() }, [load])

  const openDraft = (draft) => {
    setSelected(draft)
    setEditState({ ...draft, options: [...(draft.options || ['', '', '', ''])] })
  }

  const closePanel = () => { setSelected(null); setEditState(null) }

  const handleSave = async () => {
    if (!editState) return
    setSaving(true)
    try {
      await upsertDraftQuestion(editState)
      setDrafts(prev => prev.map(d => d.id === editState.id ? { ...editState } : d))
      setSelected({ ...editState })
    } catch (e) { console.error(e) }
    finally { setSaving(false) }
  }

  const handleApprove = async (draftId) => {
    setSaving(true)
    try {
      await approveDraftQuestion(draftId, profile.id)
      setDrafts(prev => prev.map(d => d.id === draftId ? { ...d, status: 'approved' } : d))
      closePanel()
    } catch (e) { console.error(e) }
    finally { setSaving(false) }
  }

  const handleReject = async (draftId) => {
    setSaving(true)
    try {
      await rejectDraftQuestion(draftId, profile.id)
      setDrafts(prev => prev.map(d => d.id === draftId ? { ...d, status: 'rejected' } : d))
      closePanel()
    } catch (e) { console.error(e) }
    finally { setSaving(false) }
  }

  const handleBulkApprove = async () => {
    setSaving(true)
    for (const id of checked) {
      try { await approveDraftQuestion(id, profile.id) } catch {}
    }
    setChecked(new Set())
    setSaving(false)
    load()
  }

  const toggleCheck = (id, e) => {
    e.stopPropagation()
    setChecked(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const topicsForSubject = (subject) =>
    subject === 'Chemistry Stage 1' ? S1_TOPICS : S2_TOPICS

  const inputStyle = {
    width: '100%', padding: '8px 10px', borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.12)',
    background: '#0c1037',
    color: '#fff', fontSize: 13, fontFamily: FONT_B, outline: 'none',
    boxSizing: 'border-box',
  }

  return (
    <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
      {/* Left: table */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <h2 style={{ color: '#fff', margin: 0 }}>
            Review Queue
            {!loading && <span style={{ marginLeft: 8, fontSize: 13, color: 'rgba(255,255,255,0.3)', fontWeight: 400 }}>({drafts.length})</span>}
          </h2>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {checked.size > 0 && (
              <button
                onClick={handleBulkApprove}
                disabled={saving}
                style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: '#4ade80', color: '#0c1037', fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: FONT_B }}
              >
                Approve {checked.size} selected
              </button>
            )}
            {['pending', 'needs_review', 'all'].map(s => (
              <button
                key={s}
                onClick={() => { setFilterStatus(s); setChecked(new Set()) }}
                style={{
                  padding: '5px 12px', borderRadius: 8,
                  border: `1px solid ${filterStatus === s ? GOLD : 'rgba(255,255,255,0.12)'}`,
                  background: filterStatus === s ? 'rgba(241,190,67,0.08)' : 'transparent',
                  color: filterStatus === s ? GOLD : 'rgba(255,255,255,0.4)',
                  fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B,
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>Loading…</div>
        ) : drafts.length === 0 ? (
          <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, padding: '48px 0', textAlign: 'center' }}>
            No drafts with status "{filterStatus}".
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {drafts.map(draft => (
              <div
                key={draft.id}
                onClick={() => openDraft(draft)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 14px', borderRadius: 10,
                  background: selected?.id === draft.id ? 'rgba(241,190,67,0.06)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${selected?.id === draft.id ? 'rgba(241,190,67,0.2)' : 'rgba(255,255,255,0.07)'}`,
                  cursor: 'pointer', transition: 'background 0.1s',
                }}
              >
                <input
                  type="checkbox"
                  checked={checked.has(draft.id)}
                  onChange={e => toggleCheck(draft.id, e)}
                  onClick={e => e.stopPropagation()}
                  style={{ cursor: 'pointer', flexShrink: 0 }}
                />
                <span style={{ fontSize: 11, color: GOLD, fontWeight: 700, width: 36, flexShrink: 0 }}>
                  {draft.topic_code || '?'}
                </span>
                <span style={{ flex: 1, fontSize: 13, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {draft.question}
                </span>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', flexShrink: 0 }}>
                  D{draft.difficulty ?? '?'}
                </span>
                <span style={{ flexShrink: 0 }}><StatusBadge status={draft.status} /></span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Right: edit panel */}
      {editState && (
        <div style={{
          width: 400, flexShrink: 0,
          position: 'sticky', top: 24, maxHeight: 'calc(100vh - 120px)', overflowY: 'auto',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 14, padding: 20,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: GOLD }}>Edit Draft</span>
            <button onClick={closePanel} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>×</button>
          </div>

          {/* Topic */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4, textTransform: 'uppercase' }}>Topic</label>
            <select
              value={editState.topic_code || ''}
              onChange={e => {
                const t = topicsForSubject(editState.subject).find(x => x.code === e.target.value)
                setEditState(prev => ({ ...prev, topic_code: e.target.value || null, topic: t?.name || prev.topic }))
              }}
              style={inputStyle}
            >
              <option value="">Unknown / needs review</option>
              {topicsForSubject(editState.subject).map(t => (
                <option key={t.code} value={t.code}>{t.code} — {t.name}</option>
              ))}
            </select>
          </div>

          {/* Subtopic */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4, textTransform: 'uppercase' }}>Subtopic</label>
            <input
              style={inputStyle}
              value={editState.subtopic || ''}
              onChange={e => setEditState(prev => ({ ...prev, subtopic: e.target.value }))}
              placeholder="e.g. Le Chatelier's principle"
            />
          </div>

          {/* Difficulty */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4, textTransform: 'uppercase' }}>Difficulty (1–5)</label>
            <input
              type="number" min={1} max={5}
              style={{ ...inputStyle, width: 80 }}
              value={editState.difficulty ?? ''}
              onChange={e => setEditState(prev => ({ ...prev, difficulty: parseInt(e.target.value, 10) || null }))}
            />
          </div>

          {/* Question */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4, textTransform: 'uppercase' }}>Question</label>
            <textarea
              rows={4}
              style={{ ...inputStyle, resize: 'vertical' }}
              value={editState.question || ''}
              onChange={e => setEditState(prev => ({ ...prev, question: e.target.value }))}
            />
            {editState.question && (
              <div style={{ marginTop: 4, padding: '8px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', fontSize: 13, color: '#e2e8f0' }}>
                <MathText text={editState.question} />
              </div>
            )}
          </div>

          {/* Options */}
          {(editState.options || []).map((opt, i) => (
            <div key={i} style={{ marginBottom: 8 }}>
              <label style={{ display: 'block', fontSize: 11, color: editState.answer_index === i ? '#4ade80' : 'rgba(255,255,255,0.4)', marginBottom: 3, textTransform: 'uppercase' }}>
                Option {OPTION_LABELS[i]}{editState.answer_index === i ? ' ✓ correct' : ''}
              </label>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  style={inputStyle}
                  value={opt}
                  onChange={e => setEditState(prev => {
                    const opts = [...prev.options]
                    opts[i] = e.target.value
                    return { ...prev, options: opts }
                  })}
                />
                <button
                  onClick={() => setEditState(prev => ({ ...prev, answer_index: i }))}
                  title="Mark as correct"
                  style={{
                    flexShrink: 0, width: 28, height: 28, borderRadius: 6,
                    border: `1px solid ${editState.answer_index === i ? '#4ade80' : 'rgba(255,255,255,0.12)'}`,
                    background: editState.answer_index === i ? 'rgba(74,222,128,0.12)' : 'transparent',
                    color: editState.answer_index === i ? '#4ade80' : 'rgba(255,255,255,0.3)',
                    cursor: 'pointer', fontSize: 14,
                  }}
                >
                  ✓
                </button>
              </div>
            </div>
          ))}

          {/* Solution */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4, textTransform: 'uppercase' }}>Solution / Explanation</label>
            <textarea
              rows={4}
              style={{ ...inputStyle, resize: 'vertical' }}
              value={editState.solution || ''}
              onChange={e => setEditState(prev => ({ ...prev, solution: e.target.value }))}
            />
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{ padding: '9px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: FONT_B }}
            >
              {saving ? 'Saving…' : 'Save Edits'}
            </button>
            <button
              onClick={() => handleApprove(editState.id)}
              disabled={saving}
              style={{ padding: '9px', borderRadius: 8, border: 'none', background: saving ? 'rgba(74,222,128,0.4)' : '#4ade80', color: '#0c1037', fontSize: 13, fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: FONT_B }}
            >
              ✓ Approve → Go Live
            </button>
            <button
              onClick={() => handleReject(editState.id)}
              disabled={saving}
              style={{ padding: '9px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.3)', background: 'transparent', color: '#f87171', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: FONT_B }}
            >
              Reject
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
