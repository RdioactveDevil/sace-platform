import { useState } from 'react'
import { supabase } from '../lib/supabase'
import MathText from './MathText'
import GraphView from './GraphView'
import TableView from './TableView'

const FONT_B = "'Plus Jakarta Sans', sans-serif"
const GOLD   = '#f1be43'
const OPTION_LABELS = ['A', 'B', 'C', 'D']

function parseJsonSilent(val) {
  if (!val || val === 'null') return null
  if (typeof val === 'object') return val
  try { return JSON.parse(val) } catch { return null }
}

export default function AdminQuestionPreviewTab() {
  const [idInput,      setIdInput]      = useState('')
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

  async function lookup() {
    const id = idInput.trim()
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

    const table = question._source === 'draft' ? 'draft_questions' : 'questions'
    const { error: err } = await supabase
      .from(table)
      .update({ graph: newGraph, table_data: newTable, image_url: editImageUrl || null })
      .eq('id', question.id)

    if (err) {
      setSaveMsg({ ok: false, text: err.message })
    } else {
      setQuestion(q => ({ ...q, graph: newGraph, table_data: newTable, image_url: editImageUrl || null }))
      setSaveMsg({ ok: true, text: 'Saved.' })
    }
    setSaving(false)
  }

  const s = styles

  return (
    <div style={s.page}>
      <h2 style={s.heading}>Question Preview</h2>
      <p style={s.sub}>Look up any question by ID to preview and edit its visual fields (graph, table, image).</p>

      {/* Search */}
      <div style={s.searchRow}>
        <input
          style={s.input}
          placeholder="Question ID  e.g. test_graph_01"
          value={idInput}
          onChange={e => setIdInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && lookup()}
          spellCheck={false}
        />
        <button style={s.btn} onClick={lookup} disabled={loading}>
          {loading ? 'Loading…' : 'Preview'}
        </button>
      </div>

      {error && <p style={s.error}>{error}</p>}

      {question && (
        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>

          {/* ── Left: preview ── */}
          <div style={{ ...s.card, flex: '1 1 400px', minWidth: 0 }}>
            {/* Meta */}
            <div style={s.metaRow}>
              <span style={s.badge('#4f8ef7')}>{question._source === 'draft' ? 'Draft' : 'Live'}</span>
              <span style={s.badge(GOLD)}>{question.subject}</span>
              <span style={s.metaText}>{question.topic}</span>
              {question.subtopic && <span style={s.metaText}>· {question.subtopic}</span>}
              <span style={s.metaText}>· difficulty {question.difficulty}</span>
            </div>

            {question.graph     && <GraphView graph={question.graph}          theme="dark" />}
            {question.table_data && <TableView table={question.table_data}    theme="dark" />}
            {question.image_url  && (
              <img src={question.image_url} alt="Question diagram"
                style={{ width: '100%', maxHeight: 280, objectFit: 'contain', borderRadius: 10, marginBottom: 16 }} />
            )}

            <div style={s.questionText}><MathText text={question.question} /></div>

            <div style={s.optionsWrap}>
              {(question.options || []).map((opt, i) => {
                const isCorrect = i === question.answer_index
                let bg = 'rgba(255,255,255,0.04)', border = '1px solid rgba(255,255,255,0.1)', color = 'rgba(255,255,255,0.7)', lBg = 'rgba(255,255,255,0.1)', lCol = '#fff'
                if (revealed && isCorrect) { bg = 'rgba(16,185,129,0.1)'; border = '1px solid rgba(16,185,129,0.35)'; color = '#4ade80'; lBg = 'rgba(16,185,129,0.2)'; lCol = '#4ade80' }
                return (
                  <div key={i} style={{ ...s.option, background: bg, border, color }}>
                    <span style={{ ...s.optLabel, background: lBg, color: lCol }}>
                      {revealed && isCorrect ? '✓' : OPTION_LABELS[i]}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}><MathText text={opt} /></span>
                  </div>
                )
              })}
            </div>

            {!revealed
              ? <button style={s.revealBtn} onClick={() => setRevealed(true)}>Reveal Answer</button>
              : <div style={s.solution}>
                  <span style={s.solutionLabel}>Solution</span>
                  <MathText text={question.solution || 'No solution provided.'} />
                </div>
            }
          </div>

          {/* ── Right: editor ── */}
          <div style={{ ...s.card, flex: '0 0 300px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ color: '#fff', fontSize: 13, fontWeight: 700, marginBottom: 2 }}>Edit visuals</div>

            {/* Image */}
            <div>
              <div style={s.fieldLabel}>Image URL</div>
              <input
                style={{ ...s.input, marginBottom: 6 }}
                placeholder="https://…"
                value={editImageUrl}
                onChange={e => setEditImageUrl(e.target.value)}
              />
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: uploading ? 'not-allowed' : 'pointer' }}>
                <input type="file" accept="image/*" onChange={handleImageUpload} disabled={uploading} style={{ display: 'none' }} />
                <span style={{ ...s.uploadBtn, opacity: uploading ? 0.6 : 1 }}>
                  {uploading ? 'Uploading…' : '↑ Upload image'}
                </span>
              </label>
            </div>

            {/* Graph */}
            <div>
              <div style={s.fieldLabel}>Graph spec (JSON)</div>
              <textarea
                style={{ ...s.textarea }}
                rows={6}
                placeholder={'{\n  "functions": [{"expr": "x**2-4"}],\n  "xRange": [-5,5],\n  "yRange": [-6,6]\n}'}
                value={editGraphJson}
                onChange={e => setEditGraphJson(e.target.value)}
                spellCheck={false}
              />
            </div>

            {/* Table */}
            <div>
              <div style={s.fieldLabel}>Table spec (JSON)</div>
              <textarea
                style={{ ...s.textarea }}
                rows={5}
                placeholder={'{\n  "headers": ["x", "y"],\n  "rows": [[1,2],[3,4]]\n}'}
                value={editTableJson}
                onChange={e => setEditTableJson(e.target.value)}
                spellCheck={false}
              />
            </div>

            <button style={{ ...s.btn, width: '100%', opacity: saving ? 0.7 : 1 }} onClick={saveVisuals} disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            {saveMsg && <p style={{ fontSize: 12, color: saveMsg.ok ? '#4ade80' : '#f87171', margin: 0 }}>{saveMsg.text}</p>}

            {/* Raw specs */}
            {question.graph && (
              <details style={s.details}>
                <summary style={s.summary}>Raw graph spec</summary>
                <pre style={s.pre}>{JSON.stringify(question.graph, null, 2)}</pre>
              </details>
            )}
            {question.table_data && (
              <details style={s.details}>
                <summary style={s.summary}>Raw table spec</summary>
                <pre style={s.pre}>{JSON.stringify(question.table_data, null, 2)}</pre>
              </details>
            )}
          </div>

        </div>
      )}
    </div>
  )
}

const styles = {
  page: { padding: '28px 32px', maxWidth: 900, fontFamily: FONT_B },
  heading: { color: '#fff', fontSize: 20, fontWeight: 800, margin: '0 0 6px' },
  sub: { color: 'rgba(255,255,255,0.4)', fontSize: 13, margin: '0 0 24px' },
  searchRow: { display: 'flex', gap: 8, marginBottom: 20 },
  input: {
    flex: 1, width: '100%',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 8, color: '#fff', fontSize: 13,
    padding: '10px 14px', fontFamily: FONT_B, outline: 'none',
    boxSizing: 'border-box',
  },
  textarea: {
    width: '100%',
    background: 'rgba(0,0,0,0.3)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8, color: 'rgba(255,255,255,0.8)', fontSize: 11,
    padding: '10px 12px', fontFamily: 'monospace', outline: 'none',
    resize: 'vertical', boxSizing: 'border-box',
  },
  btn: {
    background: GOLD, border: 'none', borderRadius: 8,
    color: '#080d28', fontSize: 14, fontWeight: 800,
    padding: '10px 20px', cursor: 'pointer', fontFamily: FONT_B,
  },
  uploadBtn: {
    background: 'rgba(255,255,255,0.07)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 6, color: 'rgba(255,255,255,0.6)',
    fontSize: 12, fontWeight: 600, padding: '6px 12px', cursor: 'pointer',
  },
  error: { color: '#f87171', fontSize: 13, margin: '0 0 16px' },
  card: {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 14, padding: 24,
  },
  metaRow: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 18 },
  badge: (color) => ({
    background: `${color}22`, border: `1px solid ${color}55`, color,
    borderRadius: 999, padding: '2px 10px', fontSize: 11, fontWeight: 700,
  }),
  metaText: { color: 'rgba(255,255,255,0.4)', fontSize: 12 },
  questionText: { color: '#fff', fontSize: 16, fontWeight: 700, lineHeight: 1.7, marginBottom: 18 },
  optionsWrap: { display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 },
  option: {
    display: 'flex', alignItems: 'center', gap: 12,
    borderRadius: 10, padding: '11px 14px', fontSize: 14, fontWeight: 600,
  },
  optLabel: {
    width: 28, height: 28, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 11, fontWeight: 800, flexShrink: 0,
  },
  revealBtn: {
    background: 'rgba(241,190,67,0.12)', border: `1px solid rgba(241,190,67,0.3)`,
    borderRadius: 8, color: GOLD, fontSize: 13, fontWeight: 700,
    padding: '9px 18px', cursor: 'pointer', fontFamily: FONT_B,
  },
  solution: {
    background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.2)',
    borderRadius: 10, padding: '14px 16px',
    color: 'rgba(255,255,255,0.8)', fontSize: 13, lineHeight: 1.7,
  },
  solutionLabel: {
    display: 'block', color: '#4ade80', fontSize: 11, fontWeight: 700,
    marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em',
  },
  fieldLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 },
  details: { marginTop: 4 },
  summary: { color: 'rgba(255,255,255,0.3)', fontSize: 11, cursor: 'pointer', userSelect: 'none' },
  pre: {
    background: 'rgba(0,0,0,0.3)', borderRadius: 8, padding: 10,
    fontSize: 10, color: 'rgba(255,255,255,0.6)', overflowX: 'auto', marginTop: 6,
  },
}
