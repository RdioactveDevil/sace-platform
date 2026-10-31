import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { saveQuestionVisuals } from '../lib/adminDb'
import MathText from './MathText'
import GraphView from './GraphView'
import TableView from './TableView'

import { ui, btn, note, FONT_B } from '../lib/adminUi'
const OPTION_LABELS = ['A', 'B', 'C', 'D']

function parseJsonSilent(val) {
  if (!val || val === 'null') return null
  if (typeof val === 'object') return val
  try { return JSON.parse(val) } catch { return null }
}

export default function AdminQuestionPreviewTab({ initialId = null, theme = 'light' }) {
  const [idInput,      setIdInput]      = useState(initialId || '')
  const [question,     setQuestion]     = useState(null)
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState(null)
  const [revealed,     setRevealed]     = useState(false)

  // Edit state
  const [editGraphJson,  setEditGraphJson]  = useState('')
  const [editTableJson,  setEditTableJson]  = useState('')
  const [editImageUrl,   setEditImageUrl]   = useState('')
  const [saving,         setSaving]         = useState(false)
  const [saveMsg,        setSaveMsg]        = useState(null)
  const [uploading,      setUploading]      = useState(false)

  // Opened on a question (from the bank or a report): show it straight away.
  useEffect(() => { if (initialId) { setIdInput(initialId); lookup(initialId) } }, [initialId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function lookup(idArg) {
    const id = String(idArg ?? idInput).trim()
    if (!id) return
    setLoading(true)
    setError(null)
    setQuestion(null)
    setRevealed(false)
    setSaveMsg(null)

    let { data, error: err } = await supabase
      .from('questions')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (err) { setError(err.message); setLoading(false); return }

    if (!data) {
      ;({ data, error: err } = await supabase
        .from('draft_questions')
        .select('*')
        .eq('id', id)
        .maybeSingle())
      if (err) { setError(err.message); setLoading(false); return }
      if (data) data = { ...data, _source: 'draft' }
    } else {
      data = { ...data, _source: 'live' }
    }

    if (!data) {
      setError(`No question found with id "${id}"`)
    } else {
      const q = {
        ...data,
        options:    parseJsonSilent(data.options)    ?? data.options,
        graph:      parseJsonSilent(data.graph),
        table_data: parseJsonSilent(data.table_data),
      }
      setQuestion(q)
      setEditGraphJson(q.graph     ? JSON.stringify(q.graph,      null, 2) : '')
      setEditTableJson(q.table_data ? JSON.stringify(q.table_data, null, 2) : '')
      setEditImageUrl(q.image_url  ?? '')
    }
    setLoading(false)
  }

  async function handleImageUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setSaveMsg(null)
    try {
      const path = `question-images/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      const { error: upErr } = await supabase.storage.from('admin-uploads').upload(path, file, { upsert: false })
      if (upErr) throw upErr
      const { data: { publicUrl } } = supabase.storage.from('admin-uploads').getPublicUrl(path)
      setEditImageUrl(publicUrl)
    } catch (err) {
      setSaveMsg({ ok: false, text: `Upload failed: ${err.message}` })
    }
    setUploading(false)
  }

  async function saveVisuals() {
    if (!question) return
    setSaving(true)
    setSaveMsg(null)

    let newGraph = null, newTable = null
    try {
      if (editGraphJson.trim()) newGraph = JSON.parse(editGraphJson)
    } catch { setSaving(false); setSaveMsg({ ok: false, text: 'Graph JSON is invalid.' }); return }
    try {
      if (editTableJson.trim()) newTable = JSON.parse(editTableJson)
    } catch { setSaving(false); setSaveMsg({ ok: false, text: 'Table JSON is invalid.' }); return }

    try {
      const saved = await saveQuestionVisuals(question.id, {
        source: question._source, graph: newGraph, table_data: newTable, image_url: editImageUrl.trim() || null,
      })
      setQuestion(q => ({ ...q, graph: saved.graph, table_data: saved.table_data, image_url: saved.image_url }))
      setEditImageUrl(saved.image_url ?? '')
      setSaveMsg({ ok: true, text: 'Saved.' })
    } catch (err) {
      setSaveMsg({ ok: false, text: `Didn't save: ${err.message}` })
    }
    setSaving(false)
  }

  return (
    <div style={{ fontFamily: FONT_B, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ ...ui.hint, fontSize: 13, margin: 0 }}>Open any question by its ID to see it as students do, and change its graph, table or image. Questions in the Bank tab open here.</p>

      {/* Search */}
      <div style={{ display: 'flex', gap: 8, maxWidth: 560 }}>
        <input
          aria-label="Question ID"
          style={{ ...ui.input, flex: 1 }}
          placeholder="Question ID, e.g. test_graph_01"
          value={idInput}
          onChange={e => setIdInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && lookup()}
          spellCheck={false}
        />
        <button type="button" style={btn('primary', loading)} onClick={() => lookup()} disabled={loading}>
          {loading ? 'Opening…' : 'Open'}
        </button>
      </div>

      {error && <div role="alert" style={note('danger')}>{error}</div>}

      {question && (
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>

          {/* ── Left: the question as students see it ── */}
          <div style={{ ...ui.card, padding: '18px 20px', flex: '1 1 420px', minWidth: 0 }}>
            <div style={{ fontSize: 12.5, color: 'var(--t-textMuted)', marginBottom: 14 }}>
              {[question._source === 'draft' ? 'Draft' : 'Live', question.subject, question.topic, question.subtopic, question.difficulty != null && `level ${question.difficulty}`].filter(Boolean).join(' · ')}
            </div>

            {question.graph     && <GraphView graph={question.graph}          theme={theme} />}
            {question.table_data && <TableView table={question.table_data}    theme={theme} />}
            {question.image_url  && (
              <img src={question.image_url} alt="Question diagram"
                style={{ width: '100%', maxHeight: 280, objectFit: 'contain', borderRadius: 10, marginBottom: 16 }} />
            )}

            <div style={{ color: 'var(--t-text)', fontSize: 16, fontWeight: 700, lineHeight: 1.6, marginBottom: 16 }}><MathText text={question.question} /></div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {(question.options || []).map((opt, i) => {
                const right = revealed && i === question.answer_index
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, borderRadius: 10, padding: '10px 14px', fontSize: 14, color: 'var(--t-text)',
                    background: right ? 'var(--t-successBg)' : 'var(--t-bgCard)', border: `1px solid ${right ? 'var(--t-success)' : 'var(--t-border)'}` }}>
                    <span style={{ width: 16, fontSize: 13, fontWeight: 800, color: right ? 'var(--t-success)' : 'var(--t-textMuted)' }}>{OPTION_LABELS[i]}</span>
                    <span style={{ flex: 1, minWidth: 0 }}><MathText text={opt} /></span>
                    {right && <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--t-success)' }}>Answer</span>}
                  </div>
                )
              })}
            </div>

            {!revealed
              ? <button type="button" style={btn('secondary')} onClick={() => setRevealed(true)}>Show answer</button>
              : <div style={{ borderRadius: 10, padding: '12px 14px', background: 'var(--t-bgSubtle)', color: 'var(--t-textSub)', fontSize: 13.5, lineHeight: 1.65 }}>
                  <span style={{ display: 'block', color: 'var(--t-text)', fontSize: 13, fontWeight: 800, marginBottom: 4 }}>Worked solution</span>
                  <MathText text={question.solution || 'No solution written.'} />
                </div>
            }
          </div>

          {/* ── Right: editor ── */}
          <div style={{ ...ui.card, padding: '16px 18px', flex: '0 1 320px', minWidth: 260, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={ui.heading}>Graph, table and image</div>

            {/* Image */}
            <div>
              <label htmlFor="pv-image" style={ui.label}>Image link</label>
              <input
                id="pv-image"
                style={{ ...ui.input, width: '100%', marginBottom: 8 }}
                placeholder="https://…"
                value={editImageUrl}
                onChange={e => setEditImageUrl(e.target.value)}
              />
              <label style={{ display: 'inline-flex', cursor: uploading ? 'not-allowed' : 'pointer' }}>
                <input type="file" accept="image/*" onChange={handleImageUpload} disabled={uploading} style={{ display: 'none' }} />
                <span style={{ ...btn('secondary', uploading), fontSize: 12.5 }}>
                  {uploading ? 'Uploading…' : 'Upload an image'}
                </span>
              </label>
            </div>

            {/* Graph */}
            <div>
              <label htmlFor="pv-graph" style={ui.label}>Graph (JSON)</label>
              <textarea
                id="pv-graph"
                style={codeArea}
                rows={6}
                placeholder={'{\n  "functions": [{"expr": "x**2-4"}],\n  "xRange": [-5,5],\n  "yRange": [-6,6]\n}'}
                value={editGraphJson}
                onChange={e => setEditGraphJson(e.target.value)}
                spellCheck={false}
              />
            </div>

            {/* Table */}
            <div>
              <label htmlFor="pv-table" style={ui.label}>Table (JSON)</label>
              <textarea
                id="pv-table"
                style={codeArea}
                rows={5}
                placeholder={'{\n  "headers": ["x", "y"],\n  "rows": [[1,2],[3,4]]\n}'}
                value={editTableJson}
                onChange={e => setEditTableJson(e.target.value)}
                spellCheck={false}
              />
            </div>

            <button type="button" style={btn('primary', saving)} onClick={saveVisuals} disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            {saveMsg && <div role="status" style={{ fontSize: 12.5, color: saveMsg.ok ? 'var(--t-success)' : 'var(--t-danger)' }}>{saveMsg.text}</div>}

            {/* Raw specs */}
            {question.graph && (
              <details>
                <summary style={summary}>Saved graph spec</summary>
                <pre style={pre}>{JSON.stringify(question.graph, null, 2)}</pre>
              </details>
            )}
            {question.table_data && (
              <details>
                <summary style={summary}>Saved table spec</summary>
                <pre style={pre}>{JSON.stringify(question.table_data, null, 2)}</pre>
              </details>
            )}
          </div>

        </div>
      )}
    </div>
  )
}

const codeArea = { ...ui.input, width: '100%', fontFamily: "'JetBrains Mono', ui-monospace, Menlo, monospace", fontSize: 11.5, resize: 'vertical' }
const summary = { color: 'var(--t-textMuted)', fontSize: 12, cursor: 'pointer', userSelect: 'none' }
const pre = { background: 'var(--t-bgSubtle)', borderRadius: 8, padding: 10, fontSize: 11, color: 'var(--t-textSub)', overflowX: 'auto', marginTop: 6 }
