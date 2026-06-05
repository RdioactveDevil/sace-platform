import { useState, useEffect, useCallback } from 'react'
import { getDraftQuestions, upsertDraftQuestion, approveDraftQuestion, rejectDraftQuestion, fetchQuestionReports, bulkScanQuestions } from '../lib/adminDb'
import { getVariantCountsByConceptTags } from '../lib/db'
import { getTopicsBySubject } from '../lib/adminTopics'
import MathText from './MathText'

const FONT_B = "'Plus Jakarta Sans', sans-serif"
const GOLD   = '#f1be43'
const OPTION_LABELS = ['A', 'B', 'C', 'D']

function StatusBadge({ status }) {
  const key = String(status || 'pending')
    .trim()
    .toLowerCase()
  const map = {
    pending:      { bg: 'rgba(241,190,67,0.1)',   border: 'rgba(241,190,67,0.3)',   color: GOLD },
    needs_review: { bg: 'rgba(239,68,68,0.1)',    border: 'rgba(239,68,68,0.3)',    color: '#f87171' },
    approved:     { bg: 'rgba(16,185,129,0.1)',   border: 'rgba(16,185,129,0.3)',   color: '#4ade80' },
    rejected:     { bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.1)',  color: 'rgba(255,255,255,0.3)' },
  }
  const c = map[key] || map.pending
  return (
    <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: c.bg, border: `1px solid ${c.border}`, color: c.color }}>
      {key}
    </span>
  )
}

export default function AdminReviewScreen({ profile }) {
  const [activeTab,      setActiveTab]      = useState('drafts')

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

  // ── Reports tab state ────────────────────────────────────────────────────────
  const [reports,        setReports]        = useState([])
  const [loadingReports, setLoadingReports] = useState(false)
  const [reportFilter,   setReportFilter]   = useState('all')
  const [scanning,       setScanning]       = useState(false)
  const [scanResult,     setScanResult]     = useState(null)
  const [scanError,      setScanError]      = useState(null)
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

  const loadReports = useCallback(async () => {
    setLoadingReports(true)
    try {
      const data = await fetchQuestionReports(reportFilter)
      setReports(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingReports(false)
    }
  }, [reportFilter])

  useEffect(() => { if (activeTab === 'reports') loadReports() }, [activeTab, loadReports])

  const handleBulkScan = async () => {
    if (scanning) return
    setScanning(true)
    setScanResult(null)
    setScanError(null)
    try {
      const result = await bulkScanQuestions({ limit: 100 })
      setScanResult(result)
      setTimeout(() => loadReports(), 1500)
    } catch (e) {
      setScanError(e.message || 'Scan failed')
    } finally {
      setScanning(false)
    }
  }


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

  const inputStyle = {
    width: '100%', padding: '8px 10px', borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.12)',
    background: '#0c1037',
    color: '#fff', fontSize: 13, fontFamily: FONT_B, outline: 'none',
    boxSizing: 'border-box',
  }

  const AI_STATUS_COLORS = {
    pending:     { bg: 'rgba(241,190,67,0.1)',   border: 'rgba(241,190,67,0.3)',   color: GOLD },
    processing:  { bg: 'rgba(99,102,241,0.1)',   border: 'rgba(99,102,241,0.3)',   color: '#a5b4fc' },
    dismissed:   { bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.1)',  color: 'rgba(255,255,255,0.35)' },
    fixed_index: { bg: 'rgba(16,185,129,0.1)',   border: 'rgba(16,185,129,0.3)',   color: '#4ade80' },
    regenerated: { bg: 'rgba(16,185,129,0.1)',   border: 'rgba(16,185,129,0.3)',   color: '#4ade80' },
    deleted:     { bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.25)',   color: '#f87171' },
    error:       { bg: 'rgba(239,68,68,0.1)',    border: 'rgba(239,68,68,0.3)',    color: '#f87171' },
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Top-level tab switcher */}
      <div style={{ display: 'flex', gap: 8 }}>
        {[['drafts', 'Review Queue'], ['reports', 'AI Reports']].map(([tab, label]) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '6px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700,
              fontFamily: FONT_B, cursor: 'pointer', transition: 'all 0.15s',
              border: `1px solid ${activeTab === tab ? GOLD : 'rgba(255,255,255,0.12)'}`,
              background: activeTab === tab ? 'rgba(241,190,67,0.08)' : 'transparent',
              color: activeTab === tab ? GOLD : 'rgba(255,255,255,0.4)',
            }}
          >{label}</button>
        ))}
      </div>

      {activeTab === 'reports' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
            <h2 style={{ color: '#fff', margin: 0 }}>
              AI Reports
              {!loadingReports && <span style={{ marginLeft: 8, fontSize: 13, color: 'rgba(255,255,255,0.3)', fontWeight: 400 }}>({reports.length})</span>}
            </h2>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {['all', 'pending', 'processing', 'fixed_index', 'regenerated', 'dismissed', 'error'].map(s => (
                <button
                  key={s}
                  onClick={() => setReportFilter(s)}
                  style={{
                    padding: '4px 10px', borderRadius: 7, fontSize: 11, fontWeight: 700,
                    fontFamily: FONT_B, cursor: 'pointer',
                    border: `1px solid ${reportFilter === s ? GOLD : 'rgba(255,255,255,0.12)'}`,
                    background: reportFilter === s ? 'rgba(241,190,67,0.08)' : 'transparent',
                    color: reportFilter === s ? GOLD : 'rgba(255,255,255,0.35)',
                  }}
                >{s}</button>
              ))}
              <button
                onClick={loadReports}
                disabled={loadingReports}
                style={{
                  padding: '4px 10px', borderRadius: 7, fontSize: 11, fontWeight: 700,
                  fontFamily: FONT_B, cursor: loadingReports ? 'default' : 'pointer',
                  border: '1px solid rgba(255,255,255,0.12)', background: 'transparent',
                  color: 'rgba(255,255,255,0.4)',
                }}
              >{loadingReports ? '…' : '↻ Refresh'}</button>
              <button
                onClick={handleBulkScan}
                disabled={scanning}
                style={{
                  padding: '5px 14px', borderRadius: 8, fontSize: 12, fontWeight: 800,
                  fontFamily: FONT_B, cursor: scanning ? 'not-allowed' : 'pointer',
                  border: 'none', background: scanning ? 'rgba(239,68,68,0.4)' : '#f87171',
                  color: '#0c1037',
                }}
              >{scanning ? 'Scanning…' : '⚡ Bulk Scan'}</button>
            </div>
          </div>

          {scanResult && (
            <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 10, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)', color: '#4ade80', fontSize: 13, fontFamily: FONT_B }}>
              Queued {scanResult.queued} question{scanResult.queued !== 1 ? 's' : ''} for AI review.
              {scanResult.message ? ` ${scanResult.message}` : ''}
            </div>
          )}
          {scanError && (
            <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.28)', color: '#f87171', fontSize: 13, fontFamily: FONT_B }}>
              {scanError}
            </div>
          )}

          {loadingReports ? (
            <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>Loading…</div>
          ) : reports.length === 0 ? (
            <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, padding: '48px 0', textAlign: 'center' }}>
              No reports{reportFilter !== 'all' ? ` with status "${reportFilter}"` : ''}.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {reports.map(r => {
                const q = r.questions
                const sc = AI_STATUS_COLORS[r.ai_status] || AI_STATUS_COLORS.pending
                return (
                  <div key={r.id} style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: q ? 6 : 0 }}>
                      <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, flexShrink: 0, background: sc.bg, border: `1px solid ${sc.border}`, color: sc.color }}>
                        {r.ai_status}
                      </span>
                      <span style={{ flex: 1, fontSize: 13, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {q?.question || r.question_id}
                      </span>
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', flexShrink: 0 }}>
                        {new Date(r.reported_at).toLocaleDateString()}
                      </span>
                    </div>
                    {r.resolution_note && (
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 4, paddingLeft: 4 }}>
                        {r.resolution_note}
                        {r.ai_verdict?.explanation ? ` — ${r.ai_verdict.explanation}` : ''}
                      </div>
                    )}
                    {q && (
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 4 }}>
                        {[q.subject, q.topic, q.subtopic].filter(Boolean).join(' · ')}
                        {q.difficulty ? ` · D${q.difficulty}` : ''}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'drafts' && <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
      {/* Left: table */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <h2 style={{ color: '#fff', margin: 0 }}>
            Review Queue
            {!loading && <span style={{ marginLeft: 8, fontSize: 13, color: 'rgba(255,255,255,0.3)', fontWeight: 400 }}>({drafts.length})</span>}
          </h2>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {drafts.length > 0 && (
              <button
                onClick={handleSelectAll}
                disabled={saving}
                style={{
                  padding: '5px 12px', borderRadius: 8,
                  border: `1px solid ${allChecked ? 'rgba(241,190,67,0.4)' : 'rgba(255,255,255,0.12)'}`,
                  background: allChecked ? 'rgba(241,190,67,0.08)' : 'transparent',
                  color: allChecked ? GOLD : 'rgba(255,255,255,0.4)',
                  fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B,
                }}
              >
                {allChecked ? 'Deselect All' : 'Select All'}
              </button>
            )}
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

        {actionOk && (
          <div
            style={{
              marginBottom: 14,
              padding: '10px 14px',
              borderRadius: 10,
              background: 'rgba(16,185,129,0.1)',
              border: '1px solid rgba(16,185,129,0.28)',
              color: '#4ade80',
              fontSize: 13,
              fontFamily: FONT_B,
            }}
          >
            {actionOk}
          </div>
        )}
        {actionError && (
          <div
            style={{
              marginBottom: 14,
              padding: '10px 14px',
              borderRadius: 10,
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.28)',
              color: '#f87171',
              fontSize: 13,
              fontFamily: FONT_B,
            }}
          >
            {actionError}
          </div>
        )}

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
                {(() => {
                  if (variantCounts === null) return null   // counts unavailable — don't show false zeros
                  const ct = draftConceptTagMap[draft.id]
                  if (!ct) return null                       // no concept_tag derivable from draft
                  const vc = variantCounts[ct] ?? 0
                  const isZero = vc === 0
                  return (
                    <span style={{
                      padding: '2px 7px', borderRadius: 999, fontSize: 11, fontWeight: 700, flexShrink: 0,
                      background: isZero ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.08)',
                      border: `1px solid ${isZero ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.2)'}`,
                      color: isZero ? '#f87171' : '#4ade80',
                    }}>
                      {vc} concept variant{vc !== 1 ? 's' : ''}
                    </span>
                  )
                })()}
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

          {/* Variant count info */}
          {(() => {
            if (variantCounts === null) {
              // counts fetch failed — show neutral unavailable state, not a false zero
              return (
                <div style={{
                  marginBottom: 16, padding: '10px 12px', borderRadius: 10,
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>Stored Variants</span>
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>unavailable</span>
                </div>
              )
            }
            const ct = draftConceptTagMap[editState.id]
            if (!ct) return null
            const vc = variantCounts[ct] ?? 0
            const isZero = vc === 0
            return (
              <div style={{
                marginBottom: 16, padding: '10px 12px', borderRadius: 10,
                background: isZero ? 'rgba(239,68,68,0.07)' : 'rgba(16,185,129,0.06)',
                border: `1px solid ${isZero ? 'rgba(239,68,68,0.25)' : 'rgba(16,185,129,0.18)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
              }}>
                <div>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>Concept Variants</span>
                  <div style={{ marginTop: 2, fontSize: 18, fontWeight: 800, color: isZero ? '#f87171' : '#4ade80' }}>
                    {vc}
                  </div>
                </div>
                {isZero && (
                  <span style={{
                    padding: '3px 9px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                    background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171',
                  }}>
                    No variants — needs generation
                  </span>
                )}
              </div>
            )
          })()}

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
      </div>}
    </div>
  )
}
