import { useState, useEffect, useRef } from 'react'
import {
  getCurriculumDetail,
  updateCurriculum,
  updateCurriculumStatus,
  getSubtopicStatuses,
  updateSubtopicGenStatus,
  loadManagedCurriculaTopics,
  updateCurriculumFeatures,
} from '../lib/curriculaDb'
import { adminApiPost, prepareCurriculumDoc } from '../lib/adminApi'
import { refreshManagedTopicsCache } from '../lib/adminTopics'
import CurriculumResourcesPanel from './CurriculumResourcesPanel'
import { COHORT_LEVEL_OPTIONS, WRITING_LEVELS } from '../lib/subjects'
import { DEFAULT_EXAM_QUESTIONS } from '../lib/examEngine'
import { TriangleAlert, Sparkles } from 'lucide-react'

import { ui, btn, note, FONT_B } from '../lib/adminUi'

// Subtopics generated at once. Each is one Claude call plus answer
// verification (~1 min), so a 125-subtopic curriculum takes ~40 min, not ~2 h.
const GEN_CONCURRENCY = 3

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
          background: 'var(--t-bgInput)', border: '1px solid var(--t-borderStrong)',
          borderRadius: 5, padding: '2px 6px', outline: 'none', color: 'var(--t-text)',
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
      onMouseEnter={e => e.currentTarget.style.background = 'var(--t-bgHover)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      {value}
    </span>
  )
}

// One progress row per subtopic, in curriculum order, carrying its topic name
// (needed by /api/admin/curriculum-generate).
function subtopicProgress(detail) {
  return detail.topics.flatMap(t => t.subtopics.map(s => ({
    id: s.id, name: s.name, topic_id: t.id, topicName: t.name,
    gen_status: s.gen_status || 'pending', questions_generated: s.questions_generated || 0,
  })))
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
  const [reviseDoc, setReviseDoc]     = useState(null) // the picked File
  const [revising, setRevising]       = useState(false)
  // Generation is driven from this tab: `running` is true while this tab's
  // queue is sending subtopics. A curriculum can be 'generating' with nothing
  // running (tab closed or reloaded mid-run); it then shows a Resume button.
  const [running, setRunning]         = useState(false)
  const runningRef = useRef(false) // set synchronously, so a double click can't start two runs
  const stopRef = useRef(false)
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
    return () => { clearInterval(pollRef.current); stopRef.current = true }
  }, [curriculumId])

  // Leaving the page stops generation, so ask first while it is running.
  useEffect(() => {
    if (!running) return
    const warn = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [running])

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
        setProgress(subtopicProgress(detail))
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
  const setTopicStyle = (ti, question_style) => setTopics(prev => prev.map((t, i) => i === ti ? { ...t, question_style } : t))
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
    if (file) setReviseDoc(file)
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
      if (reviseDoc) {
        const doc = await prepareCurriculumDoc(reviseDoc)
        // A .txt document joins any text pasted into the reference box.
        if (doc.sourceText) payload.sourceText = [payload.sourceText, doc.sourceText].filter(Boolean).join('\n\n')
        else payload.docStoragePath = doc.docStoragePath
      }
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
        curriculumId: curriculum.id,
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
        curriculumId: curriculum.id,
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

  // ── Feature switches (saved immediately, independent of the draft Save) ────

  const [featureSaving, setFeatureSaving] = useState(false)
  const saveFeatures = async (patch) => {
    const next = { ...(curriculum.features || {}), ...patch }
    const prev = curriculum.features || {}
    setCurriculum(c => ({ ...c, features: next }))
    setFeatureSaving(true); setError('')
    try {
      await updateCurriculumFeatures(curriculumId, next)
    } catch (e) {
      setCurriculum(c => ({ ...c, features: prev }))
      setError(`Couldn't save features: ${e.message}`)
    }
    setFeatureSaving(false)
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
    if (runningRef.current) return
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
      const allSubtopics = subtopicProgress(freshDetail).map(p => ({ ...p, gen_status: 'pending', questions_generated: 0 }))
      setProgress(allSubtopics)
      startPolling()
      setSaving(false)
      await runGeneration(async () => allSubtopics, freshDetail.name)
      return
    } catch (e) {
      setError(e.message)
      setGenerating(false)
    }
    setSaving(false)
  }

  // Continue a run that stopped part-way (tab closed, reloaded or paused):
  // everything not yet done or failed is queued again. A subtopic left at
  // 'generating' by a dropped request is retried too; the server skips any
  // question text it already holds.
  const handleResume = async () => {
    setError('')
    try {
      await runGeneration(async () => {
        const freshDetail = await getCurriculumDetail(curriculumId)
        const all = subtopicProgress(freshDetail)
        setProgress(all)
        startPolling()
        return all.filter(p => p.gen_status !== 'done' && p.gen_status !== 'failed')
      }, curriculum.name)
    } catch (e) {
      setError(e.message)
    }
  }

  const handlePause = () => { stopRef.current = true }

  const handleRetry = (sub) => {
    // Progress rows refreshed by polling carry topic_id, not the topic name.
    const topicName = sub.topicName || topics.find(t => t.id === sub.topic_id)?.name
    return generateSubtopic({ ...sub, topicName }, curriculum.name)
  }

  async function generateSubtopic(sub, subjectName) {
    setProgress(prev => prev.map(p => p.id === sub.id ? { ...p, gen_status: 'generating' } : p))
    try {
      const { inserted } = await adminApiPost('/api/admin/curriculum-generate', {
        subtopicId: sub.id,
        curriculumId,
        subjectName,
        topicName: sub.topicName,
        subtopicName: sub.name,
        count: 5,
      })
      setProgress(prev => prev.map(p => p.id === sub.id ? { ...p, gen_status: 'done', questions_generated: inserted ?? 5 } : p))
    } catch {
      setProgress(prev => prev.map(p => p.id === sub.id ? { ...p, gen_status: 'failed' } : p))
      // A request cut off by the serverless time limit leaves the row at
      // 'generating', which the poll would read back, so the run never ends.
      updateSubtopicGenStatus(sub.id, 'failed').catch(() => {})
    }
  }

  // Works through the queue `loadQueue` returns, GEN_CONCURRENCY subtopics at
  // a time, until it is empty or the admin pauses. The 5 s poll marks the
  // curriculum live once every subtopic is done or failed.
  async function runGeneration(loadQueue, subjectName) {
    if (runningRef.current) return
    runningRef.current = true
    stopRef.current = false
    setRunning(true)
    try {
      const queue = await loadQueue()
      let next = 0
      const worker = async () => {
        while (!stopRef.current && next < queue.length) {
          await generateSubtopic(queue[next++], subjectName)
        }
      }
      await Promise.all(Array.from({ length: Math.min(GEN_CONCURRENCY, queue.length) }, worker))
    } finally {
      runningRef.current = false
      setRunning(false)
    }
  }

  if (loading) return <div style={{ color: 'var(--t-textMuted)', fontSize: 13, fontFamily: FONT_B }}>Loading curriculum…</div>
  if (!curriculum) return <div style={{ color: 'var(--t-danger)', fontSize: 13, fontFamily: FONT_B }}>{error || 'Curriculum not found.'}</div>

  const totalSubtopics = topics.reduce((n, t) => n + t.subtopics.length, 0)
  const doneCount   = (progress || []).filter(p => p.gen_status === 'done').length
  const failedCount = (progress || []).filter(p => p.gen_status === 'failed').length
  const totalQs     = (progress || []).reduce((n, p) => n + (p.questions_generated || 0), 0)
  const remainingCount = (progress || []).length - doneCount - failedCount
  const isDraft     = curriculum.status === 'draft'

  const statusLabel = { live: 'Live', generating: 'Generating', draft: 'Draft' }[curriculum.status] || curriculum.status
  const statusColor = curriculum.status === 'live' ? 'var(--t-success)' : curriculum.status === 'generating' ? 'var(--t-textSub)' : 'var(--t-goldText)'

  return (
    <div style={{ fontFamily: FONT_B, color: 'var(--t-textSub)' }}>

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24, flexWrap: 'wrap' }}>
        <button
          onClick={onBack}
          style={{ background: 'none', border: 'none', color: 'var(--t-textMuted)', cursor: 'pointer', fontSize: 13, fontFamily: FONT_B, padding: 0 }}
        >
          ← Subjects
        </button>
        <EditableText
          value={curriculum.name}
          onSave={name => setCurriculum(prev => ({ ...prev, name }))}
          style={{ fontSize: 18, fontWeight: 800, color: 'var(--t-text)' }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--t-textMuted)', marginLeft: 4 }}>
          <span style={{ flexShrink: 0 }}>Level</span>
          <select
            value={curriculum.level_label || ''}
            onChange={e => setCurriculum(prev => ({ ...prev, level_label: e.target.value }))}
            disabled={generating}
            style={{ ...ui.input, padding: '5px 9px', fontSize: 12.5, minWidth: 120, opacity: generating ? 0.5 : 1 }}
          >
            <option value="">Select…</option>
            {COHORT_LEVEL_OPTIONS.map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </label>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: statusColor }}>{statusLabel}</span>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {saveOk && <span role="status" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--t-success)' }}>Saved</span>}
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
            {saving ? 'Saving…' : 'Save'}
          </button>
          {isDraft && (
            <button
              onClick={handleApproveAndGenerate}
              disabled={saving || totalSubtopics === 0}
              style={btn('primary', saving || totalSubtopics === 0)}
            >
              Approve and generate questions
            </button>
          )}
        </div>
      </div>

      {error && <div role="alert" style={{ ...note('danger'), marginBottom: 14 }}>{error}</div>}
      {genError && <div role="alert" style={{ ...note('danger'), marginBottom: 14 }}>{genError}</div>}

      {/* Remap success notice */}
      {remapResult && (
        <div style={{
          marginBottom: 14, padding: '10px 14px',
          background: 'var(--t-successBg)', border: '1px solid var(--t-success)',
          borderRadius: 9, fontSize: 13, color: 'var(--t-success)', display: 'flex', alignItems: 'center', gap: 8,
        }}>
          Done: {remapResult.updated} group{remapResult.updated === 1 ? '' : 's'} moved, {remapResult.deleted} deleted.
          <button onClick={() => setRemapResult(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--t-success)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
        </div>
      )}

      {/* Orphaned questions banner */}
      {orphanInfo && !showRemap && (
        <div style={{
          marginBottom: 14, padding: '12px 16px',
          background: 'var(--t-bgSubtle)', border: '1px solid var(--t-border)',
          borderRadius: 10, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        }}>
          <TriangleAlert size={18} color="var(--t-goldText)" aria-hidden="true" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-goldText)' }}>
              {orphanInfo.count} question{orphanInfo.count !== 1 ? 's' : ''} no longer match a subtopic
            </div>
            <div style={{ fontSize: 12, color: 'var(--t-textMuted)', marginTop: 2 }}>
              They're in the question bank, but their subtopic isn't in this plan any more. Move them to a current subtopic or delete them.
            </div>
          </div>
          <button
            onClick={() => setShowRemap(true)}
            style={{
              padding: '7px 14px', borderRadius: 8, border: '1px solid var(--t-border)',
              background: 'var(--t-bgSubtle)', color: 'var(--t-goldText)',
              fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B, flexShrink: 0,
            }}
          >
            Sort them out
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
            border: '1px solid var(--t-border)',
            background: 'var(--t-bgSubtle)', overflow: 'hidden',
          }}>
            {/* Panel header */}
            <div style={{
              padding: '14px 16px', borderBottom: '1px solid var(--t-border)',
              display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-goldText)' }}>
                  Move questions to current subtopics
                </div>
                <div style={{ fontSize: 12, color: 'var(--t-textMuted)', marginTop: 2 }}>
                  {orphanInfo.count} questions across {orphanInfo.orphanedSubtopics.length} old subtopic(s).
                  Assign each to a new subtopic or choose to delete.
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button
                  onClick={handleSuggestRemap}
                  disabled={remapSuggesting || remapApplying}
                  style={{
                    padding: '7px 13px', borderRadius: 8, border: '1px solid var(--t-border)',
                    background: 'var(--t-bgSubtle)', color: remapSuggesting ? 'var(--t-textMuted)' : 'var(--t-textSub)',
                    fontSize: 12, fontWeight: 700, cursor: remapSuggesting ? 'not-allowed' : 'pointer', fontFamily: FONT_B,
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                  }}
                >
                  <Sparkles size={13} aria-hidden="true" />
                  {remapSuggesting ? 'Suggesting…' : 'Suggest with AI'}
                </button>
                <button
                  onClick={() => setShowRemap(false)}
                  style={{
                    padding: '7px 12px', borderRadius: 8, border: '1px solid var(--t-border)',
                    background: 'transparent', color: 'var(--t-textMuted)', fontSize: 12, cursor: 'pointer', fontFamily: FONT_B,
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
                  background: 'var(--t-bgCard)', border: '1px solid var(--t-border)',
                }}>
                  {/* Old subtopic info */}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: 'var(--t-text)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {m.name}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--t-textMuted)', marginTop: 1 }}>
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
                      padding: '5px 8px', borderRadius: 6, border: '1px solid var(--t-border)',
                      background: 'var(--t-bgInput)', color: 'var(--t-textSub)', fontSize: 12, fontFamily: FONT_B, cursor: 'pointer',
                    }}
                  >
                    <option value="remap">Move to…</option>
                    <option value="delete">Delete questions</option>
                    <option value="ignore">Leave as they are</option>
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
                        padding: '5px 8px', borderRadius: 6, border: `1px solid ${m.newSubtopic ? 'var(--t-success)' : 'var(--t-border)'}`,
                        background: 'var(--t-bgInput)', color: m.newSubtopic ? 'var(--t-success)' : 'var(--t-goldText)',
                        fontSize: 12, fontFamily: FONT_B, cursor: 'pointer', maxWidth: 280,
                      }}
                    >
                      <option value="">Choose a subtopic</option>
                      {allSubtopicOptions.map(opt => (
                        <option key={`${opt.topic}|||${opt.subtopic}`} value={`${opt.topic}|||${opt.subtopic}`}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div style={{ width: 200, fontSize: 12, color: m.action === 'delete' ? 'var(--t-danger)' : 'var(--t-textMuted)', fontStyle: 'italic' }}>
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
                style={btn('primary', remapApplying || remapMappings.every(m => m.action === 'ignore'))}
              >
                {remapApplying ? 'Applying…' : 'Apply'}
              </button>
              <span style={{ fontSize: 12, color: 'var(--t-textMuted)' }}>
                {remapMappings.filter(m => m.action === 'remap' && m.newSubtopic).length} to move · {remapMappings.filter(m => m.action === 'delete').length} to delete · {remapMappings.filter(m => m.action === 'ignore').length} left
              </span>
            </div>
          </div>
        )
      })()}

      {/* Per-subject feature switches */}
      {!generating && (
        <FeatureSwitches features={curriculum.features || {}} saving={featureSaving} onChange={saveFeatures} />
      )}

      {/* Exam scope & generation context */}
      {!generating && (
        <div style={{
          marginBottom: 20, padding: '14px 16px', borderRadius: 10,
          background: 'var(--t-bgCard)', border: '1px solid var(--t-border)',
        }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--t-text)', marginBottom: 4 }}>
            About the exam
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--t-textMuted)', marginBottom: 10 }}>
            Notes on the real exam that AI uses whenever it writes questions for this subject: its structure ("30 multiple-choice questions, 1 mark each"), textbook terms, what's out of scope. Saved with the plan.
          </div>
          <textarea
            value={curriculum.exam_context || ''}
            onChange={e => setCurriculum(prev => ({ ...prev, exam_context: e.target.value }))}
            maxLength={3000}
            rows={4}
            placeholder={'e.g. "SACE Stage 2 exam: 30 multiple-choice questions worth 1 mark each, 90 minutes. Use Nelson Chemistry 3 & 4 terminology. Calculators permitted — include calculation-based questions."'}
            style={{
              width: '100%', padding: '8px 10px', borderRadius: 8,
              border: '1px solid var(--t-border)', background: 'var(--t-bgInput)',
              color: 'var(--t-text)', fontSize: 13, fontFamily: FONT_B, outline: 'none',
              resize: 'vertical', boxSizing: 'border-box',
            }}
          />
          <div style={{ fontSize: 11, color: 'var(--t-textFaint)', textAlign: 'right', marginTop: 4 }}>
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
          background: 'var(--t-bgCard)', border: '1px solid var(--t-border)',
        }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--t-text)', marginBottom: 10 }}>
            Change the plan with AI
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
                  border: '1px solid var(--t-border)', background: 'var(--t-bgInput)',
                  color: 'var(--t-text)', fontSize: 13, fontFamily: FONT_B, outline: 'none',
                  resize: 'vertical', boxSizing: 'border-box', opacity: revising ? 0.6 : 1,
                }}
              />
              {/* Toggle paste area */}
              <button
                onClick={() => setShowPasteArea(v => !v)}
                disabled={revising}
                style={{
                  alignSelf: 'flex-start', padding: '4px 10px', borderRadius: 6, border: '1px dashed var(--t-border)',
                  background: showPasteArea ? 'var(--t-bgSubtle)' : 'transparent',
                  color: showPasteArea ? 'var(--t-goldText)' : 'var(--t-textMuted)', fontSize: 12, cursor: 'pointer', fontFamily: FONT_B,
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
                    border: '1px solid var(--t-border)', background: 'var(--t-bgSubtle)',
                    color: 'var(--t-text)', fontSize: 12, fontFamily: FONT_B, outline: 'none',
                    resize: 'vertical', boxSizing: 'border-box', opacity: revising ? 0.6 : 1,
                  }}
                />
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
                borderRadius: 8, cursor: revising ? 'not-allowed' : 'pointer',
                border: reviseDoc ? '1px solid var(--t-success)' : '1px dashed var(--t-border)',
                background: reviseDoc ? 'var(--t-successBg)' : 'transparent',
                fontSize: 12, color: reviseDoc ? 'var(--t-success)' : 'var(--t-textMuted)', whiteSpace: 'nowrap',
              }}>
                <input type="file" accept=".pdf,.txt" disabled={revising} onChange={handleReviseFileUpload} style={{ display: 'none' }} />
                {reviseDoc ? `✓ ${reviseDoc.name}` : '↑ Upload doc'}
                {reviseDoc && (
                  <span onClick={e => { e.preventDefault(); setReviseDoc(null) }} style={{ marginLeft: 4, cursor: 'pointer', color: 'var(--t-textMuted)' }}>×</span>
                )}
              </label>
              <button
                onClick={handleRevise}
                disabled={revising || (!reviseInstruction.trim() && !reviseDoc && !reviseSourceText.trim())}
                style={{
                  padding: '8px 16px', borderRadius: 8,
                  border: '1px solid var(--t-border)',
                  background: (revising || (!reviseInstruction.trim() && !reviseDoc && !reviseSourceText.trim())) ? 'var(--t-bgSubtle)' : 'var(--t-bgSubtle)',
                  color: (revising || (!reviseInstruction.trim() && !reviseDoc && !reviseSourceText.trim())) ? 'var(--t-textMuted)' : 'var(--t-textSub)',
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

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>

        {/* Left: tree editor */}
        <div style={{ flex: '1 1 420px', minWidth: 0 }}>
          {topics.map((topic, ti) => (
            <div key={ti} style={{ marginBottom: 14 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 14px', borderRadius: 10,
                background: 'var(--t-bgCard)',
                border: '1px solid var(--t-border)',
              }}>
                <span style={{ fontSize: 10, color: 'var(--t-textMuted)', fontWeight: 700, width: 22, flexShrink: 0 }}>T{ti + 1}</span>
                <EditableText
                  value={topic.name}
                  onSave={name => renameTopic(ti, name)}
                  style={{ flex: 1, fontSize: 14, fontWeight: 700, color: 'var(--t-text)' }}
                />
                <select
                  value={topic.question_style || 'standard'}
                  onChange={e => setTopicStyle(ti, e.target.value)}
                  title="How questions for this topic are generated. Saved with the curriculum."
                  style={{
                    flexShrink: 0, padding: '3px 6px', borderRadius: 6, fontSize: 11, fontFamily: FONT_B,
                    border: '1px solid var(--t-border)', background: 'var(--t-bgInput)',
                    color: topic.question_style === 'passage' ? 'var(--t-goldText)' : 'var(--t-textMuted)',
                  }}
                >
                  <option value="standard">Standard questions</option>
                  <option value="passage">Reading passages</option>
                </select>
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
                    background: 'var(--t-bgCard)',
                    border: '1px solid var(--t-border)',
                  }}>
                    <span style={{ fontSize: 10, color: 'var(--t-textFaint)', width: 30, flexShrink: 0 }}>{ti + 1}.{si + 1}</span>
                    <EditableText
                      value={sub.name}
                      onSave={name => renameSubtopic(ti, si, name)}
                      style={{ flex: 1, fontSize: 13, color: 'var(--t-textSub)' }}
                    />
                    <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                      <IconBtn onClick={() => moveSubtopicUp(ti, si)}   disabled={si === 0}                          small>↑</IconBtn>
                      <IconBtn onClick={() => moveSubtopicDown(ti, si)} disabled={si === topic.subtopics.length - 1} small>↓</IconBtn>
                      <IconBtn onClick={() => deleteSubtopic(ti, si)}   danger small>×</IconBtn>
                    </div>
                  </div>
                ))}
                <button onClick={() => addSubtopic(ti)} style={{ ...addBtn, marginTop: 2 }}>
                  + Add subtopic
                </button>
              </div>
            </div>
          ))}

          <button onClick={addTopic} style={{ ...addBtn, marginTop: 8, padding: '10px 16px', fontSize: 13 }}>
            + Add topic
          </button>
        </div>

        {/* Right: generation progress panel */}
        {progress && (
          <div style={{
            flex: '0 1 320px', minWidth: 260,
            position: 'sticky', top: 0,
            background: 'var(--t-bgCard)',
            border: '1px solid var(--t-border)',
            borderRadius: 12, padding: 16,
            maxHeight: 'calc(100vh - 200px)', overflowY: 'auto',
          }}>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--t-text)', marginBottom: 12 }}>
              Generating questions
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ height: 6, borderRadius: 3, background: 'var(--t-bgSubtle)', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 3, background: 'var(--t-success)',
                  width: `${progress.length > 0 ? Math.round(((doneCount + failedCount) / progress.length) * 100) : 0}%`,
                  transition: 'width 0.4s',
                }} />
              </div>
              <div style={{ fontSize: 12, color: 'var(--t-textMuted)', marginTop: 5 }}>
                {totalQs} questions · {doneCount} of {progress.length} subtopics done
                {failedCount > 0 && <span style={{ color: 'var(--t-danger)' }}> · {failedCount} failed</span>}
              </div>
            </div>

            {generating && running && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <div style={{ flex: 1, fontSize: 11, color: 'var(--t-textMuted)', lineHeight: 1.4 }}>
                  Keep this tab open: generation runs from it and stops if you close it.
                </div>
                <button onClick={handlePause} style={secondaryBtn(false)}>Pause</button>
              </div>
            )}
            {generating && !running && remainingCount > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <div style={{ flex: 1, fontSize: 11, color: 'var(--t-goldText)', lineHeight: 1.4 }}>
                  Paused with {remainingCount} subtopic{remainingCount === 1 ? '' : 's'} to go.
                </div>
                <button onClick={handleResume} style={btn('primary')}>Resume</button>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {progress.map(p => {
                const chipColor = p.gen_status === 'done' ? 'var(--t-success)' : p.gen_status === 'failed' ? 'var(--t-danger)' : p.gen_status === 'generating' ? 'var(--t-textSub)' : 'var(--t-textMuted)'
                return (
                  <div key={p.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '7px 10px', borderRadius: 8,
                    background: 'var(--t-bgCard)',
                    border: '1px solid var(--t-border)',
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: 'var(--t-textSub)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                    </div>
                    <span style={{
                      fontSize: 10, fontWeight: 700, flexShrink: 0,
                      color: chipColor,
                      padding: '1px 0',
                    }}>
                      {p.gen_status === 'done' ? `${p.questions_generated} questions` : p.gen_status === 'generating' ? 'Writing…' : p.gen_status === 'failed' ? 'Failed' : 'Waiting'}
                    </span>
                    {p.gen_status === 'failed' && (
                      <button
                        onClick={() => handleRetry(p)}
                        style={{
                          background: 'none', border: '1px solid var(--t-danger)',
                          borderRadius: 6, color: 'var(--t-danger)', fontSize: 11.5, fontWeight: 700,
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
        border: '1px solid var(--t-border)',
        background: 'transparent',
        color: disabled ? 'var(--t-textFaint)' : danger ? 'var(--t-danger)' : 'var(--t-textSub)',
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

const addBtn = {
  background: 'none', border: '1px dashed var(--t-borderStrong)',
  borderRadius: 8, color: 'var(--t-textMuted)',
  fontSize: 12.5, fontWeight: 600, cursor: 'pointer', padding: '7px 12px',
  fontFamily: FONT_B,
  width: '100%', textAlign: 'left',
}

const secondaryBtn = (disabled) => btn('secondary', disabled)

/** Optional student tools for this subject. Everything is off unless switched on here. */
function FeatureSwitches({ features, saving, onChange }) {
  const row = { display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', cursor: 'pointer' }
  const numInput = {
    width: 70, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--t-border)',
    background: 'var(--t-bgInput)', color: 'var(--t-text)', fontSize: 13, fontFamily: FONT_B,
  }
  const commitNumber = (key) => (e) => {
    const v = Math.round(Number(e.target.value))
    onChange({ [key]: v > 0 ? v : undefined })
  }
  return (
    <div style={{
      marginBottom: 20, padding: '14px 16px', borderRadius: 10,
      background: 'var(--t-bgCard)', border: '1px solid var(--t-border)',
    }}>
      <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--t-text)', marginBottom: 4 }}>
        Student features {saving && <span style={{ fontWeight: 500, color: 'var(--t-textMuted)' }}>· saving…</span>}
      </div>
      <div style={{ fontSize: 12, color: 'var(--t-textMuted)', marginBottom: 6 }}>
        Optional tools shown to students of this subject only. Changes save immediately.
      </div>

      <label style={row}>
        <input type="checkbox" checked={!!features.exam_mode} onChange={e => onChange({ exam_mode: e.target.checked })} style={{ accentColor: 'var(--t-text)' }} />
        <span>
          <span style={{ fontSize: 13, color: 'var(--t-text)', fontWeight: 600 }}>Exam Mode</span>
          <span style={{ display: 'block', fontSize: 12, color: 'var(--t-textMuted)' }}>Timed practice exam drawn from this subject's question bank (Practice → Exam Mode).</span>
        </span>
      </label>
      {features.exam_mode && (
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', padding: '0 0 8px 26px', fontSize: 12, color: 'var(--t-textMuted)' }}>
          <label>Questions{' '}
            <input type="number" min={1} max={200} style={numInput}
              defaultValue={features.exam_questions ?? DEFAULT_EXAM_QUESTIONS}
              onBlur={commitNumber('exam_questions')} />
          </label>
          <label>Minutes{' '}
            <input type="number" min={1} max={300} style={numInput}
              defaultValue={features.exam_minutes ?? ''} placeholder="auto"
              onBlur={commitNumber('exam_minutes')} />
          </label>
          <span style={{ color: 'var(--t-textFaint)' }}>Blank minutes = 1.5 min per question.</span>
        </div>
      )}

      <div style={{ ...row, cursor: 'default' }}>
        <select
          value={features.writing || ''}
          onChange={e => onChange({ writing: e.target.value || undefined })}
          style={{ ...numInput, width: 'auto' }}
        >
          <option value="">Off</option>
          {WRITING_LEVELS.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
        </select>
        <span>
          <span style={{ fontSize: 13, color: 'var(--t-text)', fontWeight: 600 }}>Writing</span>
          <span style={{ display: 'block', fontSize: 12, color: 'var(--t-textMuted)' }}>Writing section (essays, prompt planner, history) pitched at the chosen year level.</span>
        </span>
      </div>

      <label style={row}>
        <input type="checkbox" checked={!!features.essay_marker} onChange={e => onChange({ essay_marker: e.target.checked })} style={{ accentColor: 'var(--t-text)' }} />
        <span>
          <span style={{ fontSize: 13, color: 'var(--t-text)', fontWeight: 600 }}>Essay Marker</span>
          <span style={{ display: 'block', fontSize: 12, color: 'var(--t-textMuted)' }}>AI marking of persuasive, narrative and GAMSAT-style essays (Learn → Essay Marker).</span>
        </span>
      </label>

      <label style={row}>
        <input type="checkbox" checked={!!features.exam_grade_topups} onChange={e => onChange({ exam_grade_topups: e.target.checked || undefined })} style={{ accentColor: 'var(--t-text)' }} />
        <span>
          <span style={{ fontSize: 13, color: 'var(--t-text)', fontWeight: 600 }}>Exam-grade top-ups</span>
          <span style={{ display: 'block', fontSize: 12, color: 'var(--t-textMuted)' }}>
            When a student working at difficulty 4–5 is running low on questions, the background top-up uses the exam-grade
            generator (strongest model, graphs, strict answer check) instead of the everyday one. Paid, granted and beta
            students only, never the free subject. Costs roughly 20–30c per question.
          </span>
        </span>
      </label>
      {features.exam_grade_topups && (
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', padding: '0 0 8px 26px', fontSize: 12, color: 'var(--t-textMuted)' }}>
          <label>Per student per day{' '}
            <input type="number" min={1} max={60} style={numInput}
              defaultValue={features.exam_grade_daily_limit ?? 9}
              onBlur={commitNumber('exam_grade_daily_limit')} />
          </label>
          <span style={{ color: 'var(--t-textFaint)' }}>questions. Past the limit, top-ups use the everyday generator.</span>
        </div>
      )}
    </div>
  )
}
