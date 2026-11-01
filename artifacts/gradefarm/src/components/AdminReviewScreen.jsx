import { useState, useEffect, useCallback } from 'react'
import { getDraftQuestions, upsertDraftQuestion, approveDraftQuestion, rejectDraftQuestion } from '../lib/adminDb'
import { getVariantCountsByConceptTags } from '../lib/db'
import { getTopicsBySubject } from '../lib/adminTopics'
import MathText from './MathText'
import { Check, X } from 'lucide-react'
import { ui, chip, btn, note, FONT_B } from '../lib/adminUi'
const OPTION_LABELS = ['A', 'B', 'C', 'D']

function StatusBadge({ status }) {
  const key = String(status || 'pending').trim().toLowerCase()
  const map = {
    pending:      ['Waiting', 'var(--t-textMuted)'],
    needs_review: ['No clear topic', 'var(--t-goldText)'],
    approved:     ['Approved', 'var(--t-success)'],
    rejected:     ['Rejected', 'var(--t-textFaint)'],
  }
  const [label, color] = map[key] || map.pending
  return <span style={{ fontSize: 12, fontWeight: 600, color }}>{label}</span>
}

export default function AdminReviewScreen({ profile, onChange }) {

  // ── Drafts tab state ─────────────────────────────────────────────────────────
  const [drafts,         setDrafts]         = useState([])
  const [loading,        setLoading]        = useState(true)
  const [filterStatus,   setFilterStatus]   = useState('pending')
  const [selected,       setSelected]       = useState(null)
  const [editState,      setEditState]      = useState(null)
  const [saving,         setSaving]         = useState(false)
  const [checked,        setChecked]        = useState(new Set())
  const [actionError,    setActionError]    = useState(null)
  const [actionOk,       setActionOk]       = useState(null)

  // null  = counts not yet loaded / unavailable (hide badge rather than show false 0)
  // {}    = loaded but no variants found for any draft
  // {...} = loaded with real per-conceptTag counts
  const [variantCounts,       setVariantCounts]       = useState(null)
  // map from draft.id → derived conceptTag, built alongside variantCounts
  const [draftConceptTagMap,  setDraftConceptTagMap]  = useState({})

  /** Mirror the concept_tag formula used in approveDraftQuestion */
  const deriveConceptTag = (draft) => {
    if (!draft.subject || !draft.topic) return null
    return `${draft.subject}|${draft.topic}|${draft.subtopic || draft.topic}`.toLowerCase()
  }

  const load = useCallback(async (opts = {}) => {
    const { skipLoading } = opts
    if (!skipLoading) setLoading(true)
    try {
      const data = await getDraftQuestions({
        status: filterStatus === 'all' ? undefined : filterStatus,
      })
      setDrafts(data)

      if (data.length > 0) {
        // Build draft-id → conceptTag map so the render can look up counts
        const ctMap = {}
        data.forEach(d => {
          const ct = deriveConceptTag(d)
          if (ct) ctMap[d.id] = ct
        })
        setDraftConceptTagMap(ctMap)

        try {
          const uniqueTags = [...new Set(Object.values(ctMap))]
          const counts = await getVariantCountsByConceptTags(uniqueTags)
          setVariantCounts(counts)
        } catch (e) {
          console.warn('Could not load variant counts:', e)
          setVariantCounts(null)   // explicitly unavailable — don't show false zeros
        }
      } else {
        setDraftConceptTagMap({})
        setVariantCounts({})
      }
    } catch (e) {
      console.error(e)
    } finally {
      if (!skipLoading) setLoading(false)
    }
  }, [filterStatus])

  useEffect(() => { load() }, [load])


  useEffect(() => {
    setActionError(null)
    setActionOk(null)
  }, [filterStatus])

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
      const updatedDrafts = drafts.map(d => (String(d.id) === String(editState.id) ? { ...editState } : d))
      setDrafts(updatedDrafts)
      setSelected({ ...editState })

      // Recompute concept tag map in case subject/topic/subtopic changed, then
      // re-fetch counts so the badge reflects the new concept's variants immediately.
      const newCtMap = {}
      updatedDrafts.forEach(d => {
        const ct = deriveConceptTag(d)
        if (ct) newCtMap[d.id] = ct
      })
      setDraftConceptTagMap(newCtMap)
      try {
        const uniqueTags = [...new Set(Object.values(newCtMap))]
        const counts = await getVariantCountsByConceptTags(uniqueTags)
        setVariantCounts(counts)
      } catch (e) {
        console.warn('Could not refresh variant counts after save:', e)
        setVariantCounts(null)
      }
    } catch (e) { console.error(e) }
    finally { setSaving(false) }
  }

  const bumpDraftListAfterStatusChange = (draftId, newStatus) => {
    const id = String(draftId)
    if (filterStatus === 'all') {
      setDrafts(prev => prev.map(d => (String(d.id) === id ? { ...d, status: newStatus } : d)))
    } else {
      setDrafts(prev => prev.filter(d => String(d.id) !== id))
    }
  }

  const handleApprove = async (draftId) => {
    setSaving(true)
    setActionError(null)
    setActionOk(null)
    try {
      if (editState && String(editState.id) === String(draftId)) {
        await upsertDraftQuestion(editState)
      }
      await approveDraftQuestion(draftId, profile.id)
      setChecked(prev => {
        const next = new Set(prev)
        next.delete(draftId)
        return next
      })
      closePanel()
      setActionOk('Question published to the live bank.')
      bumpDraftListAfterStatusChange(draftId, 'approved')
      await load({ skipLoading: true })
      onChange?.()
    } catch (e) {
      console.error(e)
      setActionError(e.message || 'Could not approve — check console or Supabase RLS / questions table.')
    } finally {
      setSaving(false)
    }
  }

  const handleReject = async (draftId) => {
    setSaving(true)
    setActionError(null)
    setActionOk(null)
    try {
      await rejectDraftQuestion(draftId, profile.id)
      setChecked(prev => {
        const next = new Set(prev)
        next.delete(draftId)
        return next
      })
      closePanel()
      setActionOk('Draft marked as rejected (still in database for audit).')
      bumpDraftListAfterStatusChange(draftId, 'rejected')
      await load({ skipLoading: true })
      onChange?.()
    } catch (e) {
      console.error(e)
      setActionError(e.message || 'Could not reject this draft.')
    } finally {
      setSaving(false)
    }
  }

  const handleBulkApprove = async () => {
    const ids = [...checked]
    const total = ids.length
    if (total === 0) return
    setSaving(true)
    setActionError(null)
    setActionOk(null)
    let failed = 0
    for (const id of ids) {
      try {
        await approveDraftQuestion(id, profile.id)
      } catch (e) {
        console.error(e)
        failed += 1
      }
    }
    setChecked(new Set())
    setSaving(false)
    if (failed > 0) {
      setActionError(
        `${failed} of ${total} could not be approved. Open the browser console for details, or check Supabase RLS on the questions table.`
      )
    } else {
      setActionOk(`Published ${total} question(s) to the live bank.`)
    }
    await load({ skipLoading: true })
    onChange?.()
  }

  const toggleCheck = (id, e) => {
    e.stopPropagation()
    setChecked(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleSelectAll = () => {
    const allIds = drafts.map(d => d.id)
    const allChecked = allIds.length > 0 && allIds.every(id => checked.has(id))
    if (allChecked) {
      setChecked(new Set())
    } else {
      setChecked(new Set(allIds))
    }
  }

  const allChecked = drafts.length > 0 && drafts.every(d => checked.has(d.id))

  const topicsForSubject = (subject) => getTopicsBySubject(subject)

  const inputStyle = { ...ui.input, width: '100%' }
  const fieldLabel = { ...ui.label, fontSize: 12 }

  // How many stored variants a draft's concept has, or null when unknown.
  const variantsFor = (id) => {
    if (variantCounts === null) return null
    const ct = draftConceptTagMap[id]
    return ct ? (variantCounts[ct] ?? 0) : null
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, fontFamily: FONT_B }}>
      <style>{`
        .rv-layout { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; align-items: start; }
        .rv-layout.has-panel { grid-template-columns: minmax(0, 1fr) 400px; }
        .rv-panel { position: sticky; top: 0; max-height: calc(100vh - 200px); overflow-y: auto; }
        .rv-row:hover { background: var(--t-bgHover); }
        @media (max-width: 1100px) { .rv-layout.has-panel { grid-template-columns: minmax(0, 1fr); } .rv-panel { position: static; max-height: none; } }
      `}</style>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div role="group" aria-label="Show" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[['pending', 'Waiting'], ['needs_review', 'No clear topic'], ['all', 'All']].map(([s, label]) => (
            <button key={s} type="button" aria-pressed={filterStatus === s} onClick={() => { setFilterStatus(s); setChecked(new Set()) }} style={chip(filterStatus === s)}>{label}</button>
          ))}
        </div>
        {!loading && <span style={{ fontSize: 12.5, color: 'var(--t-textMuted)' }}>{drafts.length} question{drafts.length === 1 ? '' : 's'}</span>}
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', flexWrap: 'wrap' }}>
          {drafts.length > 0 && (
            <button type="button" onClick={handleSelectAll} disabled={saving} style={btn('secondary', saving)}>
              {allChecked ? 'Clear selection' : 'Select all'}
            </button>
          )}
          {checked.size > 0 && (
            <button type="button" onClick={handleBulkApprove} disabled={saving} style={btn('primary', saving)}>
              Approve {checked.size}
            </button>
          )}
        </div>
      </div>

      {actionOk && <div role="status" style={note('success')}>{actionOk}</div>}
      {actionError && <div role="alert" style={note('danger')}>{actionError}</div>}

      <div className={`rv-layout${editState ? ' has-panel' : ''}`}>
      {/* Left: the queue */}
      <div style={{ minWidth: 0 }}>
        {loading ? (
          <div style={{ color: 'var(--t-textMuted)', fontSize: 13 }}>Loading…</div>
        ) : drafts.length === 0 ? (
          <div style={ui.empty}>
            {filterStatus === 'pending' ? 'Nothing waiting for review. New questions from Add questions land here.' : 'No questions here.'}
          </div>
        ) : (
          <div style={{ ...ui.card, overflow: 'hidden' }}>
            {drafts.map(draft => {
              const on = selected?.id === draft.id
              const vc = variantsFor(draft.id)
              return (
                <div
                  key={draft.id}
                  className="rv-row"
                  role="button"
                  tabIndex={0}
                  onClick={() => openDraft(draft)}
                  onKeyDown={e => { if (e.key === 'Enter') openDraft(draft) }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 14px', borderBottom: '1px solid var(--t-border)',
                    background: on ? 'var(--t-bgSubtle)' : 'transparent', boxShadow: on ? 'inset 2px 0 0 var(--t-text)' : 'none',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    aria-label="Select for approval"
                    checked={checked.has(draft.id)}
                    onChange={e => toggleCheck(draft.id, e)}
                    onClick={e => e.stopPropagation()}
                    style={{ cursor: 'pointer', flexShrink: 0, accentColor: 'var(--t-text)' }}
                  />
                  <span style={{ fontSize: 12, color: 'var(--t-textMuted)', fontWeight: 700, width: 36, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                    {draft.topic_code || '—'}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: 'var(--t-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <MathText text={draft.question} style={{ whiteSpace: 'nowrap' }} />
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--t-textMuted)', flexShrink: 0 }} title="Difficulty">Level {draft.difficulty ?? '?'}</span>
                  {vc != null && (
                    <span style={{ fontSize: 12, flexShrink: 0, color: vc === 0 ? 'var(--t-danger)' : 'var(--t-textMuted)' }}>
                      {vc} variant{vc !== 1 ? 's' : ''}
                    </span>
                  )}
                  {filterStatus === 'all' && <span style={{ flexShrink: 0 }}><StatusBadge status={draft.status} /></span>}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Right: edit panel */}
      {editState && (
        <div className="rv-panel" style={{ ...ui.card, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={ui.heading}>Check this question</span>
            <button type="button" onClick={closePanel} aria-label="Close" style={{ background: 'none', border: 'none', color: 'var(--t-textMuted)', cursor: 'pointer', display: 'flex', padding: 2 }}><X size={16} aria-hidden="true" /></button>
          </div>

          {/* Variant count info */}
          {(() => {
            const vc = variantsFor(editState.id)
            if (variantCounts === null) return <div style={ui.hint}>Stored variants: couldn’t load.</div>
            if (vc == null) return null
            return (
              <div style={{ ...ui.hint, color: vc === 0 ? 'var(--t-danger)' : 'var(--t-textMuted)' }}>
                {vc === 0 ? 'No stored variants for this concept yet. Students who miss it won’t get a similar question.' : `${vc} stored variant${vc === 1 ? '' : 's'} for this concept.`}
              </div>
            )
          })()}

          {/* Topic */}
          <div>
            <label htmlFor="rv-topic" style={fieldLabel}>Topic</label>
            <select
              id="rv-topic"
              value={editState.topic_code || ''}
              onChange={e => {
                const t = topicsForSubject(editState.subject).find(x => x.code === e.target.value)
                setEditState(prev => ({ ...prev, topic_code: e.target.value || null, topic: t?.name || prev.topic }))
              }}
              style={inputStyle}
            >
              <option value="">No clear topic</option>
              {topicsForSubject(editState.subject).map(t => (
                <option key={t.code} value={t.code}>{t.code} · {t.name}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 90px', gap: 10 }}>
            <div>
              <label htmlFor="rv-subtopic" style={fieldLabel}>Subtopic</label>
              <input
                id="rv-subtopic"
                style={inputStyle}
                value={editState.subtopic || ''}
                onChange={e => setEditState(prev => ({ ...prev, subtopic: e.target.value }))}
                placeholder="e.g. Le Chatelier's principle"
              />
            </div>
            <div>
              <label htmlFor="rv-level" style={fieldLabel}>Level (1–5)</label>
              <input
                id="rv-level"
                type="number" min={1} max={5}
                style={inputStyle}
                value={editState.difficulty ?? ''}
                onChange={e => setEditState(prev => ({ ...prev, difficulty: parseInt(e.target.value, 10) || null }))}
              />
            </div>
          </div>

          {/* Question */}
          <div>
            <label htmlFor="rv-question" style={fieldLabel}>Question</label>
            <textarea
              id="rv-question"
              rows={4}
              style={{ ...inputStyle, resize: 'vertical' }}
              value={editState.question || ''}
              onChange={e => setEditState(prev => ({ ...prev, question: e.target.value }))}
            />
            {editState.question && (
              <div style={{ marginTop: 6, padding: '8px 10px', borderRadius: 9, background: 'var(--t-bgSubtle)', fontSize: 13.5, color: 'var(--t-text)' }}>
                <MathText text={editState.question} />
              </div>
            )}
          </div>

          {/* Options */}
          <div>
            <span style={fieldLabel}>Options <span style={{ fontWeight: 500, color: 'var(--t-textMuted)' }}>· tick the right one</span></span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(editState.options || []).map((opt, i) => {
                const right = editState.answer_index === i
                return (
                  <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ width: 14, fontSize: 12.5, fontWeight: 800, color: 'var(--t-textMuted)' }}>{OPTION_LABELS[i]}</span>
                    <input
                      aria-label={`Option ${OPTION_LABELS[i]}`}
                      style={{ ...inputStyle, borderColor: right ? 'var(--t-success)' : 'var(--t-border)' }}
                      value={opt}
                      onChange={e => setEditState(prev => {
                        const opts = [...prev.options]
                        opts[i] = e.target.value
                        return { ...prev, options: opts }
                      })}
                    />
                    <button
                      type="button"
                      onClick={() => setEditState(prev => ({ ...prev, answer_index: i }))}
                      aria-pressed={right}
                      aria-label={`Option ${OPTION_LABELS[i]} is the right answer`}
                      title="The right answer"
                      style={{
                        flexShrink: 0, width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        border: `1px solid ${right ? 'var(--t-success)' : 'var(--t-border)'}`,
                        background: right ? 'var(--t-successBg)' : 'var(--t-bgCard)',
                        color: right ? 'var(--t-success)' : 'var(--t-textFaint)',
                        cursor: 'pointer',
                      }}
                    >
                      <Check size={15} strokeWidth={3} aria-hidden="true" />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Solution */}
          <div>
            <label htmlFor="rv-solution" style={fieldLabel}>Worked solution</label>
            <textarea
              id="rv-solution"
              rows={4}
              style={{ ...inputStyle, resize: 'vertical' }}
              value={editState.solution || ''}
              onChange={e => setEditState(prev => ({ ...prev, solution: e.target.value }))}
            />
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => handleApprove(editState.id)} disabled={saving} style={btn('primary', saving)}>
              Approve
            </button>
            <button type="button" onClick={handleSave} disabled={saving} style={btn('secondary', saving)}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            <button type="button" onClick={() => handleReject(editState.id)} disabled={saving} style={{ ...btn('danger', saving), marginLeft: 'auto' }}>
              Reject
            </button>
          </div>
          <div style={ui.hint}>Approving puts the question in the live bank, where students can get it.</div>
        </div>
      )}
      </div>
    </div>
  )
}
