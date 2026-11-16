import { useCallback, useEffect, useState } from 'react'
import { FileStack } from 'lucide-react'
import MathText from './MathText'
import { QuestionPanel, parseOptions } from './AdminQuestionPanel'
import ExtendedQuestionEditor from './ExtendedQuestionEditor'
import { confirmDialog } from '../lib/dialog'
import { ui, btn, note, FONT_B } from '../lib/adminUi'
import { groupLoadedPapers } from '../lib/examPapers'
import { fetchLoadedPaperQuestions, bulkEditQuestions, editQuestion, deleteQuestion, editExtendedQuestion } from '../lib/adminDb'

const LETTERS = 'ABCDEFGH'
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '')
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

/**
 * The exam papers loaded into a subject for the exam builder: each paper with
 * its question counts, opened to check every question in exam order, edit
 * one (Section B part by part), or delete the paper.
 */
export default function AdminLoadedPapers({ curriculumId }) {
  const [papers, setPapers] = useState(null)
  const [error, setError] = useState('')
  const [openKey, setOpenKey] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState(null)

  const load = useCallback(async () => {
    try { setPapers(groupLoadedPapers(await fetchLoadedPaperQuestions(curriculumId))); setError('') }
    catch (e) { setError(e.message || "The papers couldn't be loaded.") }
  }, [curriculumId])
  useEffect(() => { load() }, [load])

  const run = async (key, fn, ok) => {
    setBusy(key); setMsg(null)
    try { await fn(); setMsg({ ok: true, text: ok }); await load(); return true }
    catch (e) { setMsg({ ok: false, text: e.message || "That didn't work." }); return false }
    finally { setBusy('') }
  }

  const removePaper = async (p) => {
    const ids = [...p.a, ...p.b].map(q => q.id)
    if (!(await confirmDialog(`Delete ${p.label}? Its ${plural(ids.length, 'question')} come out of the bank and the exam builder. Practice exams already built from it just leave those questions out. This can't be undone.`, { confirm: 'Delete paper', danger: true }))) return
    if (await run(`del:${p.key}`, () => bulkEditQuestions({ curriculumId, ids, action: 'delete' }), `Deleted ${p.label}.`)) setOpenKey(null)
  }
  const removeQuestion = async (q) => {
    if (!(await confirmDialog(`Delete question ${q.exam_section}${q.source_question} from ${q.source}?`, { confirm: 'Delete', danger: true }))) return
    run(`delq:${q.id}`, () => deleteQuestion(q.id), 'Question deleted.')
  }

  if (error) return <div role="alert" style={note('danger')}>{error}</div>
  if (!papers) return <div style={ui.hint}>Loading the papers…</div>

  return (
    <div style={{ ...ui.card, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12, fontFamily: FONT_B }}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--t-text)' }}><FileStack size={17} aria-hidden="true" /> Loaded papers</div>
        <div style={{ ...ui.hint, marginTop: 4 }}>The past and trial papers in this subject's bank, used by the exam builder. Open one to check every question, fix one, or delete the whole paper.</div>
      </div>
      {msg && <div role="status" style={note(msg.ok ? 'success' : 'danger')}>{msg.text}</div>}
      {papers.length === 0 ? <div style={{ ...ui.hint, padding: '6px 0' }}>No papers loaded yet. Load some below.</div> : papers.map(p => {
        const open = openKey === p.key
        return (
          <div key={p.key} style={{ border: '1px solid var(--t-border)', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', flexWrap: 'wrap', background: open ? 'var(--t-bgSubtle)' : 'transparent' }}>
              <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--t-text)' }}>
                  {p.label}
                  <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: p.kind === 'trial' ? 'var(--t-bgHover)' : 'rgba(241,190,67,0.2)', color: p.kind === 'trial' ? 'var(--t-textMuted)' : 'var(--t-goldText)' }}>{p.kind === 'trial' ? 'Trial' : 'Past paper'}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--t-textMuted)', marginTop: 2 }}>
                  {[p.a.length && `${p.a.length} multiple choice`, p.b.length && `${p.b.length} extended`, `${p.marks} marks`, p.loadedAt && `loaded ${fmtDate(p.loadedAt)}`].filter(Boolean).join(' · ')}
                </div>
              </div>
              <button type="button" onClick={() => { setOpenKey(open ? null : p.key); setEditingId(null) }} aria-expanded={open} style={btn('secondary')}>{open ? 'Close' : 'Open'}</button>
              <button type="button" onClick={() => removePaper(p)} disabled={!!busy} style={btn('danger', !!busy)}>{busy === `del:${p.key}` ? 'Deleting…' : 'Delete paper'}</button>
            </div>

            {open && (
              <div style={{ padding: '4px 14px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[['A', 'Section A · multiple choice', p.a], ['B', 'Section B · extended response', p.b]].filter(([, , list]) => list.length).map(([sec, title, list]) => (
                  <div key={sec} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--t-textFaint)', marginTop: 8 }}>{title}</div>
                    {list.map(q => (
                      <div key={q.id} style={{ border: '1px solid var(--t-border)', borderRadius: 9, padding: '10px 12px', background: 'var(--t-bgCard)' }}>
                        {editingId === q.id ? (
                          q.question_type === 'extended'
                            ? <ExtendedQuestionEditor question={q} busy={busy === `edit:${q.id}`} onCancel={() => setEditingId(null)}
                                onSave={async (body) => { if (await run(`edit:${q.id}`, () => editExtendedQuestion(q.id, body), `Saved question ${sec}${q.source_question}.`)) setEditingId(null) }} />
                            : <QuestionPanel key={q.id} questionId={q.id} q={q} busy={busy} open meta={`${q.source} · Question ${sec}${q.source_question}`}
                                onEdit={(fields) => run(`edit:${q.id}`, () => editQuestion(q.id, fields), `Saved question ${sec}${q.source_question}.`)}
                                onDelete={() => run(`delq:${q.id}`, () => deleteQuestion(q.id), 'Question deleted.')} />
                        ) : (
                          <PaperQuestion q={q} sec={sec} busy={busy} onEdit={() => setEditingId(q.id)} onDelete={() => removeQuestion(q)} />
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** One question of a paper as it reads, with its answer and solution. */
function PaperQuestion({ q, sec, busy, onEdit, onDelete }) {
  const options = parseOptions(q.options)
  const extended = q.question_type === 'extended'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--t-textMuted)', minWidth: 34 }}>{sec}{q.source_question}</span>
        <div style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: 'var(--t-text)', lineHeight: 1.55 }}>
          <MathText text={q.question || ''} />
          {extended && <span style={{ fontSize: 12, color: 'var(--t-textMuted)' }}> · {q.total_marks} marks</span>}
        </div>
        <button type="button" onClick={onEdit} disabled={!!busy} style={{ ...btn('secondary', !!busy), padding: '5px 10px', fontSize: 12 }}>Edit</button>
        <button type="button" onClick={onDelete} disabled={!!busy} style={{ ...btn('danger', !!busy), padding: '5px 10px', fontSize: 12 }}>Delete</button>
      </div>
      {q.image_url && <img src={q.image_url} alt={`Figure for question ${sec}${q.source_question}`} style={{ maxWidth: 340, marginLeft: 44, borderRadius: 8, border: '1px solid var(--t-border)' }} />}
      {!extended && options.length > 0 && (
        <div style={{ marginLeft: 44, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {options.map((o, i) => (
            <div key={i} style={{ fontSize: 13, color: i === q.answer_index ? 'var(--t-success)' : 'var(--t-textSub)', fontWeight: i === q.answer_index ? 700 : 400 }}>
              {LETTERS[i]}. <MathText text={String(o)} />{i === q.answer_index && ' ✓'}
            </div>
          ))}
        </div>
      )}
      {extended && (q.parts || []).map((part, i) => (
        <div key={i} style={{ marginLeft: 44 + ((part.level || 1) - 1) * 18, fontSize: 13, color: 'var(--t-textSub)', lineHeight: 1.55 }}>
          <strong>{part.label ? `${part.label}. ` : ''}</strong><MathText text={part.text || ''} /> <span style={{ color: 'var(--t-textMuted)' }}>({part.marks} mark{part.marks === 1 ? '' : 's'})</span>
          {part.image_url && <div><img src={part.image_url} alt={`Figure for part ${part.label}`} style={{ maxWidth: 300, borderRadius: 8, border: '1px solid var(--t-border)', marginTop: 4 }} /></div>}
          {part.solution && <div style={{ fontSize: 12.5, color: 'var(--t-textMuted)', marginTop: 2 }}>Solution: <MathText text={part.solution} /></div>}
        </div>
      ))}
      {!extended && q.solution && <div style={{ marginLeft: 44, fontSize: 12.5, color: 'var(--t-textMuted)' }}>Solution: <MathText text={q.solution} /></div>}
    </div>
  )
}
