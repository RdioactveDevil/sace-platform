import { useCallback, useEffect, useState } from 'react'
import { FileStack, AlertTriangle, ExternalLink } from 'lucide-react'
import MathText from './MathText'
import { QuestionPanel, parseOptions } from './AdminQuestionPanel'
import ExtendedQuestionEditor from './ExtendedQuestionEditor'
import { confirmDialog } from '../lib/dialog'
import { ui, btn, note, FONT_B } from '../lib/adminUi'
import { groupLoadedPapers } from '../lib/examPapers'
import { fetchLoadedPaperQuestions, bulkEditQuestions, editQuestion, deleteQuestion, editExtendedQuestion, reviewQuestions, fetchPaperPdfLinks } from '../lib/adminDb'
import { reviewFlags, reviewState, needsAttention, reviewSummary } from '../lib/questionChecks'

const LETTERS = 'ABCDEFGH'
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '')
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

/**
 * The exam papers loaded into a subject for the exam builder: each paper with
 * its question counts, opened to check every question in exam order against
 * the paper, approve or reject it, edit one (Section B part by part), or
 * delete the paper. Newly loaded questions wait here, kept from students,
 * until an admin approves them (lib/questionChecks.js has the checks).
 */
export default function AdminLoadedPapers({ curriculumId, subject }) {
  const [papers, setPapers] = useState(null)
  const [error, setError] = useState('')
  const [openKey, setOpenKey] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState(null)
  const [links, setLinks] = useState(() => new Map())
  // Per paper: show every question, or only those that need checking.
  const [showAll, setShowAll] = useState({})

  useEffect(() => {
    if (!subject) return
    fetchPaperPdfLinks(subject).then(setLinks).catch(() => {})
  }, [subject])

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

  const review = (ids, status, ok) => run(`rev:${ids.join(',')}`, () => reviewQuestions(ids, status), ok)
  const approveClean = async (p, ids) => {
    if (!(await confirmDialog(`Approve ${plural(ids.length, 'question')} from ${p.label} that the checks found nothing wrong with? They go to students straight away. Check a few against the paper first.`, { confirm: 'Approve' }))) return
    review(ids, 'approved', `Approved ${plural(ids.length, 'question')}.`)
  }

  if (error) return <div role="alert" style={note('danger')}>{error}</div>
  if (!papers) return <div style={ui.hint}>Loading the papers…</div>

  return (
    <div style={{ ...ui.card, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12, fontFamily: FONT_B }}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--t-text)' }}><FileStack size={17} aria-hidden="true" /> Loaded papers</div>
        <div style={{ ...ui.hint, marginTop: 4 }}>The past and trial papers in this subject's bank, used by the exam builder. Newly loaded questions wait here until you approve them: open a paper, check each question against the original, fix or reject what came out wrong, and approve the rest.</div>
      </div>
      {msg && <div role="status" style={note(msg.ok ? 'success' : 'danger')}>{msg.text}</div>}
      {papers.length === 0 ? <div style={{ ...ui.hint, padding: '6px 0' }}>No papers loaded yet. Load some below.</div> : papers.map(p => {
        const open = openKey === p.key
        const sum = reviewSummary([...p.a, ...p.b])
        const all = !!showAll[p.key] || !sum.attention
        const pdf = links.get(p.label)
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
                {(sum.pending > 0 || sum.flagged > 0 || sum.rejected > 0) && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                    {sum.pending > 0 && <Chip tone="warn">{sum.pending} to review</Chip>}
                    {sum.flagged > 0 && <Chip tone="danger">{plural(sum.flagged, 'possible problem')}</Chip>}
                    {sum.rejected > 0 && <Chip>{sum.rejected} rejected</Chip>}
                  </div>
                )}
              </div>
              {sum.cleanPending.length > 0 && (
                <button type="button" onClick={() => approveClean(p, sum.cleanPending)} disabled={!!busy} style={btn('secondary', !!busy)}>Approve {sum.cleanPending.length} without problems</button>
              )}
              <button type="button" onClick={() => { setOpenKey(open ? null : p.key); setEditingId(null) }} aria-expanded={open} style={btn('secondary')}>{open ? 'Close' : 'Open'}</button>
              <button type="button" onClick={() => removePaper(p)} disabled={!!busy} style={btn('danger', !!busy)}>{busy === `del:${p.key}` ? 'Deleting…' : 'Delete paper'}</button>
            </div>

            {open && (
              <div style={{ padding: '4px 14px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginTop: 8, fontSize: 13, color: 'var(--t-textSub)' }}>
                  {sum.attention > 0 && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                      <input type="checkbox" checked={!all} onChange={e => setShowAll(s => ({ ...s, [p.key]: !e.target.checked }))} />
                      Only the {plural(sum.attention, 'question')} that need checking
                    </label>
                  )}
                  {pdf && <a href={pdf} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--t-accentText, var(--t-text))', fontWeight: 700 }}><ExternalLink size={14} aria-hidden="true" /> Open the paper</a>}
                </div>
                {[['A', 'Section A · multiple choice', p.a], ['B', 'Section B · extended response', p.b]].map(([sec, title, list]) => [sec, title, all ? list : list.filter(q => needsAttention(q))]).filter(([, , list]) => list.length).map(([sec, title, list]) => (
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
                          <PaperQuestion q={q} sec={sec} busy={busy} pdf={pdf} onEdit={() => setEditingId(q.id)} onDelete={() => removeQuestion(q)}
                            onReview={(status) => review([q.id], status, status === 'approved' ? `Approved ${sec}${q.source_question}.` : status === 'rejected' ? `Rejected ${sec}${q.source_question}: students won't see it.` : `${sec}${q.source_question} is back in review.`)} />
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

const CHIP_TONES = {
  warn: { background: 'rgba(241,190,67,0.2)', color: 'var(--t-goldText)' },
  danger: { background: 'var(--t-dangerBg, rgba(220,38,38,0.12))', color: 'var(--t-danger, #b91c1c)' },
  success: { background: 'var(--t-successBg, rgba(22,163,74,0.12))', color: 'var(--t-success)' },
}
function Chip({ tone, children }) {
  return <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: 'var(--t-bgHover)', color: 'var(--t-textMuted)', ...(CHIP_TONES[tone] || {}) }}>{children}</span>
}

const STATE_CHIP = { pending: ['warn', 'To review'], approved: ['success', 'Approved'], rejected: [null, 'Rejected'] }
const small = (kind, busy) => ({ ...btn(kind, busy), padding: '5px 10px', fontSize: 12 })

/** One question of a paper as it reads, with its answer and solution, what the checks found, and its review. */
function PaperQuestion({ q, sec, busy, pdf, onEdit, onDelete, onReview }) {
  const options = parseOptions(q.options)
  const extended = q.question_type === 'extended'
  const flags = reviewFlags(q)
  const state = reviewState(q)
  // Questions loaded before reviews existed have no status: they are live.
  const [tone, label] = q.review_status ? STATE_CHIP[state] : [null, null]
  const page = Number(q.review?.page) || 0
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, opacity: state === 'rejected' ? 0.6 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--t-textMuted)', minWidth: 34 }}>{sec}{q.source_question}</span>
        <div style={{ flex: '1 1 240px', minWidth: 0, fontSize: 13.5, color: 'var(--t-text)', lineHeight: 1.55 }}>
          {label && <span style={{ marginRight: 8 }}><Chip tone={tone}>{label}</Chip></span>}
          <MathText text={q.question || ''} />
          {extended && <span style={{ fontSize: 12, color: 'var(--t-textMuted)' }}> · {q.total_marks} marks</span>}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {pdf && page > 0 && <a href={`${pdf}#page=${page}`} target="_blank" rel="noreferrer" style={{ ...small('secondary', false), textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>Page {page} <ExternalLink size={12} aria-hidden="true" /></a>}
          {state !== 'approved' && <button type="button" onClick={() => onReview('approved')} disabled={!!busy} style={small('primary', !!busy)}>Approve</button>}
          {state !== 'rejected' && <button type="button" onClick={() => onReview('rejected')} disabled={!!busy} style={small('secondary', !!busy)} title="Keep it out of exams and practice without deleting it">{q.review_status ? 'Reject' : 'Hide from students'}</button>}
          <button type="button" onClick={onEdit} disabled={!!busy} style={small('secondary', !!busy)}>Edit</button>
          <button type="button" onClick={onDelete} disabled={!!busy} style={small('danger', !!busy)}>Delete</button>
        </div>
      </div>
      {flags.length > 0 && state !== 'rejected' && (
        <div role="note" style={{ marginLeft: 44, display: 'flex', flexDirection: 'column', gap: 3, padding: '8px 10px', borderRadius: 8, background: 'rgba(241,190,67,0.12)', border: '1px solid rgba(241,190,67,0.4)', fontSize: 12.5, color: 'var(--t-text)' }}>
          {flags.map((f, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
              <AlertTriangle size={13} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2, color: 'var(--t-goldText)' }} />
              <span>{f.message}</span>
            </div>
          ))}
        </div>
      )}
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
