import { useState, useEffect, useRef } from 'react'
import {
  getCurriculumDetail,
  updateCurriculum,
  updateCurriculumStatus,
  getSubtopicStatuses,
} from '../lib/curriculaDb'
import { adminApiPost } from '../lib/adminApi'

const FONT_B = "'Plus Jakarta Sans', sans-serif"
const GOLD   = '#f1be43'

// ── Inline editable text node ─────────────────────────────────────────────────
function EditableText({ value, onSave, style }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef(null)

  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  const commit = () => {
    setEditing(false)
    if (draft.trim() && draft !== value) onSave(draft.trim())
    else setDraft(value)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') { setDraft(value); setEditing(false) }
        }}
        style={{
          ...style,
          background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(241,190,67,0.4)',
          borderRadius: 5, padding: '2px 6px', outline: 'none', color: '#f1f5f9',
          fontFamily: FONT_B, fontSize: 'inherit', width: '100%',
        }}
      />
    )
  }
  return (
    <span
      onClick={() => { setDraft(value); setEditing(true) }}
      title="Click to rename"
      style={{ ...style, cursor: 'text', borderRadius: 4, padding: '2px 4px', transition: 'background 0.1s' }}
      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      {value}
    </span>
  )
}

export default function AdminCurriculumDetail({ curriculumId, onBack, onGoLive }) {
  const [curriculum, setCurriculum]   = useState(null)
  const [topics, setTopics]           = useState([])
  const [loading, setLoading]         = useState(true)
  const [saving, setSaving]           = useState(false)
  const [saveOk, setSaveOk]           = useState(false)
  const [error, setError]             = useState('')
  const [generating, setGenerating]   = useState(false)
  const [progress, setProgress]       = useState(null)
  const [genError, setGenError]       = useState('')
  const pollRef = useRef(null)

  useEffect(() => {
    loadDetail()
    return () => clearInterval(pollRef.current)
  }, [curriculumId])

  async function loadDetail() {
    setLoading(true)
    try {
      const detail = await getCurriculumDetail(curriculumId)
      setCurriculum(detail)
      setTopics(detail.topics.map(t => ({
        ...t,
        subtopics: t.subtopics.map(s => ({ ...s })),
      })))
      if (detail.status === 'generating') {
        setGenerating(true)
        startPolling()
      }
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }

  function startPolling() {
    clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      try {
        const statuses = await getSubtopicStatuses(curriculumId)
        setProgress(statuses)
        const allDone = statuses.every(s => s.gen_status === 'done' || s.gen_status === 'failed')
        if (allDone) {
          clearInterval(pollRef.current)
          await updateCurriculumStatus(curriculumId, 'live')
          setCurriculum(prev => ({ ...prev, status: 'live' }))
          setGenerating(false)
          onGoLive?.()
        }
      } catch {}
    }, 5000)
  }

  // ── Tree mutation helpers ─────────────────────────────────────────────────

  const renameTopic = (ti, name) => setTopics(prev => prev.map((t, i) => i === ti ? { ...t, name } : t))
  const renameSubtopic = (ti, si, name) => setTopics(prev => prev.map((t, i) =>
    i !== ti ? t : { ...t, subtopics: t.subtopics.map((s, j) => j === si ? { ...s, name } : s) }
  ))
  const addTopic = () => setTopics(prev => [...prev, { name: 'New Topic', subtopics: [] }])
  const deleteTopic = (ti) => {
    const t = topics[ti]
    const msg = t.subtopics.length > 0
      ? `Delete "${t.name}" and its ${t.subtopics.length} subtopic(s)?`
      : `Delete "${t.name}"?`
    if (!window.confirm(msg)) return
    setTopics(prev => prev.filter((_, i) => i !== ti))
  }
  const moveTopicUp = (ti) => {
    if (ti === 0) return
    setTopics(prev => { const a = [...prev]; [a[ti - 1], a[ti]] = [a[ti], a[ti - 1]]; return a })
  }
  const moveTopicDown = (ti) => {
    if (ti === topics.length - 1) return
    setTopics(prev => { const a = [...prev]; [a[ti], a[ti + 1]] = [a[ti + 1], a[ti]]; return a })
  }
  const addSubtopic = (ti) => setTopics(prev => prev.map((t, i) =>
    i !== ti ? t : { ...t, subtopics: [...t.subtopics, { name: 'New Subtopic' }] }
  ))
  const deleteSubtopic = (ti, si) => setTopics(prev => prev.map((t, i) =>
    i !== ti ? t : { ...t, subtopics: t.subtopics.filter((_, j) => j !== si) }
  ))
  const moveSubtopicUp = (ti, si) => {
    if (si === 0) return
    setTopics(prev => prev.map((t, i) => {
      if (i !== ti) return t
      const a = [...t.subtopics]; [a[si - 1], a[si]] = [a[si], a[si - 1]]; return { ...t, subtopics: a }
    }))
  }
  const moveSubtopicDown = (ti, si) => setTopics(prev => prev.map((t, i) => {
    if (i !== ti) return t
    if (si === t.subtopics.length - 1) return t
    const a = [...t.subtopics]; [a[si], a[si + 1]] = [a[si + 1], a[si]]; return { ...t, subtopics: a }
  }))

  // ── Save ──────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    setSaving(true); setError(''); setSaveOk(false)
    try {
      await updateCurriculum(curriculumId, { name: curriculum.name, topics })
      setSaveOk(true)
      setTimeout(() => setSaveOk(false), 2500)
    } catch (e) {
      setError(e.message)
    }
    setSaving(false)
  }

  // ── Generation pipeline ───────────────────────────────────────────────────

  const handleApproveAndGenerate = async () => {
    const subtopicCount = topics.flatMap(t => t.subtopics).length
    if (!window.confirm(`Generate 25 questions for each of the ${subtopicCount} subtopics? This may take several minutes.`)) return
    setSaving(true); setError(''); setGenError('')
    try {
      await updateCurriculum(curriculumId, { name: curriculum.name, topics })
      await updateCurriculumStatus(curriculumId, 'generating')
      setCurriculum(prev => ({ ...prev, status: 'generating' }))
      setGenerating(true)

      const freshDetail = await getCurriculumDetail(curriculumId)
      const allSubtopics = freshDetail.topics.flatMap((t) =>
        t.subtopics.map((s) => ({ ...s, topicName: t.name }))
      )

      const initialProgress = allSubtopics.map(s => ({
        id: s.id, name: s.name, topicName: s.topicName,
        gen_status: 'pending', questions_generated: 0,
      }))
      setProgress(initialProgress)
      startPolling()

      for (const sub of allSubtopics) {
        setProgress(prev => prev.map(p => p.id === sub.id ? { ...p, gen_status: 'generating' } : p))
        try {
          await adminApiPost('/api/admin/curriculum-generate', {
            subtopicId: sub.id,
            curriculumId,
            subjectName: freshDetail.name,
            topicName: sub.topicName,
            subtopicName: sub.name,
            count: 25,
          })
          setProgress(prev => prev.map(p => p.id === sub.id ? { ...p, gen_status: 'done', questions_generated: 25 } : p))
        } catch {
          setProgress(prev => prev.map(p => p.id === sub.id ? { ...p, gen_status: 'failed' } : p))
        }
      }
    } catch (e) {
      setError(e.message)
      setGenerating(false)
    }
    setSaving(false)
  }

  const handleRetry = async (sub) => {
    setProgress(prev => prev.map(p => p.id === sub.id ? { ...p, gen_status: 'generating' } : p))
    try {
      await adminApiPost('/api/admin/curriculum-generate', {
        subtopicId: sub.id,
        curriculumId,
        subjectName: curriculum.name,
        topicName: sub.topicName,
        subtopicName: sub.name,
        count: 25,
      })
      setProgress(prev => prev.map(p => p.id === sub.id ? { ...p, gen_status: 'done', questions_generated: 25 } : p))
    } catch {
      setProgress(prev => prev.map(p => p.id === sub.id ? { ...p, gen_status: 'failed' } : p))
    }
  }

  if (loading) return <div style={{ color: '#64748b', fontSize: 13, fontFamily: FONT_B }}>Loading curriculum…</div>
  if (!curriculum) return <div style={{ color: '#f87171', fontSize: 13, fontFamily: FONT_B }}>{error || 'Curriculum not found.'}</div>

  const totalSubtopics = topics.reduce((n, t) => n + t.subtopics.length, 0)
  const doneCount   = (progress || []).filter(p => p.gen_status === 'done').length
  const failedCount = (progress || []).filter(p => p.gen_status === 'failed').length
  const totalQs     = (progress || []).reduce((n, p) => n + (p.questions_generated || 0), 0)
  const isDraft     = curriculum.status === 'draft'

  const statusColor = curriculum.status === 'live' ? '#4ade80' : curriculum.status === 'generating' ? '#38bdf8' : GOLD
  const statusBg    = curriculum.status === 'live' ? 'rgba(74,222,128,0.1)' : curriculum.status === 'generating' ? 'rgba(56,189,248,0.1)' : 'rgba(241,190,67,0.1)'
  const statusBdr   = curriculum.status === 'live' ? 'rgba(74,222,128,0.3)' : curriculum.status === 'generating' ? 'rgba(56,189,248,0.3)' : 'rgba(241,190,67,0.3)'

  return (
    <div style={{ fontFamily: FONT_B, color: '#e2e8f0' }}>

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24, flexWrap: 'wrap' }}>
        <button
          onClick={onBack}
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 13, fontFamily: FONT_B, padding: 0 }}
        >
          ← Curricula
        </button>
        <EditableText
          value={curriculum.name}
          onSave={name => setCurriculum(prev => ({ ...prev, name }))}
          style={{ fontSize: 18, fontWeight: 800, color: '#f1f5f9' }}
        />
        <span style={{
          padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700,
          background: statusBg, border: `1px solid ${statusBdr}`, color: statusColor,
          textTransform: 'capitalize',
        }}>
          {curriculum.status}
        </span>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {saveOk && <span style={{ fontSize: 12, color: '#4ade80' }}>✓ Saved</span>}
          <button
            onClick={handleSave}
            disabled={saving || generating}
            style={secondaryBtn(saving || generating)}
          >
            {saving ? 'Saving…' : 'Save Draft'}
          </button>
          {isDraft && (
            <button
              onClick={handleApproveAndGenerate}
              disabled={saving || totalSubtopics === 0}
              style={{
                padding: '9px 18px', borderRadius: 9, border: 'none',
                background: (saving || totalSubtopics === 0) ? 'rgba(241,190,67,0.4)' : GOLD,
                color: '#0c1037', fontSize: 13, fontWeight: 800,
                cursor: (saving || totalSubtopics === 0) ? 'not-allowed' : 'pointer',
                fontFamily: FONT_B,
              }}
            >
              Approve & Generate →
            </button>
          )}
        </div>
      </div>

      {error && <div style={errorBox}>{error}</div>}
      {genError && <div style={errorBox}>{genError}</div>}

      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>

        {/* Left: tree editor */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {topics.map((topic, ti) => (
            <div key={ti} style={{ marginBottom: 14 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 14px', borderRadius: 10,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}>
                <span style={{ fontSize: 10, color: '#64748b', fontWeight: 700, width: 22, flexShrink: 0 }}>T{ti + 1}</span>
                <EditableText
                  value={topic.name}
                  onSave={name => renameTopic(ti, name)}
                  style={{ flex: 1, fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}
                />
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <IconBtn title="Move up"      onClick={() => moveTopicUp(ti)}   disabled={ti === 0}>↑</IconBtn>
                  <IconBtn title="Move down"    onClick={() => moveTopicDown(ti)} disabled={ti === topics.length - 1}>↓</IconBtn>
                  <IconBtn title="Delete topic" onClick={() => deleteTopic(ti)}   danger>×</IconBtn>
                </div>
              </div>

              {/* Subtopics */}
              <div style={{ paddingLeft: 28, marginTop: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {topic.subtopics.map((sub, si) => (
                  <div key={si} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '7px 12px', borderRadius: 8,
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.05)',
                  }}>
                    <span style={{ fontSize: 10, color: '#475569', width: 30, flexShrink: 0 }}>{ti + 1}.{si + 1}</span>
                    <EditableText
                      value={sub.name}
                      onSave={name => renameSubtopic(ti, si, name)}
                      style={{ flex: 1, fontSize: 13, color: '#cbd5e1' }}
                    />
                    <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                      <IconBtn onClick={() => moveSubtopicUp(ti, si)}   disabled={si === 0}                          small>↑</IconBtn>
                      <IconBtn onClick={() => moveSubtopicDown(ti, si)} disabled={si === topic.subtopics.length - 1} small>↓</IconBtn>
                      <IconBtn onClick={() => deleteSubtopic(ti, si)}   danger small>×</IconBtn>
                    </div>
                  </div>
                ))}
                <button onClick={() => addSubtopic(ti)} style={{ ...addBtn, marginTop: 2 }}>
                  + Add Subtopic
                </button>
              </div>
            </div>
          ))}

          <button onClick={addTopic} style={{ ...addBtn, marginTop: 8, padding: '10px 16px', fontSize: 13 }}>
            + Add Topic
          </button>
        </div>

        {/* Right: generation progress panel */}
        {progress && (
          <div style={{
            width: 320, flexShrink: 0,
            position: 'sticky', top: 24,
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 14, padding: 18,
            maxHeight: 'calc(100vh - 160px)', overflowY: 'auto',
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 12 }}>
              Generation Progress
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 3, background: '#4ade80',
                  width: `${progress.length > 0 ? Math.round(((doneCount + failedCount) / progress.length) * 100) : 0}%`,
                  transition: 'width 0.4s',
                }} />
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 5 }}>
                {totalQs} questions · {doneCount}/{progress.length} subtopics done
                {failedCount > 0 && <span style={{ color: '#f87171' }}> · {failedCount} failed</span>}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {progress.map(p => {
                const chipColor = p.gen_status === 'done' ? '#4ade80' : p.gen_status === 'failed' ? '#f87171' : p.gen_status === 'generating' ? '#38bdf8' : '#64748b'
                return (
                  <div key={p.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '7px 10px', borderRadius: 8,
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.04)',
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: '#cbd5e1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                    </div>
                    <span style={{
                      fontSize: 10, fontWeight: 700, flexShrink: 0,
                      color: chipColor,
                      padding: '1px 7px', borderRadius: 999,
                      border: `1px solid ${chipColor}44`,
                      background: `${chipColor}14`,
                    }}>
                      {p.gen_status === 'done' ? `✓ ${p.questions_generated}q` : p.gen_status === 'generating' ? '…' : p.gen_status === 'failed' ? '✗' : 'pending'}
                    </span>
                    {p.gen_status === 'failed' && (
                      <button
                        onClick={() => handleRetry(p)}
                        style={{
                          background: 'none', border: '1px solid rgba(248,113,113,0.3)',
                          borderRadius: 5, color: '#f87171', fontSize: 10,
                          cursor: 'pointer', padding: '2px 7px', fontFamily: FONT_B,
                        }}
                      >
                        Retry
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function IconBtn({ children, onClick, disabled, danger, small, title }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        width: small ? 22 : 26, height: small ? 22 : 26,
        borderRadius: 5,
        border: `1px solid ${danger ? 'rgba(248,113,113,0.25)' : 'rgba(255,255,255,0.08)'}`,
        background: 'transparent',
        color: disabled ? '#374151' : danger ? '#f87171' : '#94a3b8',
        fontSize: small ? 11 : 13,
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  )
}

const errorBox = {
  padding: '10px 14px', background: 'rgba(239,68,68,0.08)',
  border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8,
  fontSize: 13, color: '#f87171', marginBottom: 14,
}

const addBtn = {
  background: 'none', border: '1px dashed rgba(255,255,255,0.1)',
  borderRadius: 7, color: 'rgba(255,255,255,0.3)',
  fontSize: 12, cursor: 'pointer', padding: '6px 12px',
  fontFamily: "'Plus Jakarta Sans', sans-serif",
  width: '100%', textAlign: 'left',
}

const secondaryBtn = (disabled) => ({
  padding: '9px 16px', borderRadius: 9,
  border: '1px solid rgba(255,255,255,0.12)',
  background: 'transparent',
  color: disabled ? '#64748b' : '#e2e8f0',
  fontSize: 13, fontWeight: 700,
  cursor: disabled ? 'not-allowed' : 'pointer',
  fontFamily: "'Plus Jakarta Sans', sans-serif",
})
