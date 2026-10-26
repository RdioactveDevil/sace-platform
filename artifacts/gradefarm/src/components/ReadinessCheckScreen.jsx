import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import MathText from './MathText'
import GraphView from './GraphView'
import TableView from './TableView'
import DiagramView from './DiagramView'
import PassageView from './PassageView'
import { track } from '../lib/analytics'

// The free readiness check for parents (/readiness-check), linked from the
// Year 6 page. A parent sets it up without an account, their child answers 20
// questions from the Year 6 bank, and the API (routes/readiness.ts) marks it
// and emails the parent the report. /readiness-check/report/:token is the
// report link in that email.
//
// Progress is kept on this device (token, answers, position) so a refresh or
// a closed tab picks up where the child left off.

const SAVE_KEY = 'gf-readiness-check'
const YEARS = ['Year 4', 'Year 5', 'Year 6', 'Year 7', 'Year 8']
const SUBJECTS = { maths: 'Maths', english: 'English' }

function readSaved() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY) || 'null') } catch { return null }
}
function writeSaved(value) {
  try {
    if (value) localStorage.setItem(SAVE_KEY, JSON.stringify(value))
    else localStorage.removeItem(SAVE_KEY)
  } catch { /* private window: progress just isn't kept */ }
}

async function api(path, options = {}) {
  const res = await fetch(`/api/readiness${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(json.error || 'Something went wrong. Please try again.'), { status: res.status })
  return json
}

const CSS = `
.rc { --navy:#0b1d63; --navy-deep:#07134a; --gold:#f2c04f; --gold-soft:#fdf4dc; --gold-ink:#7a5300; --paper:#f7f6f2; --white:#fff;
  --ink:#0d1440; --ink-2:#464d6b; --ink-3:#7a8098; --line:#e4e3ec; --good:#11865c; --good-bg:#e5f5ee; --bad:#b8431b; --bad-bg:#fbebe4;
  min-height:100vh; background:var(--paper); color:var(--ink); font-family:'Plus Jakarta Sans','Segoe UI',system-ui,sans-serif; font-size:16px; line-height:1.55; color-scheme:light; }
.rc *, .rc *::before, .rc *::after { box-sizing:border-box; }
.rc h1, .rc h2, .rc h3 { margin:0; letter-spacing:-0.02em; line-height:1.15; text-wrap:balance; }
.rc p { margin:0; }
.rc :focus-visible { outline:3px solid var(--gold); outline-offset:3px; }
.rc-top { background:var(--navy-deep); padding:12px 16px; }
.rc-top .in { max-width:760px; margin:0 auto; display:flex; align-items:center; justify-content:space-between; gap:12px; }
.rc-logo { background:none; border:0; padding:0; cursor:pointer; color:#fff; font-weight:800; font-size:19px; line-height:1; font-family:inherit; letter-spacing:-0.03em; }
.rc-logo b { color:var(--gold); }
.rc-top small { color:#aeb6e3; font-size:13px; }
.rc-main { max-width:760px; margin:0 auto; padding:32px 16px 64px; display:flex; flex-direction:column; gap:20px; }
.rc-card { background:var(--white); border:1px solid var(--line); border-radius:20px; padding:28px; display:flex; flex-direction:column; gap:18px; }
.rc-eyebrow { font-size:12px; font-weight:800; letter-spacing:.14em; text-transform:uppercase; color:var(--gold-ink); }
.rc-h1 { font-size:clamp(28px,5vw,38px); font-weight:800; }
.rc-h2 { font-size:22px; font-weight:800; }
.rc-lead { color:var(--ink-2); font-size:17px; }
.rc-field { display:flex; flex-direction:column; gap:6px; font-weight:700; font-size:14.5px; }
.rc-field input, .rc-field select { font-weight:500; font-size:16px; line-height:1.3; font-family:inherit; color:var(--ink); background:var(--paper); border:1px solid var(--line); border-radius:12px; padding:13px 14px; width:100%; }
.rc-field input:focus, .rc-field select:focus { outline:none; border-color:var(--navy); box-shadow:0 0 0 3px rgba(11,29,99,.12); }
.rc-row { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
.rc-choice { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
.rc-choice button { text-align:left; border:2px solid var(--line); background:var(--paper); border-radius:14px; padding:14px 16px; cursor:pointer; font-family:inherit; color:var(--ink); }
.rc-choice button b { display:block; font-size:17px; }
.rc-choice button span { font-size:13.5px; color:var(--ink-3); }
.rc-choice button[aria-pressed="true"] { border-color:var(--navy); background:#eef1fb; }
.rc-check { display:flex; gap:10px; align-items:flex-start; font-size:14.5px; color:var(--ink-2); cursor:pointer; }
.rc-check input { width:18px; height:18px; margin-top:2px; accent-color:var(--navy); flex-shrink:0; }
.rc-btn { display:inline-flex; align-items:center; justify-content:center; gap:8px; border:0; border-radius:14px; padding:16px 26px; font-weight:800; font-size:16.5px; line-height:1.2; font-family:inherit; cursor:pointer; background:var(--gold); color:var(--navy-deep); box-shadow:0 8px 22px rgba(242,192,79,.35); }
.rc-btn:disabled { opacity:.55; cursor:default; box-shadow:none; }
.rc-btn.ghost { background:transparent; color:var(--ink); box-shadow:none; border:1px solid var(--line); }
.rc-btn.navy { background:var(--navy); color:#fff; box-shadow:none; }
.rc-link { background:none; border:0; padding:0; font-weight:700; font-size:14.5px; line-height:1.4; font-family:inherit; color:var(--navy); text-decoration:underline; cursor:pointer; }
.rc-small { font-size:13.5px; color:var(--ink-3); }
.rc-error { background:var(--bad-bg); color:var(--bad); border-radius:12px; padding:12px 14px; font-weight:600; font-size:14.5px; }
.rc-list { margin:0; padding:0; list-style:none; display:flex; flex-direction:column; gap:10px; }
.rc-list li { display:flex; gap:12px; align-items:flex-start; color:var(--ink-2); }
.rc-list li::before { content:"✓"; color:var(--good); font-weight:800; }
.rc-progress { display:flex; align-items:center; gap:12px; font-size:13.5px; font-weight:700; color:var(--ink-3); }
.rc-bar { flex:1; height:8px; border-radius:99px; background:var(--line); overflow:hidden; }
.rc-bar i { display:block; height:100%; background:var(--navy); border-radius:99px; transition:width .2s; }
.rc-q { font-size:18px; font-weight:600; line-height:1.6; overflow-x:auto; }
.rc-opts { display:flex; flex-direction:column; gap:10px; }
.rc-opt { display:flex; gap:12px; align-items:center; text-align:left; width:100%; border:2px solid var(--line); background:var(--white); border-radius:14px; padding:13px 15px; cursor:pointer; font-weight:600; font-size:16px; line-height:1.45; font-family:inherit; color:var(--ink); }
.rc-opt .l { width:30px; height:30px; flex-shrink:0; border-radius:50%; display:flex; align-items:center; justify-content:center; background:var(--paper); font-weight:800; font-size:13px; }
.rc-opt[aria-pressed="true"] { border-color:var(--navy); background:#eef1fb; }
.rc-opt[aria-pressed="true"] .l { background:var(--navy); color:#fff; }
.rc-opt .t { min-width:0; flex:1; overflow-x:auto; }
.rc-nav { display:flex; gap:10px; justify-content:space-between; flex-wrap:wrap; }
.rc-nav .right { display:flex; gap:10px; margin-left:auto; }
.rc-score { display:flex; align-items:baseline; gap:10px; flex-wrap:wrap; }
.rc-score b { font-size:56px; font-weight:800; letter-spacing:-0.04em; line-height:1; }
.rc-score span { font-size:18px; color:var(--ink-2); font-weight:700; }
.rc-band { display:inline-block; align-self:flex-start; background:var(--gold-soft); color:var(--gold-ink); font-weight:800; border-radius:99px; padding:6px 14px; font-size:14.5px; }
.rc-chips { display:flex; flex-wrap:wrap; gap:8px; }
.rc-chip { border-radius:99px; padding:6px 12px; font-size:14px; font-weight:700; }
.rc-chip.good { background:var(--good-bg); color:var(--good); }
.rc-chip.bad { background:var(--bad-bg); color:var(--bad); }
.rc-topics { display:flex; flex-direction:column; gap:12px; }
.rc-topic { display:grid; grid-template-columns:minmax(0,1fr) 120px 42px; gap:12px; align-items:center; font-size:14.5px; }
.rc-topic .bar { height:10px; border-radius:99px; background:var(--line); overflow:hidden; }
.rc-topic .bar i { display:block; height:100%; border-radius:99px; }
.rc-topic .n { font-weight:800; text-align:right; color:var(--ink-2); }
.rc-cta { background:var(--navy); color:#fff; border-radius:20px; padding:28px; display:flex; flex-direction:column; gap:14px; }
.rc-cta .rc-lead { color:#cdd3f2; }
.rc-cta .rc-eyebrow { color:var(--gold); }
.rc-review { border-top:1px solid var(--line); padding-top:18px; display:flex; flex-direction:column; gap:12px; }
.rc-review:first-of-type { border-top:0; padding-top:0; }
.rc-ans { display:flex; flex-direction:column; gap:6px; font-size:15px; }
.rc-ans div { border-radius:10px; padding:8px 12px; overflow-x:auto; }
.rc-ans .wrong { background:var(--bad-bg); color:var(--bad); }
.rc-ans .right { background:var(--good-bg); color:var(--good); }
.rc-sol { background:var(--paper); border-radius:12px; padding:14px 16px; font-size:15px; color:var(--ink-2); overflow-x:auto; }
.rc-meta { font-size:12.5px; font-weight:800; letter-spacing:.06em; text-transform:uppercase; color:var(--ink-3); }
@media (max-width:600px) {
  .rc-main { padding-top:20px; }
  .rc-card, .rc-cta { padding:20px; border-radius:16px; }
  .rc-row, .rc-choice { grid-template-columns:1fr; }
  .rc-topic { grid-template-columns:minmax(0,1fr) 70px 38px; font-size:13.5px; }
  .rc-btn { width:100%; }
  .rc-nav .right { width:100%; }
  .rc-nav .right .rc-btn { flex:1; }
}
`

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']
const pct = (t) => (t.total ? t.right / t.total : 0)
const barColour = (p) => (p >= 0.75 ? '#11865c' : p > 0.5 ? '#d9a21b' : '#c4532a')

function TopBar({ onHome, note }) {
  return (
    <div className="rc-top">
      <div className="in">
        <button type="button" className="rc-logo" onClick={onHome} aria-label="gradefarm home">grade<b>farm.</b></button>
        {note && <small>{note}</small>}
      </div>
    </div>
  )
}

function Setup({ initial, saved, onStart, onResume }) {
  const [email, setEmail] = useState(initial.email || '')
  const [childName, setChildName] = useState(initial.childName || '')
  const [yearLevel, setYearLevel] = useState(initial.yearLevel || 'Year 6')
  const [subject, setSubject] = useState(initial.subject || 'maths')
  const [confirmed, setConfirmed] = useState(false)
  const [updates, setUpdates] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    if (!confirmed) { setError("Please confirm you're their parent or guardian."); return }
    setBusy(true); setError('')
    try {
      await onStart({ parentEmail: email.trim(), childName: childName.trim(), yearLevel, subject, parentConfirmed: true, updates })
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <>
      {saved && (
        <div className="rc-card" style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
          <p style={{ flex: '1 1 260px' }}>
            {saved.done
              ? <><b>{saved.childName}'s {SUBJECTS[saved.subject]} report</b> is ready on this device.</>
              : <><b>{saved.childName}'s {SUBJECTS[saved.subject]} check</b> isn't finished yet. It picks up where they left off.</>}
          </p>
          <button type="button" className="rc-btn navy" onClick={onResume}>{saved.done ? 'See the report' : 'Carry on'}</button>
        </div>
      )}
      <form className="rc-card" onSubmit={submit} noValidate>
        <div className="rc-eyebrow">Free readiness check</div>
        <h1 className="rc-h1">Find out where your child stands in 20 questions.</h1>
        <p className="rc-lead">Set it up in two minutes, then hand the device to your child. When they finish, we mark it and email you the report: what they're strong at, where they're losing marks, and where to start.</p>

        <div className="rc-field">
          <span id="rc-subject">Subject</span>
          <div className="rc-choice" role="group" aria-labelledby="rc-subject">
            <button type="button" aria-pressed={subject === 'maths'} onClick={() => setSubject('maths')}>
              <b>Maths</b><span>Number, algebra, geometry, measurement, statistics</span>
            </button>
            <button type="button" aria-pressed={subject === 'english'} onClick={() => setSubject('english')}>
              <b>English</b><span>Reading, verbal reasoning, grammar</span>
            </button>
          </div>
        </div>

        <div className="rc-row">
          <label className="rc-field">Your child's first name
            <input value={childName} onChange={(e) => setChildName(e.target.value)} autoComplete="off" maxLength={40} required />
          </label>
          <label className="rc-field">Their year at school
            <select value={yearLevel} onChange={(e) => setYearLevel(e.target.value)}>
              {YEARS.map((y) => <option key={y}>{y}</option>)}
            </select>
          </label>
        </div>
        <label className="rc-field">Your email, for the report
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" required />
        </label>

        <label className="rc-check">
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
          <span>I'm this child's parent or guardian.</span>
        </label>
        <label className="rc-check">
          <input type="checkbox" checked={updates} onChange={(e) => setUpdates(e.target.checked)} />
          <span>Also send me occasional tips on selective-entry prep. (Optional.)</span>
        </label>

        {error && <div className="rc-error" role="alert">{error}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
          <button className="rc-btn" type="submit" disabled={busy || !email.trim() || !childName.trim()}>
            {busy ? 'Setting it up…' : 'Set up the check →'}
          </button>
          <p className="rc-small">Free, no card and no account needed. We only use your email for the report{updates ? ' and the tips you asked for' : ''}. See our <a href="/privacy" style={{ color: 'inherit' }}>Privacy Policy</a>.</p>
        </div>
      </form>
    </>
  )
}

function Handoff({ childName, subject, email, count, onBegin }) {
  return (
    <div className="rc-card">
      <div className="rc-eyebrow">Ready when they are</div>
      <h1 className="rc-h1">Over to you, {childName}.</h1>
      <ul className="rc-list">
        <li>{count} {SUBJECTS[subject]} questions. Most people take 20 to 30 minutes.</li>
        <li>Some are harder than Year 6 work. That's on purpose: just do your best.</li>
        {subject === 'maths' && <li>Have paper and a pencil for working. No calculator.</li>}
        <li>Stuck? Skip it and keep going. You can go back before you finish.</li>
      </ul>
      {email && <p className="rc-small">The report goes to {email} when {childName} finishes.</p>}
      <div><button type="button" className="rc-btn" onClick={onBegin}>Start the check</button></div>
    </div>
  )
}

function Runner({ questions, answers, index, setIndex, setAnswer, onFinish, submitting, error }) {
  const q = questions[index]
  const last = index === questions.length - 1
  const answered = Object.keys(answers).filter((id) => questions.some((x) => x.id === id) && answers[id] != null).length
  const top = useRef(null)
  useEffect(() => { top.current?.scrollIntoView({ block: 'start' }) }, [index])
  if (!q) return null
  const picked = answers[q.id]
  const passage = Array.isArray(q.passage) ? q.passage[0] : q.passage

  return (
    <div className="rc-card" ref={top} style={{ scrollMarginTop: 12 }}>
      <div className="rc-progress">
        <span>Question {index + 1} of {questions.length}</span>
        <div className="rc-bar" aria-hidden="true"><i style={{ width: `${((index + 1) / questions.length) * 100}%` }} /></div>
      </div>
      {passage && <PassageView passage={passage} theme="light" />}
      <div className="rc-q"><MathText text={q.question} /></div>
      {q.graph && <GraphView graph={q.graph} theme="light" />}
      {q.table_data && <TableView table={q.table_data} theme="light" />}
      {q.diagram && <DiagramView diagram={q.diagram} theme="light" />}
      <div className="rc-opts" role="group" aria-label="Answer options">
        {(q.options || []).map((opt, i) => (
          <button key={i} type="button" className="rc-opt" aria-pressed={picked === i} onClick={() => setAnswer(q.id, picked === i ? null : i)}>
            <span className="l">{LETTERS[i]}</span>
            <span className="t"><MathText text={String(opt)} /></span>
          </button>
        ))}
      </div>
      {error && <div className="rc-error" role="alert">{error}</div>}
      <div className="rc-nav">
        <button type="button" className="rc-btn ghost" onClick={() => setIndex(index - 1)} disabled={index === 0 || submitting}>Back</button>
        <div className="right">
          {last ? (
            <button type="button" className="rc-btn" onClick={onFinish} disabled={submitting}>
              {submitting ? 'Marking…' : answered < questions.length ? `Finish (${questions.length - answered} skipped)` : 'Finish and mark'}
            </button>
          ) : (
            <button type="button" className="rc-btn" onClick={() => setIndex(index + 1)}>{picked == null ? 'Skip' : 'Next'}</button>
          )}
        </div>
      </div>
    </div>
  )
}

function Report({ data, onSignUp, onOtherSubject }) {
  const r = data.report
  const name = data.childName
  const other = data.subject === 'maths' ? 'english' : 'maths'
  if (!r) return null
  return (
    <>
      <div className="rc-card">
        <div className="rc-eyebrow">{name}'s {SUBJECTS[data.subject]} readiness check</div>
        <div className="rc-score"><b>{r.score} of {r.max}</b><span>right</span></div>
        <span className="rc-band">{r.band.label}</span>
        <p className="rc-lead">{r.summary}</p>
        {r.stretch.total > 0 && (
          <p className="rc-small">On the harder questions (level 3 of 5 and up), {name} got {r.stretch.right} of {r.stretch.total}.{r.skipped ? ` ${r.skipped} skipped.` : ''}</p>
        )}
        <p className="rc-small">
          {data.emailed ? `A copy is in ${data.parentEmail}'s inbox.` : "We couldn't email this report, so keep this page: bookmark it or copy the link."}
        </p>
      </div>

      {(r.strengths.length > 0 || r.work_on.length > 0) && (
        <div className="rc-card">
          {r.strengths.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <h2 className="rc-h2">Strong at</h2>
              <div className="rc-chips">{r.strengths.map((t) => <span key={t} className="rc-chip good">{t}</span>)}</div>
            </div>
          )}
          {r.work_on.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <h2 className="rc-h2">Losing marks on</h2>
              <div className="rc-chips">{r.work_on.map((t) => <span key={t} className="rc-chip bad">{t}</span>)}</div>
            </div>
          )}
        </div>
      )}

      <div className="rc-card">
        <h2 className="rc-h2">Topic by topic</h2>
        <div className="rc-topics">
          {r.topics.map((t) => (
            <div key={t.topic} className="rc-topic">
              <span>{t.topic}</span>
              <span className="bar" aria-hidden="true"><i style={{ width: `${Math.max(pct(t) * 100, 4)}%`, background: barColour(pct(t)) }} /></span>
              <span className="n">{t.right}/{t.total}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rc-cta">
        <div className="rc-eyebrow">What's next</div>
        <h2 className="rc-h2" style={{ color: '#fff' }}>{r.start_with ? `Start practising ${r.start_with}.` : 'Keep them stretching.'}</h2>
        <p className="rc-lead">gradefarm finds {name}'s level, teaches what they get wrong, and writes new questions when they run out. Fifteen minutes a day, and a progress email for you every Sunday. Their first subject is free, with no card needed.</p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" className="rc-btn" onClick={onSignUp}>Set up {name}'s free account →</button>
          <button type="button" className="rc-link" style={{ color: '#fff' }} onClick={() => onOtherSubject(other)}>Try the {SUBJECTS[other]} check too</button>
        </div>
      </div>

      {r.review.length > 0 && (
        <div className="rc-card">
          <h2 className="rc-h2">The {r.review.length === 1 ? 'question' : `${r.review.length} questions`} {name} missed</h2>
          <p className="rc-small">With the working, so you can go through them together.</p>
          {r.review.map((item) => (
            <div key={item.id} className="rc-review">
              <div className="rc-meta">{item.topic}{item.passage_title ? ` · from "${item.passage_title}"` : ''}</div>
              <div className="rc-q" style={{ fontSize: 16 }}><MathText text={item.question} /></div>
              <div className="rc-ans">
                <div className="wrong">{item.picked == null ? 'Skipped' : <>Answered {LETTERS[item.picked]}: <MathText text={String(item.options[item.picked])} /></>}</div>
                <div className="right">Answer {LETTERS[item.answer_index]}: <MathText text={String(item.options[item.answer_index])} /></div>
              </div>
              {item.solution && <div className="rc-sol"><MathText text={item.solution} /></div>}
            </div>
          ))}
        </div>
      )}
      <p className="rc-small" style={{ textAlign: 'center' }}>Twenty questions is a snapshot, not a prediction of a test result.</p>
    </>
  )
}

export default function ReadinessCheckScreen({ signedIn = false }) {
  const navigate = useNavigate()
  const { token: linkToken } = useParams()
  const [phase, setPhase] = useState(linkToken ? 'loading' : 'setup')
  const [saved, setSaved] = useState(() => (linkToken ? null : readSaved()))
  const [check, setCheck] = useState(null) // { token, childName, subject, email, questions }
  const [answers, setAnswers] = useState({})
  const [index, setIndexState] = useState(0)
  const [report, setReport] = useState(null)
  const [setupDefaults, setSetupDefaults] = useState({})
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const prev = document.title
    document.title = 'Free readiness check · gradefarm.'
    return () => { document.title = prev }
  }, [])

  // Keep progress on this device.
  useEffect(() => {
    if (!check || phase === 'report') return
    writeSaved({ token: check.token, childName: check.childName, subject: check.subject, email: check.email, answers, index })
  }, [check, answers, index, phase])

  const open = async (token, fallback = {}) => {
    setPhase('loading'); setError('')
    try {
      const data = await api(`/${encodeURIComponent(token)}`)
      if (data.status === 'completed') {
        setReport(data)
        setPhase('report')
        if (!linkToken) writeSaved({ token, childName: data.childName, subject: data.subject, done: true })
      } else {
        setCheck({ token, childName: data.childName, subject: data.subject, email: fallback.email || '', questions: data.questions })
        setAnswers(fallback.answers || {})
        setIndexState(Math.min(fallback.index || 0, data.questions.length - 1))
        setPhase(fallback.index ? 'run' : 'handoff')
      }
    } catch (err) {
      if (!linkToken && (err.status === 404 || err.status === 410)) { writeSaved(null); setSaved(null); setPhase('setup'); return }
      setError(err.message)
      setPhase('error')
    }
  }

  useEffect(() => { if (linkToken) open(linkToken) }, [linkToken]) // eslint-disable-line react-hooks/exhaustive-deps

  const start = async (body) => {
    const data = await api('/start', { method: 'POST', body: JSON.stringify(body) })
    track('readiness_check_started', { subject: body.subject, year: body.yearLevel })
    setCheck({ token: data.token, childName: data.childName, subject: data.subject, email: body.parentEmail, questions: data.questions })
    setAnswers({}); setIndexState(0); setSaved(null)
    setPhase('handoff')
  }

  const finish = async () => {
    setSubmitting(true); setError('')
    try {
      const data = await api(`/${encodeURIComponent(check.token)}/submit`, { method: 'POST', body: JSON.stringify({ answers }) })
      track('readiness_check_completed', { subject: check.subject, score: data.report?.score })
      writeSaved({ token: check.token, childName: data.childName, subject: data.subject, done: true })
      setReport(data)
      setPhase('report')
      window.scrollTo(0, 0)
    } catch (err) {
      setError(err.message)
    }
    setSubmitting(false)
  }

  const setIndex = (i) => setIndexState(Math.max(0, Math.min(i, (check?.questions.length || 1) - 1)))
  const setAnswer = (id, value) => setAnswers((a) => ({ ...a, [id]: value }))

  const signUp = () => {
    track('readiness_check_signup_click', { subject: report?.subject })
    if (signedIn) navigate('/home')
    else navigate('/auth', { state: { mode: 'signup', as: 'parent', email: report?.parentEmail || '', childName: report?.childName || '' } })
  }
  const otherSubject = (subject) => {
    setSetupDefaults({ subject, childName: report?.childName, email: report?.parentEmail, yearLevel: report?.yearLevel })
    setSaved(null); setReport(null); setCheck(null)
    setPhase('setup')
    if (linkToken) navigate('/readiness-check')
    window.scrollTo(0, 0)
  }

  const note = useMemo(() => {
    if (phase === 'run' && check) return `${check.childName}'s ${SUBJECTS[check.subject]} check`
    return 'Free readiness check'
  }, [phase, check])

  return (
    <div className="rc">
      <style>{CSS}</style>
      <TopBar onHome={() => navigate('/year-6')} note={note} />
      <main className="rc-main">
        {phase === 'loading' && <div className="rc-card"><p className="rc-lead">Loading…</p></div>}
        {phase === 'error' && (
          <div className="rc-card">
            <h1 className="rc-h2">That didn't work</h1>
            <div className="rc-error" role="alert">{error}</div>
            <div><button type="button" className="rc-btn" onClick={() => { setError(''); navigate('/readiness-check'); setPhase('setup') }}>Start a new check</button></div>
          </div>
        )}
        {phase === 'setup' && (
          <Setup
            key={setupDefaults.subject || 'setup'}
            initial={setupDefaults}
            saved={saved}
            onStart={start}
            onResume={() => open(saved.token, saved)}
          />
        )}
        {phase === 'handoff' && check && (
          <Handoff childName={check.childName} subject={check.subject} email={check.email} count={check.questions.length} onBegin={() => setPhase('run')} />
        )}
        {phase === 'run' && check && (
          <Runner
            questions={check.questions}
            answers={answers}
            index={index}
            setIndex={setIndex}
            setAnswer={setAnswer}
            onFinish={finish}
            submitting={submitting}
            error={error}
          />
        )}
        {phase === 'report' && report && <Report data={report} onSignUp={signUp} onOtherSubject={otherSubject} />}
      </main>
    </div>
  )
}
