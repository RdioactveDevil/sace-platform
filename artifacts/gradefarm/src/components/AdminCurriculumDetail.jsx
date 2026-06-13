import { useState, useEffect, useRef } from 'react'
import {
  getCurriculumDetail,
  updateCurriculum,
  updateCurriculumStatus,
  getSubtopicStatuses,
  loadManagedCurriculaTopics,
} from '../lib/curriculaDb'
import { adminApiPost } from '../lib/adminApi'
import { refreshManagedTopicsCache } from '../lib/adminTopics'
import CurriculumResourcesPanel from './CurriculumResourcesPanel'
import { COHORT_LEVEL_OPTIONS } from '../lib/subjects'

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
  const [reviseInstruction, setReviseInstruction] = useState('')
  const [reviseSourceText, setReviseSourceText]   = useState('')
  const [showPasteArea, setShowPasteArea]         = useState(false)
  const [reviseDoc, setReviseDoc]     = useState(null) // { base64, mediaType, name }
  const [revising, setRevising]       = useState(false)
  const pollRef = useRef(null)

  // Question reallocation state
  const [orphanInfo, setOrphanInfo]         = useState(null)   // { count, orphanedSubtopics }
  const [showRemap, setShowRemap]           = useState(false)
  const [remapMappings, setRemapMappings]   = useState([])     // [{ name, topic, count, action, newTopic, newSubtopic }]
  const [remapSuggesting, setRemapSuggesting] = useState(false)
  const [remapApplying, setRemapApplying]   = useState(false)
  const [remapResult, setRemapResult]       = useState(null)   // { updated, deleted }
  const [consolidating, setConsolidating]   = useState(false)

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
          refreshManagedTopicsCache(loadManagedCurriculaTopics).catch(() => {})
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

  // ── Revise with AI ────────────────────────────────────────────────────────

  const handleReviseFileUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = reader.result.split(',')[1]
      setReviseDoc({ base64, mediaType: file.type || 'application/pdf', name: file.name })
    }
    reader.readAsDataURL(file)
  }

  const handleRevise = async () => {
    if (!reviseInstruction.trim() && !reviseDoc && !reviseSourceText.trim()) return
    setRevising(true); setError('')
    try {
      const payload = {
        currentTopics: topics,
        instruction: reviseInstruction.trim(),
        sourceText: reviseSourceText.trim(),
        subjectName: curriculum.name,
      }
      if (reviseDoc) { payload.base64Doc = reviseDoc.base64; payload.mediaType = reviseDoc.mediaType }
      const { topics: revised } = await adminApiPost('/api/admin/curriculum-revise', payload)
      setTopics(revised.map(t => ({ ...t, subtopics: (t.subtopics || []).map(s => ({ ...s })) })))
      setReviseInstruction('')
      setReviseSourceText('')
      setReviseDoc(null)
      setShowPasteArea(false)
    } catch (e) {
      setError(e.message)
    }
    setRevising(false)
  }

  // ── Question reallocation helpers ─────────────────────────────────────────

  async function checkOrphanedQuestions(currentTopics, subjectName) {
    const validSubtopics = currentTopics.flatMap(t => t.subtopics.map(s => s.name))
    try {
      const result = await adminApiPost('/api/admin/curriculum-orphaned-questions', {
        subjectName,
        validSubtopics,
      })
      if (result.count > 0) {
        setOrphanInfo(result)
        setRemapMappings(result.orphanedSubtopics.map(o => ({
          ...o,
          action: 'remap',
          newTopic: '',
          newSubtopic: '',
        })))
      } else {
        setOrphanInfo(null)
        setRemapMappings([])
      }
    } catch {
      // Silently ignore — orphan check is advisory
    }
  }

  const handleSuggestRemap = async () => {
    setRemapSuggesting(true)
    try {
      const result = await adminApiPost('/api/admin/curriculum-suggest-remap', {
        subjectName: curriculum.name,
        orphanedSubtopics: orphanInfo.orphanedSubtopics,
        newCurriculumTree: { topics },
      })
      if (result.suggestions) {
        // Build a lookup from normalised subtopic name → { topic, subtopic } so we can
        // correct any leading numbers/punctuation Claude may have added (e.g. "5.2. Foo" → "Foo").
        const stripLeading = (s) => String(s || '').replace(/^\d[\d.]*\.?\s*/, '').trim()
        const normKey = (s) => stripLeading(s).toLowerCase()
        const subtopicLookup = new Map()
        topics.forEach(t => {
          t.subtopics?.forEach(s => {
            subtopicLookup.set(normKey(s.name), { topic: t.name, subtopic: s.name })
          })
        })

        setRemapMappings(prev => prev.map(m => {
          const suggestion = result.suggestions.find(s => s.oldSubtopic === m.name)
          if (!suggestion) return m
          if (suggestion.action === 'delete') {
            return { ...m, action: 'delete', newTopic: '', newSubtopic: '' }
          }
          if (suggestion.action === 'remap') {
            // Try exact match first, then normalised match
            const exactKey = `${suggestion.newTopic || ''}|||${suggestion.newSubtopic || ''}`
            const allOptions = topics.flatMap(t => t.subtopics?.map(s => `${t.name}|||${s.name}`) || [])
            if (allOptions.includes(exactKey)) {
              return { ...m, action: 'remap', newTopic: suggestion.newTopic, newSubtopic: suggestion.newSubtopic }
            }
            // Fuzzy: strip numbers from suggested subtopic name and look up in map
            const fuzzy = subtopicLookup.get(normKey(suggestion.newSubtopic || ''))
            if (fuzzy) {
              return { ...m, action: 'remap', newTopic: fuzzy.topic, newSubtopic: fuzzy.subtopic }
            }
          }
          return { ...m, action: suggestion.action || 'ignore', newTopic: '', newSubtopic: '' }
        }))
      }
    } catch (e) {
      setError(e.message)
    }
    setRemapSuggesting(false)
  }

  const handleApplyRemap = async () => {
    const toProcess = remapMappings.filter(m => m.action !== 'ignore')
    if (toProcess.length === 0) return
    const remapCount = toProcess.filter(m => m.action === 'remap' && m.newSubtopic).length
    const deleteCount = toProcess.filter(m => m.action === 'delete').length
    const missing = toProcess.filter(m => m.action === 'remap' && !m.newSubtopic)
    if (missing.length > 0) {
      setError(`Please select a destination for: ${missing.map(m => `"${m.name}"`).join(', ')}`)
      return
    }
    const totalAffected = toProcess.reduce((n, m) => n + m.count, 0)
    if (!window.confirm(
      `This will remap ${remapCount} subtopic group(s) and delete ${deleteCount} subtopic group(s), ` +
      `affecting ${totalAffected} questions. This cannot be undone. Proceed?`
    )) return

    setRemapApplying(true); setError('')
    try {
      const result = await adminApiPost('/api/admin/curriculum-apply-remap', {
        subjectName: curriculum.name,
        mappings: remapMappings.map(m => ({
          oldSubtopic: m.name,
          action: m.action,
          newTopic: m.newTopic || null,
          newSubtopic: m.newSubtopic || null,
        })),
      })
      setRemapResult(result)
      setShowRemap(false)
      // Re-check orphans after remapping
      await checkOrphanedQuestions(topics, curriculum.name)
    } catch (e) {
      setError(e.message)
    }
    setRemapApplying(false)
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    setSaving(true); setError(''); setSaveOk(false); setRemapResult(null)
    try {
      await updateCurriculum(curriculumId, {
        name: curriculum.name,
        level_label: curriculum.level_label ?? '',
        exam_context: curriculum.exam_context ?? '',
        topics,
      })
      refreshManagedTopicsCache(loadManagedCurriculaTopics).catch(() => {})
      setSaveOk(true)
      setTimeout(() => setSaveOk(false), 2500)
      // Check for orphaned questions after saving tree changes
      await checkOrphanedQuestions(topics, curriculum.name)
    } catch (e) {
      setError(e.message)
    }
    setSaving(false)
  }

  // Consolidate every alias/stale spelling of this curriculum's subject in the
  // question bank onto its canonical name. Passing the level label folds a
  // bare title (e.g. a "Mathematical Methods" row left behind by a rename) into
  // the stage-named subject. Scoped to this curriculum's own alias expansion,
  // idempotent, and safe to run repeatedly.
  const handleConsolidateSpellings = async () => {
    const name = (curriculum?.name || '').trim()
    const level = (curriculum?.level_label || '').trim()
    if (!name) return
    if (!window.confirm(
      `Consolidate question-bank subject spellings onto "${name}"?\n\n` +
      `This merges legacy/alias spellings of this subject — including a bare title ` +
      `without the stage — into "${name}", so every question lines up with this curriculum. ` +
      `Only this subject's questions are affected, and it's safe to run more than once.`
    )) return
    setConsolidating(true); setError(''); setSaveOk(false)
    try {
      await adminApiPost('/api/admin/curriculum-rename-cascade', {
        oldSubject: name,
        newSubject: name,
        oldLevelLabel: level,
      })
      refreshManagedTopicsCache(loadManagedCurriculaTopics).catch(() => {})
      setSaveOk(true)
      setTimeout(() => setSaveOk(false), 2500)
    } catch (e) {
      setError(e.message)
    }
    setConsolidating(false)
  }

  // ── Generation pipeline ───────────────────────────────────────────────────

  const handleApproveAndGenerate = async () => {
    const subtopicCount = topics.flatMap(t => t.subtopics).length
    if (!window.confirm(`Generate 5 questions for each of the ${subtopicCount} subtopics? This may take several minutes.`)) return
    if (!(curriculum.level_label || '').trim()) {
      setError('Select a Stage / year level before generating questions.')
      return
    }
    setSaving(true); setError(''); setGenError('')
    try {
      await updateCurriculum(curriculumId, {
        name: curriculum.name,
        level_label: curriculum.level_label ?? '',
        exam_context: curriculum.exam_context ?? '',
        topics,
      })
      refreshManagedTopicsCache(loadManagedCurriculaTopics).catch(() => {})
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
            count: 5,
          })
          setProgress(prev => prev.map(p => p.id === sub.id ? { ...p, gen_status: 'done', questions_generated: 5 } : p))
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
        count: 5,
      })
      setProgress(prev => prev.map(p => p.id === sub.id ? { ...p, gen_status: 'done', questions_generated: 5 } : p))
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
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#94a3b8', marginLeft: 4 }}>
          <span style={{ flexShrink: 0 }}>Cohort</span>
          <select
            value={curriculum.level_label || ''}
            onChange={e => setCurriculum(prev => ({ ...prev, level_label: e.target.value }))}
            disabled={generating}
            style={{
              padding: '4px 8px', borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.12)', background: '#0c1037',
              color: '#e2e8f0', fontSize: 12, fontFamily: FONT_B,
              minWidth: 120,
              opacity: generating ? 0.5 : 1,
            }}
          >
            <option value="">Select…</option>
            {COHORT_LEVEL_OPTIONS.map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </label>
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
            onClick={handleConsolidateSpellings}
            disabled={saving || generating || consolidating}
            title="Merge legacy/bare subject spellings in the question bank onto this curriculum's exact name"
            style={secondaryBtn(saving || generating || consolidating)}
          >
            {consolidating ? 'Consolidating…' : 'Consolidate spellings'}
          </button>
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

      {/* Remap success notice */}
      {remapResult && (
        <div style={{
          marginBottom: 14, padding: '10px 14px',
          background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.3)',
          borderRadius: 8, fontSize: 13, color: '#4ade80', display: 'flex', alignItems: 'center', gap: 8,
        }}>
          ✓ Remap complete — {remapResult.updated} group(s) remapped, {remapResult.deleted} group(s) deleted.
          <button onClick={() => setRemapResult(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#4ade80', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
        </div>
      )}

      {/* Orphaned questions banner */}
      {orphanInfo && !showRemap && (
        <div style={{
          marginBottom: 14, padding: '12px 16px',
          background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.35)',
          borderRadius: 10, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 18 }}>⚠️</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fbbf24' }}>
              {orphanInfo.count} question{orphanInfo.count !== 1 ? 's' : ''} not mapped to any current subtopic
            </div>
            <div style={{ fontSize: 12, color: '#92400e', marginTop: 2 }}>
              These questions exist in the question bank but don't match any subtopic in the revised curriculum.
              Remap them to new subtopics or delete them.
            </div>
          </div>
          <button
            onClick={() => setShowRemap(true)}
            style={{
              padding: '7px 14px', borderRadius: 8, border: '1px solid rgba(251,191,36,0.4)',
              background: 'rgba(251,191,36,0.12)', color: '#fbbf24',
              fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B, flexShrink: 0,
            }}
          >
            Fix now →
          </button>
        </div>
      )}

      {/* Question reallocation panel */}
      {showRemap && orphanInfo && (() => {
        const allSubtopicOptions = topics.flatMap(t =>
          t.subtopics.map(s => ({ label: `${t.name} → ${s.name}`, topic: t.name, subtopic: s.name }))
        )
        return (
          <div style={{
            marginBottom: 20, borderRadius: 12,
            border: '1px solid rgba(251,191,36,0.3)',
            background: 'rgba(251,191,36,0.04)', overflow: 'hidden',
          }}>
            {/* Panel header */}
            <div style={{
              padding: '14px 16px', borderBottom: '1px solid rgba(251,191,36,0.15)',
              display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#fbbf24' }}>
                  Reallocate Orphaned Questions
                </div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                  {orphanInfo.count} questions across {orphanInfo.orphanedSubtopics.length} old subtopic(s).
                  Assign each to a new subtopic or choose to delete.
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button
                  onClick={handleSuggestRemap}
                  disabled={remapSuggesting || remapApplying}
                  style={{
                    padding: '7px 13px', borderRadius: 8, border: '1px solid rgba(56,189,248,0.3)',
                    background: 'rgba(56,189,248,0.08)', color: remapSuggesting ? '#64748b' : '#38bdf8',
                    fontSize: 12, fontWeight: 700, cursor: remapSuggesting ? 'not-allowed' : 'pointer', fontFamily: FONT_B,
                  }}
                >
                  {remapSuggesting ? '✨ Suggesting…' : '✨ AI Suggest'}
                </button>
                <button
                  onClick={() => setShowRemap(false)}
                  style={{
                    padding: '7px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)',
                    background: 'transparent', color: '#64748b', fontSize: 12, cursor: 'pointer', fontFamily: FONT_B,
                  }}
                >
                  Collapse
                </button>
              </div>
            </div>

            {/* Mapping rows */}
            <div style={{ padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {remapMappings.map((m, idx) => (
                <div key={m.name} style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto auto',
                  gap: 10, alignItems: 'center',
                  padding: '9px 12px', borderRadius: 8,
                  background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
                }}>
                  {/* Old subtopic info */}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {m.name}
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>
                      was in &quot;{m.topic}&quot; · {m.count} question{m.count !== 1 ? 's' : ''}
                    </div>
                  </div>

                  {/* Action selector */}
                  <select
                    value={m.action}
                    disabled={remapApplying}
                    onChange={e => {
                      const action = e.target.value
                      setRemapMappings(prev => prev.map((r, i) =>
                        i !== idx ? r : { ...r, action, newTopic: action === 'remap' ? r.newTopic : '', newSubtopic: action === 'remap' ? r.newSubtopic : '' }
                      ))
                    }}
                    style={{
                      padding: '5px 8px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)',
                      background: '#0c1037', color: '#e2e8f0', fontSize: 12, fontFamily: FONT_B, cursor: 'pointer',
                    }}
                  >
                    <option value="remap">Remap to…</option>
                    <option value="delete">Delete questions</option>
                    <option value="ignore">Leave as-is</option>
                  </select>

                  {/* Destination picker */}
                  {m.action === 'remap' ? (
                    <select
                      value={m.newSubtopic ? `${m.newTopic}|||${m.newSubtopic}` : ''}
                      disabled={remapApplying}
                      onChange={e => {
                        const val = e.target.value
                        if (!val) {
                          setRemapMappings(prev => prev.map((r, i) => i !== idx ? r : { ...r, newTopic: '', newSubtopic: '' }))
                        } else {
                          const [nt, ns] = val.split('|||')
                          setRemapMappings(prev => prev.map((r, i) => i !== idx ? r : { ...r, newTopic: nt, newSubtopic: ns }))
                        }
                      }}
                      style={{
                        padding: '5px 8px', borderRadius: 6, border: `1px solid ${m.newSubtopic ? 'rgba(74,222,128,0.3)' : 'rgba(251,191,36,0.3)'}`,
                        background: '#0c1037', color: m.newSubtopic ? '#4ade80' : '#fbbf24',
                        fontSize: 12, fontFamily: FONT_B, cursor: 'pointer', maxWidth: 280,
                      }}
                    >
                      <option value="">— select subtopic —</option>
                      {allSubtopicOptions.map(opt => (
                        <option key={`${opt.topic}|||${opt.subtopic}`} value={`${opt.topic}|||${opt.subtopic}`}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div style={{ width: 200, fontSize: 12, color: m.action === 'delete' ? '#f87171' : '#64748b', fontStyle: 'italic' }}>
                      {m.action === 'delete' ? `${m.count} question${m.count !== 1 ? 's' : ''} will be deleted` : 'No change'}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Apply button */}
            <div style={{ padding: '10px 16px 14px', display: 'flex', gap: 10, alignItems: 'center' }}>
              <button
                onClick={handleApplyRemap}
                disabled={remapApplying || remapMappings.every(m => m.action === 'ignore')}
                style={{
                  padding: '9px 18px', borderRadius: 9, border: 'none',
                  background: (remapApplying || remapMappings.every(m => m.action === 'ignore'))
                    ? 'rgba(241,190,67,0.3)' : GOLD,
                  color: '#0c1037', fontSize: 13, fontWeight: 800,
                  cursor: (remapApplying || remapMappings.every(m => m.action === 'ignore')) ? 'not-allowed' : 'pointer',
                  fontFamily: FONT_B,
                }}
              >
                {remapApplying ? 'Applying…' : 'Apply Remap'}
              </button>
              <span style={{ fontSize: 12, color: '#64748b' }}>
                {remapMappings.filter(m => m.action === 'remap' && m.newSubtopic).length} remap · {remapMappings.filter(m => m.action === 'delete').length} delete · {remapMappings.filter(m => m.action === 'ignore').length} ignore
              </span>
            </div>
          </div>
        )
      })()}

      {/* Exam scope & generation context */}
      {!generating && (
        <div style={{
          marginBottom: 20, padding: '14px 16px', borderRadius: 10,
          background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)',
        }}>
          <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
            Exam Scope & Generation Context
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>
            Notes about the real exam, injected into every question-generation prompt for this curriculum — structure ("30 MCQs, 1 mark each"), textbook terminology, scope limits. Saved with the draft.
          </div>
          <textarea
            value={curriculum.exam_context || ''}
            onChange={e => setCurriculum(prev => ({ ...prev, exam_context: e.target.value }))}
            maxLength={3000}
            rows={4}
            placeholder={'e.g. "SACE Stage 2 exam: 30 multiple-choice questions worth 1 mark each, 90 minutes. Use Nelson Chemistry 3 & 4 terminology. Calculators permitted — include calculation-based questions."'}
            style={{
              width: '100%', padding: '8px 10px', borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.1)', background: '#0c1037',
              color: '#f1f5f9', fontSize: 13, fontFamily: FONT_B, outline: 'none',
              resize: 'vertical', boxSizing: 'border-box',
            }}
          />
          <div style={{ fontSize: 11, color: '#475569', textAlign: 'right', marginTop: 4 }}>
            {(curriculum.exam_context || '').length}/3000
          </div>
        </div>
      )}

      {/* Reference resources — textbooks/exams distilled into generation exemplars */}
      {!generating && <CurriculumResourcesPanel curriculumId={curriculumId} />}

      {/* AI revise panel */}
      {!generating && (
        <div style={{
          marginBottom: 20, padding: '14px 16px', borderRadius: 10,
          background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)',
        }}>
          <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
            Revise with AI
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 220, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <textarea
                value={reviseInstruction}
                onChange={e => setReviseInstruction(e.target.value)}
                placeholder='e.g. "Restructure to match the pasted TOC below" or "Add a topic on probability with 3 subtopics"'
                rows={2}
                disabled={revising}
                style={{
                  width: '100%', padding: '8px 10px', borderRadius: 8,
                  border: '1px solid rgba(255,255,255,0.1)', background: '#0c1037',
                  color: '#f1f5f9', fontSize: 13, fontFamily: FONT_B, outline: 'none',
                  resize: 'vertical', boxSizing: 'border-box', opacity: revising ? 0.6 : 1,
                }}
              />
              {/* Toggle paste area */}
              <button
                onClick={() => setShowPasteArea(v => !v)}
                disabled={revising}
                style={{
                  alignSelf: 'flex-start', padding: '4px 10px', borderRadius: 6, border: '1px dashed rgba(255,255,255,0.15)',
                  background: showPasteArea ? 'rgba(241,190,67,0.08)' : 'transparent',
                  color: showPasteArea ? '#f1be43' : '#64748b', fontSize: 12, cursor: 'pointer', fontFamily: FONT_B,
                }}
              >
                {showPasteArea ? '▾ Hide paste area' : '▸ Paste TOC / text document'}
              </button>
              {showPasteArea && (
                <textarea
                  value={reviseSourceText}
                  onChange={e => setReviseSourceText(e.target.value)}
                  placeholder={'Paste a table of contents, topic list, or any text here.\nClaude will use it as the source to restructure the curriculum.'}
                  rows={8}
                  disabled={revising}
                  style={{
                    width: '100%', padding: '8px 10px', borderRadius: 8,
                    border: '1px solid rgba(241,190,67,0.2)', background: 'rgba(241,190,67,0.03)',
                    color: '#f1f5f9', fontSize: 12, fontFamily: FONT_B, outline: 'none',
                    resize: 'vertical', boxSizing: 'border-box', opacity: revising ? 0.6 : 1,
                  }}
                />
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
                borderRadius: 8, cursor: revising ? 'not-allowed' : 'pointer',
                border: reviseDoc ? '1px solid rgba(74,222,128,0.3)' : '1px dashed rgba(255,255,255,0.12)',
                background: reviseDoc ? 'rgba(74,222,128,0.05)' : 'transparent',
                fontSize: 12, color: reviseDoc ? '#4ade80' : '#64748b', whiteSpace: 'nowrap',
              }}>
                <input type="file" accept=".pdf,.txt" disabled={revising} onChange={handleReviseFileUpload} style={{ display: 'none' }} />
                {reviseDoc ? `✓ ${reviseDoc.name}` : '↑ Upload doc'}
                {reviseDoc && (
                  <span onClick={e => { e.preventDefault(); setReviseDoc(null) }} style={{ marginLeft: 4, cursor: 'pointer', color: '#64748b' }}>×</span>
                )}
              </label>
              <button
                onClick={handleRevise}
                disabled={revising || (!reviseInstruction.trim() && !reviseDoc && !reviseSourceText.trim())}
                style={{
                  padding: '8px 16px', borderRadius: 8,
                  border: '1px solid rgba(56,189,248,0.2)',
                  background: (revising || (!reviseInstruction.trim() && !reviseDoc && !reviseSourceText.trim())) ? 'rgba(56,189,248,0.2)' : 'rgba(56,189,248,0.15)',
                  color: (revising || (!reviseInstruction.trim() && !reviseDoc && !reviseSourceText.trim())) ? '#64748b' : '#38bdf8',
                  fontSize: 13, fontWeight: 700, cursor: (revising || (!reviseInstruction.trim() && !reviseDoc && !reviseSourceText.trim())) ? 'not-allowed' : 'pointer',
                  fontFamily: FONT_B,
                }}
              >
                {revising ? 'Revising…' : 'Apply'}
              </button>
            </div>
          </div>
        </div>
      )}

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
