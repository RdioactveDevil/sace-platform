import { useMemo, useState } from 'react'
import { ArrowLeft, Printer, Shuffle } from 'lucide-react'
import { THEMES } from '../lib/theme'
import { formatSubjectLabel } from '../lib/subjects'
import { getQuestionType, describeCorrectAnswer } from '../lib/questionTypes'
import {
  testPool, pickTestQuestions, paperTotals, questionMarks, sourceLabel, sourceYears, answerLines,
  DIFFICULTIES, seededRandom, shuffle,
} from '../lib/testMaker'
import MathText from './MathText'
import GraphView from './GraphView'
import TableView from './TableView'
import DiagramView from './DiagramView'

const FONT_B = "'Plus Jakarta Sans', sans-serif"
const COUNTS = [10, 15, 20, 30, 40]
const KEY_OPTIONS = [
  { value: 'solutions', label: 'Answers and working' },
  { value: 'answers', label: 'Answers only' },
  { value: 'none', label: 'No answers' },
]
const letter = (i) => String.fromCharCode(65 + i)

/**
 * The test maker: pick topics, how many questions and how hard, and get a
 * paper laid out for printing, with an answer key on its own page.
 * "Download PDF" opens the browser's print dialog, where Save as PDF keeps
 * the maths, graphs and diagrams exactly as they look here. Questions come
 * from the subject's bank (lib/testMaker.js picks them); past-exam questions
 * can be filtered by year once the bank has them (questions.source).
 */
export default function TestMakerScreen({ theme = 'dark', questions = [], struggleMap = {}, subject, profile, initialSubtopics = [], onExit }) {
  const t = THEMES[theme]
  const subjectLabel = formatSubjectLabel(subject || {}) || subject?.name || 'Practice'

  // Topics as the bank has them, each with its subtopics, in course order.
  const topics = useMemo(() => {
    const map = new Map()
    for (const q of questions) {
      if (!q.topic) continue
      if (!map.has(q.topic)) map.set(q.topic, new Set())
      if (q.subtopic) map.get(q.topic).add(q.subtopic)
    }
    return [...map].map(([name, subs]) => ({ name, subs: [...subs] }))
  }, [questions])

  const [subtopics, setSubtopics] = useState(initialSubtopics)
  const [count, setCount] = useState(20)
  const [difficulty, setDifficulty] = useState('mixed')
  const [pastOnly, setPastOnly] = useState(false)
  const [years, setYears] = useState([])
  const [keyMode, setKeyMode] = useState('solutions')
  const [unseenFirst, setUnseenFirst] = useState(true)
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e9))
  const [title, setTitle] = useState(`${subjectLabel} practice test`)

  const topicState = (tp) => {
    const n = tp.subs.filter(s => subtopics.includes(s)).length
    return n === 0 ? 'off' : n === tp.subs.length ? 'on' : 'some'
  }
  const toggleTopic = (tp) => setSubtopics(prev => topicState(tp) === 'on'
    ? prev.filter(s => !tp.subs.includes(s))
    : [...new Set([...prev, ...tp.subs])])

  const allYears = useMemo(() => sourceYears(questions), [questions])
  const pool = useMemo(
    () => testPool(questions, { subtopics, difficulty, pastOnly, years: pastOnly ? years : [] }),
    [questions, subtopics, difficulty, pastOnly, years],
  )
  const paper = useMemo(() => pickTestQuestions(pool, {
    count, seed, unseenFirst: unseenFirst ? (q) => !((struggleMap[q.id]?.attempts ?? 0) > 0) : null,
  }), [pool, count, seed, unseenFirst, struggleMap])
  const { marks, minutes } = paperTotals(paper)
  const chosenTopics = topics.filter(tp => topicState(tp) !== 'off').map(tp => tp.name)
  const topicLine = !chosenTopics.length || chosenTopics.length === topics.length ? 'All topics'
    : chosenTopics.length > 4 ? `${chosenTopics.slice(0, 4).join(', ')} and ${chosenTopics.length - 4} more`
    : chosenTopics.join(', ')

  const download = () => {
    // Save as PDF names the file after the page title.
    const before = document.title
    document.title = title.trim() || 'Practice test'
    const restore = () => { document.title = before; window.removeEventListener('afterprint', restore) }
    window.addEventListener('afterprint', restore)
    window.print()
    setTimeout(restore, 1000)
  }

  const chip = (on, extra = {}) => ({
    padding: '6px 11px', borderRadius: 999, fontFamily: FONT_B, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
    border: `1px solid ${on ? t.text : t.border}`, background: on ? t.text : t.bgCard, color: on ? t.bg : t.textSub, ...extra,
  })
  const label = { fontSize: 12, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: t.textMuted, marginBottom: 8, display: 'block' }
  const group = (name, options, value, onChange) => (
    <div role="radiogroup" aria-label={name} style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {options.map(o => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)} style={chip(value === o.value)}>{o.label}</button>
      ))}
    </div>
  )

  const css = `
    .tm { min-height: 100vh; background: ${t.bg}; color: ${t.text}; font-family: ${FONT_B}; }
    .tm-bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 24px; border-bottom: 1px solid ${t.border}; position: sticky; top: 0; background: ${t.bg}; z-index: 2; }
    .tm-grid { display: grid; grid-template-columns: 340px minmax(0, 1fr); gap: 24px; padding: 24px; align-items: start; max-width: 1240px; margin: 0 auto; }
    .tm-controls { display: flex; flex-direction: column; gap: 20px; position: sticky; top: 76px; max-height: calc(100vh - 100px); overflow-y: auto; padding-right: 4px; }
    .tm-sheet { background: #fff; color: #111; border-radius: 6px; box-shadow: 0 10px 40px rgba(0,0,0,0.25); padding: 44px 48px; }
    .tm-paper { font-family: ${FONT_B}; font-size: 14px; line-height: 1.55; color: #111; }
    .tm-paper h1 { font-size: 22px; margin: 0; letter-spacing: -0.01em; }
    .tm-meta { display: flex; flex-wrap: wrap; gap: 4px 16px; font-size: 12.5px; color: #444; margin-top: 6px; }
    .tm-fields { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 16px; margin: 18px 0 22px; font-size: 12.5px; color: #333; }
    .tm-fields span { border-bottom: 1px solid #999; padding-bottom: 14px; }
    .tm-q { padding: 14px 0 16px; border-top: 1px solid #ddd; break-inside: avoid; page-break-inside: avoid; }
    .tm-qhead { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; margin-bottom: 6px; }
    .tm-qnum { font-weight: 800; font-size: 15px; }
    .tm-marks { font-size: 12px; color: #555; white-space: nowrap; }
    .tm-src { font-size: 11.5px; color: #666; font-style: italic; margin-bottom: 4px; }
    .tm-opts { list-style: none; margin: 10px 0 0; padding: 0; display: flex; flex-direction: column; gap: 7px; }
    .tm-opts li { display: flex; gap: 10px; align-items: flex-start; }
    .tm-bubble { width: 20px; height: 20px; border: 1.5px solid #333; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 800; flex-shrink: 0; margin-top: 1px; }
    .tm-box { width: 22px; height: 22px; border: 1.5px solid #333; border-radius: 4px; flex-shrink: 0; }
    .tm-line { border-bottom: 1px solid #bbb; height: 30px; }
    .tm-hint { font-size: 12px; color: #555; margin-top: 6px; }
    .tm-fig { margin: 8px 0; max-width: 520px; }
    .tm-fig img { max-width: 100%; max-height: 300px; object-fit: contain; }
    .tm-key { margin-top: 36px; padding-top: 24px; border-top: 3px solid #111; break-before: page; page-break-before: always; }
    .tm-key h2 { font-size: 18px; margin: 0 0 4px; }
    .tm-ans { padding: 10px 0; border-top: 1px solid #e3e3e3; break-inside: avoid; page-break-inside: avoid; }
    .tm-sol { font-size: 13px; color: #333; margin-top: 4px; }
    .tm-foot { margin-top: 28px; font-size: 11px; color: #888; text-align: center; }
    @media screen and (max-width: 900px) {
      .tm-grid { grid-template-columns: 1fr; padding: 16px; }
      .tm-controls { position: static; max-height: none; overflow: visible; }
      .tm-sheet { padding: 24px 18px; }
      .tm-fields { grid-template-columns: 1fr 1fr; }
      .tm-bar { padding: 12px 16px; }
    }
    @media screen and (max-width: 560px) { .tm-bar-title { display: none; } }
    @media print {
      @page { size: A4; margin: 16mm 14mm; }
      html, body { background: #fff !important; }
      body * { visibility: hidden; }
      .tm-paper, .tm-paper * { visibility: visible; }
      .tm-paper { position: absolute; left: 0; top: 0; width: 100%; }
      .tm-sheet { box-shadow: none; padding: 0; border-radius: 0; }
      .tm-bar, .tm-controls { display: none; }
      .tm-fig { max-width: 400px; }
    }
  `

  // Order questions show their items shuffled, the same way each time for this paper.
  const orderItems = (q, i) => shuffle(q.items || [], seededRandom(seed + i + 1))

  const renderQuestion = (q, i) => {
    const type = getQuestionType(q)
    const m = questionMarks(q)
    const src = sourceLabel(q)
    const lines = answerLines(q)
    return (
      <div key={q.id} className="tm-q">
        <div className="tm-qhead">
          <span className="tm-qnum">Question {i + 1}</span>
          <span className="tm-marks">{m} mark{m === 1 ? '' : 's'}</span>
        </div>
        {src && <div className="tm-src">{src}</div>}
        <MathText text={q.question} />
        {(q.graph || q.table_data || q.diagram || q.image_url) && (
          <div className="tm-fig">
            {q.graph && <GraphView graph={q.graph} theme="light" />}
            {q.table_data && <TableView table={q.table_data} theme="light" />}
            {q.diagram && <DiagramView diagram={q.diagram} theme="light" />}
            {q.image_url && <img src={q.image_url} alt="" />}
          </div>
        )}
        {(type === 'mcq' || type === 'multi_select') && Array.isArray(q.options) && (
          <>
            {type === 'multi_select' && <div className="tm-hint">Select all that apply.</div>}
            <ul className="tm-opts">
              {q.options.map((o, j) => (
                <li key={j}><span className="tm-bubble">{letter(j)}</span><span style={{ minWidth: 0 }}><MathText text={o} /></span></li>
              ))}
            </ul>
          </>
        )}
        {type === 'order' && (
          <>
            <div className="tm-hint">Number these in the correct order.</div>
            <ul className="tm-opts">
              {orderItems(q, i).map((it, j) => <li key={j}><span className="tm-box" /><span><MathText text={it} /></span></li>)}
            </ul>
          </>
        )}
        {lines > 0 && (
          <div style={{ marginTop: 6 }}>
            {type === 'numeric' && q.unit && <div className="tm-hint">Give your answer in {q.unit}.</div>}
            {Array.from({ length: lines }, (_, k) => <div key={k} className="tm-line" />)}
          </div>
        )}
      </div>
    )
  }

  const renderAnswer = (q, i) => {
    const type = getQuestionType(q)
    let answer
    if (type === 'mcq') answer = `${letter(q.answer_index)}. ${q.options?.[q.answer_index] ?? ''}`
    else if (type === 'multi_select') answer = (q.answer_indices || []).map(j => `${letter(j)}. ${q.options?.[j] ?? ''}`).join('; ')
    else if (type === 'marked') answer = ''
    else answer = describeCorrectAnswer(q)
    const scheme = type === 'marked' && Array.isArray(q.marking_scheme) ? q.marking_scheme.filter(p => p?.point) : []
    return (
      <div key={q.id} className="tm-ans">
        <strong>{i + 1}.</strong>{' '}
        {answer && <MathText text={answer} />}
        {scheme.length > 0 && (
          <ul style={{ margin: '4px 0 0', paddingLeft: 20, fontSize: 13 }}>
            {scheme.map((p, k) => <li key={k}><MathText text={`${p.point} (${p.marks} mark${Number(p.marks) === 1 ? '' : 's'})`} /></li>)}
          </ul>
        )}
        {(keyMode === 'solutions' || (type === 'marked' && !scheme.length)) && q.solution && (
          <div className="tm-sol"><MathText text={q.solution} /></div>
        )}
      </div>
    )
  }

  return (
    <div className="tm">
      <style>{css}</style>
      <div className="tm-bar">
        <button type="button" onClick={onExit} style={{ display: 'flex', alignItems: 'center', gap: 6, border: 'none', background: 'transparent', color: t.text, fontFamily: FONT_B, fontSize: 13.5, fontWeight: 700, cursor: 'pointer', padding: 0, whiteSpace: 'nowrap' }}>
          <ArrowLeft size={16} aria-hidden="true" /> Back to practice
        </button>
        <div className="tm-bar-title" style={{ fontSize: 15, fontWeight: 800 }}>Test maker</div>
        <button type="button" onClick={download} disabled={!paper.length}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px', borderRadius: 10, border: 'none', background: paper.length ? t.accent : t.bgHover, color: paper.length ? '#0c1037' : t.textFaint, fontFamily: FONT_B, fontSize: 13.5, fontWeight: 800, cursor: paper.length ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap' }}>
          <Printer size={16} aria-hidden="true" /> Download PDF
        </button>
      </div>

      <div className="tm-grid">
        <div className="tm-controls">
          <div>
            <label htmlFor="tm-title" style={label}>Title</label>
            <input id="tm-title" value={title} onChange={e => setTitle(e.target.value)} maxLength={80}
              style={{ width: '100%', boxSizing: 'border-box', padding: '9px 11px', borderRadius: 9, border: `1px solid ${t.border}`, background: t.bgCard, color: t.text, fontFamily: FONT_B, fontSize: 13.5 }} />
          </div>

          <div>
            <span style={label}>Topics</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <button type="button" aria-pressed={!subtopics.length} onClick={() => setSubtopics([])} style={chip(!subtopics.length)}>All topics</button>
              {topics.map(tp => {
                const st = topicState(tp)
                return (
                  <button key={tp.name} type="button" aria-pressed={st === 'on'} onClick={() => toggleTopic(tp)}
                    style={chip(st === 'on', st === 'some' ? { borderColor: t.text, borderStyle: 'dashed' } : {})}>
                    {tp.name}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <span style={label}>Questions</span>
            {group('Number of questions', COUNTS.map(n => ({ value: n, label: String(n) })), count, setCount)}
          </div>

          <div>
            <span style={label}>Difficulty</span>
            {group('Difficulty', Object.entries(DIFFICULTIES).map(([value, d]) => ({ value, label: d.label })), difficulty, setDifficulty)}
          </div>

          {allYears.length > 0 && (
            <div>
              <span style={label}>Questions from</span>
              {group('Questions from', [{ value: false, label: 'Whole bank' }, { value: true, label: 'Past exams only' }], pastOnly, setPastOnly)}
              {pastOnly && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  {allYears.map(y => (
                    <button key={y} type="button" aria-pressed={years.includes(y)} style={chip(years.includes(y))}
                      onClick={() => setYears(prev => prev.includes(y) ? prev.filter(x => x !== y) : [...prev, y])}>{y}</button>
                  ))}
                  <span style={{ fontSize: 12, color: t.textMuted, alignSelf: 'center' }}>{years.length ? '' : 'All years'}</span>
                </div>
              )}
            </div>
          )}

          <div>
            <span style={label}>Answer key</span>
            {group('Answer key', KEY_OPTIONS, keyMode, setKeyMode)}
          </div>

          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, color: t.textSub, cursor: 'pointer', lineHeight: 1.5 }}>
            <input type="checkbox" checked={unseenFirst} onChange={e => setUnseenFirst(e.target.checked)} style={{ width: 16, height: 16, marginTop: 2, accentColor: t.text }} />
            Questions I haven't done yet first
          </label>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button type="button" onClick={() => setSeed(s => s + 1)} disabled={pool.length <= paper.length}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, border: `1px solid ${t.border}`, background: t.bgCard, color: pool.length > paper.length ? t.text : t.textFaint, fontFamily: FONT_B, fontSize: 13, fontWeight: 700, cursor: pool.length > paper.length ? 'pointer' : 'not-allowed' }}>
              <Shuffle size={15} aria-hidden="true" /> New set of questions
            </button>
            <div role="status" style={{ fontSize: 12.5, color: t.textMuted, lineHeight: 1.5 }}>
              {!pool.length ? 'No questions match these settings. Try more topics or another difficulty.'
                : pool.length < count ? `Only ${pool.length} question${pool.length === 1 ? '' : 's'} match, so the test has ${pool.length}.`
                : `${pool.length} questions match. Download PDF opens the print window: choose Save as PDF.`}
            </div>
          </div>
        </div>

        <div className="tm-sheet">
          <div className="tm-paper">
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8a6d1f' }}>GradeFarm</div>
            <h1>{title.trim() || 'Practice test'}</h1>
            <div className="tm-meta">
              <span>{subjectLabel}</span>
              <span>{topicLine}</span>
              <span>{paper.length} question{paper.length === 1 ? '' : 's'} · {marks} mark{marks === 1 ? '' : 's'}</span>
              {minutes > 0 && <span>Suggested time: {minutes} minutes</span>}
            </div>
            <div className="tm-fields">
              <span>Name</span>
              <span>Date</span>
              <span>Score &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;/ {marks}</span>
            </div>

            {paper.length ? paper.map(renderQuestion) : (
              <p style={{ color: '#666' }}>No questions match these settings yet.</p>
            )}

            {keyMode !== 'none' && paper.length > 0 && (
              <div className="tm-key">
                <h2>Answers</h2>
                <div style={{ fontSize: 12.5, color: '#555', marginBottom: 8 }}>{title.trim() || 'Practice test'}</div>
                {paper.map(renderAnswer)}
              </div>
            )}
            <div className="tm-foot">Made with GradeFarm</div>
          </div>
        </div>
      </div>
    </div>
  )
}
