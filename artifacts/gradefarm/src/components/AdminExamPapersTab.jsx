import { useEffect, useMemo, useRef, useState } from 'react'
import { FileStack, Upload, Copy, RefreshCw, X, ExternalLink } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { listCurricula } from '../lib/curriculaDb'
import { groupSubject } from '../lib/homeSubjects'
import { buildPaperRows, parsePaperFilename, safeName, sourceLabelFor } from '../lib/examPapers'

const FONT_B = "'Plus Jakarta Sans', sans-serif"
const ACTION_URL = 'https://github.com/RdioactveDevil/sace-platform/actions/workflows/ingest-past-paper.yml'

const card = { background: 'var(--t-bgCard)', border: '1px solid var(--t-border)', borderRadius: 12, padding: 16 }
const input = { padding: '6px 8px', borderRadius: 7, border: '1px solid var(--t-border)', background: 'var(--t-bgInput)', color: 'var(--t-text)', fontFamily: FONT_B, fontSize: 12.5, width: '100%', boxSizing: 'border-box' }
const btn = (primary, disabled) => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9, fontFamily: FONT_B, fontSize: 13, fontWeight: 800,
  cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1,
  border: primary ? 'none' : '1px solid var(--t-border)', background: primary ? 'var(--t-accent)' : 'var(--t-bgCard)', color: primary ? '#0c1037' : 'var(--t-text)',
})
const STATUS = {
  checked: ['Checked (dry run)', 'var(--t-text)'],
  saved: ['Saved to the bank', 'var(--t-success)'],
  failed: ['Failed', 'var(--t-danger)'],
  running: ['Reading…', 'var(--t-textMuted)'],
}

/**
 * Admin → Exam papers: drop in several exam papers (and their solutions or
 * assessment reports) at once, check the details read from each file name,
 * and upload them as one batch. The "Ingest exam paper" Action then loads
 * the whole batch when given its ID, and writes each paper's outcome back
 * here (exam_paper_batches).
 */
export default function AdminExamPapersTab() {
  const [curricula, setCurricula] = useState([])
  const [subject, setSubject] = useState('')
  useEffect(() => { listCurricula().then(list => setCurricula(list || [])).catch(() => {}) }, [])
  const cur = curricula.find(c => c.name === subject)
  const board = cur && groupSubject({ name: cur.name, level: cur.level_label }).group === 'sace' ? 'sace' : 'vce'

  // Dropped files and the paper rows built from them.
  const [files, setFiles] = useState([])
  const [rows, setRows] = useState([])
  const [unpaired, setUnpaired] = useState([])
  const fileInput = useRef(null)
  const addFiles = (list) => {
    const pdfs = [...list].filter(f => /\.pdf$/i.test(f.name) || f.type === 'application/pdf')
    const all = [...files, ...pdfs]
    const built = buildPaperRows(all, board)
    setFiles(all)
    setRows(built.papers)
    setUnpaired(built.unpaired)
  }
  // Re-read the details when the subject (and so the board) changes.
  useEffect(() => { if (files.length) { const b = buildPaperRows(files, board); setRows(b.papers); setUnpaired(b.unpaired) } }, [board]) // eslint-disable-line react-hooks/exhaustive-deps
  const solutionFiles = useMemo(() => files.map((f, i) => ({ f, i })).filter(({ f }) => parsePaperFilename(f.name, board).solutions), [files, board])
  const setRow = (key, patch) => setRows(prev => prev.map(r => (r.key === key ? { ...r, ...patch } : r)))
  const removeRow = (key) => setRows(prev => prev.filter(r => r.key !== key))
  const clear = () => { setFiles([]); setRows([]); setUnpaired([]); setDone(null); setError('') }

  const invalid = rows.filter(r => !r.year || !String(r.publisher || '').trim() || !String(r.paper || '').trim())
  const [uploading, setUploading] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(null)

  const upload = async () => {
    if (!subject || !rows.length || invalid.length) return
    setError('')
    const id = crypto.randomUUID()
    const put = async (file, n) => {
      const path = `exam-papers/${id}/${n}-${safeName(file.name)}`
      const { error: e } = await supabase.storage.from('admin-uploads').upload(path, file, { contentType: 'application/pdf', upsert: false })
      if (e) throw new Error(`${file.name}: ${e.message}`)
      return path
    }
    try {
      const papers = []
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i]
        setUploading(`Uploading ${i + 1} of ${rows.length}: ${r.file.name}`)
        const pdf = await put(r.file, `${i + 1}`)
        const sol = r.solutionsKey != null ? files[r.solutionsKey] : null
        const solutions = sol ? await put(sol, `${i + 1}-solutions`) : null
        papers.push({ file: r.file.name, solutionsFile: sol?.name || null, pdf, solutions, kind: r.kind, publisher: r.publisher.trim(), year: Number(r.year), paper: r.paper.trim(), source: sourceLabelFor(r) })
      }
      setUploading('Saving the batch…')
      const { data: { user } } = await supabase.auth.getUser()
      const { error: e } = await supabase.from('exam_paper_batches').insert({ id, created_by: user?.id || null, subject, papers })
      if (e) throw new Error(e.message)
      setDone({ id, count: papers.length })
      setFiles([]); setRows([]); setUnpaired([])
      loadBatches()
    } catch (e) {
      setError(`Upload stopped: ${e.message}`)
    }
    setUploading('')
  }

  // Recent batches and what the Action reported for each paper.
  const [batches, setBatches] = useState(null)
  const loadBatches = () => {
    supabase.from('exam_paper_batches').select('id, subject, papers, results, created_at, updated_at').order('created_at', { ascending: false }).limit(12)
      .then(({ data }) => setBatches(data || []))
  }
  useEffect(loadBatches, [])
  const [copied, setCopied] = useState('')
  const copy = (text) => navigator.clipboard?.writeText(text).then(() => { setCopied(text); setTimeout(() => setCopied(''), 1800) }).catch(() => {})

  const steps = (id) => (
    <ol style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13, lineHeight: 1.7, color: 'var(--t-textSub)' }}>
      <li>Open the <a href={ACTION_URL} target="_blank" rel="noreferrer" style={{ color: 'var(--t-text)', fontWeight: 700 }}>Ingest exam paper Action <ExternalLink size={12} style={{ verticalAlign: '-1px' }} /></a> and press <b>Run workflow</b>.</li>
      <li>Paste the batch ID <code style={{ fontSize: 12 }}>{id}</code> into the first box. Leave the other boxes empty.</li>
      <li>Run it in <b>dry-run</b> first. Each paper's result shows below; press Refresh.</li>
      <li>When the question counts look right, run it again in <b>apply</b> to save the questions.</li>
    </ol>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, fontFamily: FONT_B, color: 'var(--t-text)' }}>
      <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}><FileStack size={17} /> Load exam papers</div>
        <div style={{ fontSize: 13, color: 'var(--t-textSub)', lineHeight: 1.6, maxWidth: 760 }}>
          Drop in past and trial exam papers with their solutions or assessment reports. Details are read from the file names; check them, then upload the batch and load it with the Action. Questions go into the bank for the exam builder.
        </div>
        <label style={{ fontSize: 12.5, color: 'var(--t-textMuted)', maxWidth: 420 }}>Subject
          <select value={subject} onChange={e => setSubject(e.target.value)} style={{ ...input, marginTop: 4, fontSize: 13 }}>
            <option value="">Choose a subject…</option>
            {curricula.map(c => <option key={c.id} value={c.name}>{c.name}{c.status !== 'live' ? ` (${c.status})` : ''}</option>)}
          </select>
        </label>

        <div onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); addFiles(e.dataTransfer.files) }}
          onClick={() => fileInput.current?.click()} role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') fileInput.current?.click() }}
          style={{ border: '1.5px dashed var(--t-borderMid)', borderRadius: 12, padding: '22px 16px', textAlign: 'center', cursor: 'pointer', color: 'var(--t-textMuted)', fontSize: 13 }}>
          <Upload size={20} style={{ display: 'block', margin: '0 auto 6px' }} />
          Drop PDFs here, or click to choose. Papers and solutions together; they're paired by name.
          <input ref={fileInput} type="file" accept="application/pdf,.pdf" multiple hidden onChange={e => { addFiles(e.target.files); e.target.value = '' }} />
        </div>

        {rows.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 820 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--t-textMuted)' }}>
                  {['Paper file', 'Type', 'Publisher', 'Year', 'Paper', 'Solutions', 'Saved as', ''].map(h => <th key={h} style={{ padding: '6px 6px', fontWeight: 700 }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.key} style={{ borderTop: '1px solid var(--t-border)' }}>
                    <td style={{ padding: 6, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.file.name}>{r.file.name}</td>
                    <td style={{ padding: 6, width: 120 }}>
                      <select value={r.kind} onChange={e => setRow(r.key, { kind: e.target.value })} style={input}>
                        <option value="official">Past exam</option><option value="commercial">Trial exam</option>
                      </select>
                    </td>
                    <td style={{ padding: 6, width: 120 }}><input value={r.publisher} onChange={e => setRow(r.key, { publisher: e.target.value })} style={input} aria-label="Publisher" /></td>
                    <td style={{ padding: 6, width: 80 }}><input value={r.year || ''} onChange={e => setRow(r.key, { year: e.target.value.replace(/\D/g, '').slice(0, 4) })} style={{ ...input, borderColor: r.year ? 'var(--t-border)' : 'var(--t-danger)' }} aria-label="Year" placeholder="Year" /></td>
                    <td style={{ padding: 6, width: 100 }}><input value={r.paper} onChange={e => setRow(r.key, { paper: e.target.value })} style={input} aria-label="Paper" /></td>
                    <td style={{ padding: 6, width: 200 }}>
                      <select value={r.solutionsKey ?? ''} onChange={e => setRow(r.key, { solutionsKey: e.target.value === '' ? null : Number(e.target.value) })} style={input} aria-label="Solutions file">
                        <option value="">None</option>
                        {solutionFiles.map(({ f, i }) => <option key={i} value={i}>{f.name}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: 6, color: 'var(--t-textMuted)', whiteSpace: 'nowrap' }}>{sourceLabelFor(r)}</td>
                    <td style={{ padding: 6, width: 30 }}><button type="button" onClick={() => removeRow(r.key)} aria-label={`Remove ${r.file.name}`} style={{ border: 'none', background: 'none', color: 'var(--t-textMuted)', cursor: 'pointer' }}><X size={15} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {unpaired.length > 0 && <div style={{ fontSize: 12.5, color: 'var(--t-textMuted)', marginTop: 8 }}>Solutions not matched to a paper: {unpaired.map(u => u.file.name).join(', ')}. Choose them in the Solutions column.</div>}
            {invalid.length > 0 && <div style={{ fontSize: 12.5, color: 'var(--t-danger)', marginTop: 6 }}>Fill in the year, publisher and paper for every row.</div>}
          </div>
        )}

        {error && <div role="alert" style={{ fontSize: 13, color: 'var(--t-danger)' }}>{error}</div>}
        {uploading && <div role="status" style={{ fontSize: 13, color: 'var(--t-textMuted)' }}>{uploading}</div>}
        {files.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={upload} disabled={!subject || !rows.length || invalid.length > 0 || !!uploading} style={btn(true, !subject || !rows.length || invalid.length > 0 || !!uploading)}>
              <Upload size={15} /> Upload {rows.length} paper{rows.length === 1 ? '' : 's'} as a batch
            </button>
            <button type="button" onClick={clear} disabled={!!uploading} style={btn(false, !!uploading)}>Clear</button>
            {!subject && <span style={{ fontSize: 12.5, color: 'var(--t-textMuted)', alignSelf: 'center' }}>Choose the subject first.</span>}
          </div>
        )}

        {done && (
          <div style={{ border: '1px solid var(--t-success)', borderRadius: 10, padding: 12 }}>
            <div style={{ fontWeight: 800, fontSize: 13.5 }}>Uploaded {done.count} paper{done.count === 1 ? '' : 's'}. Now load them:</div>
            {steps(done.id)}
            <button type="button" onClick={() => copy(done.id)} style={{ ...btn(false), marginTop: 8 }}><Copy size={14} /> {copied === done.id ? 'Copied' : 'Copy batch ID'}</button>
          </div>
        )}
      </div>

      <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 800 }}>Batches</div>
          <button type="button" onClick={loadBatches} style={btn(false)}><RefreshCw size={14} /> Refresh</button>
        </div>
        {batches === null && <div style={{ fontSize: 13, color: 'var(--t-textMuted)' }}>Loading…</div>}
        {batches?.length === 0 && <div style={{ fontSize: 13, color: 'var(--t-textMuted)' }}>No batches yet.</div>}
        {(batches || []).map(b => {
          const results = b.results || {}
          const saved = (b.papers || []).filter((_, i) => results[i]?.status === 'saved').length
          return (
            <div key={b.id} style={{ borderTop: '1px solid var(--t-border)', paddingTop: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
                <div style={{ fontSize: 13.5, fontWeight: 700 }}>{b.subject} <span style={{ fontWeight: 500, color: 'var(--t-textMuted)' }}>· {(b.papers || []).length} papers · {saved} saved · {new Date(b.created_at).toLocaleString()}</span></div>
                <button type="button" onClick={() => copy(b.id)} style={{ ...btn(false), padding: '5px 10px', fontSize: 12 }}><Copy size={13} /> {copied === b.id ? 'Copied' : 'Copy batch ID'}</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 6 }}>
                {(b.papers || []).map((p, i) => {
                  const r = results[i]
                  const [label, color] = r ? STATUS[r.status] || [r.status, 'var(--t-text)'] : ['Not loaded yet', 'var(--t-textFaint)']
                  return (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 150px minmax(0, 1.2fr)', gap: 10, fontSize: 12.5 }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.file}>{p.source}{p.solutions ? ' + solutions' : ''}</span>
                      <span style={{ color, fontWeight: 700 }}>{label}</span>
                      <span style={{ color: r?.status === 'failed' ? 'var(--t-danger)' : 'var(--t-textMuted)' }}>
                        {r?.status === 'failed' ? r.error : r ? `${r.questions} questions · ${r.marks} marks${r.figures ? ` · ${r.figures} figures` : ''}` : ''}
                      </span>
                    </div>
                  )
                })}
              </div>
              {!Object.keys(results).length && steps(b.id)}
            </div>
          )
        })}
      </div>
    </div>
  )
}
