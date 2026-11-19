import { useState, useRef, useEffect } from 'react'
import { ArrowRight, ArrowDown } from 'lucide-react'
import MathText from '../MathText'
import { StartButton } from '../SiteChrome'
import InfinityLoader from '../InfinityLoader'
import { tryStart, tryAnswer, tryContinue, tryFinish, tryResult, tryLegend, trySummary, TRY_RUN_LENGTH, TRY_WALL, TRY_SUBJECTS } from '../../lib/tryIt'

// "Try it now. See what happens." on the homepage: pick a subject, then three
// sample questions that show the engine reacting to each answer (rules in
// lib/tryIt.js).
// Styles are in homeCss.js (scoped under .gfx).

const PICK_FLASH_MS = 450 // the picked answer shows green or red before the result
const ADDING_MS = 1600 // "Adding 10 more questions…" before the finish

const Stars = ({ level, pop = false }) => (
  <span className="stars" aria-hidden="true">
    {[1, 2, 3, 4, 5].map(j => <span key={j} className={`star${j <= level ? ' on' : ''}${pop && j === level ? ' new' : ''}`}>★</span>)}
  </span>
)

const Icon = ({ d, ...rest }) => <svg viewBox="0 0 24 24" aria-hidden="true" {...rest}><path d={d} /></svg>
const LOOP = 'M4 12a8 8 0 0 1 13.7-5.7L20 8.5M20 4v4.5h-4.5M20 12a8 8 0 0 1-13.7 5.7L4 15.5M4 20v-4.5h4.5'
const CLOCK = <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>
const STAR = 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z'

/** Roughly how many characters an option shows (maths without its markup). Short ones sit two to a row on phones. */
const shownLength = (o) => o.replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '$1/$2').replace(/[$\\{}^\s]/g, '').length
const isShort = (o) => shownLength(o) <= 10

/** The right answer inside a sentence: maths as it is, words in quotes, no doubled full stop. */
function Answer({ text }) {
  const maths = text.includes('$')
  const shown = maths ? text : `\u2018${text.replace(/\.$/, '')}\u2019`
  return <><span className="mth"><MathText text={shown} /></span>.</>
}

export default function TryItBox({ onStart, onNext }) {
  const [subject, setSubject] = useState(null) // nothing until they pick one
  const [s, setS] = useState(tryStart)
  const [flash, setFlash] = useState(null) // the answer just picked, before the result shows
  const [workOpen, setWorkOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const timers = useRef([])
  const later = (fn, ms) => { timers.current.push(setTimeout(fn, ms)) }
  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = [] }
  useEffect(() => clearTimers, [])

  const finish = (next) => { setS(next); setAdding(true); later(() => setAdding(false), ADDING_MS) }
  const pick = (i) => {
    if (flash !== null || s.phase !== 'ask') return
    setFlash(i)
    later(() => { setS(cur => tryAnswer(cur, i)); setFlash(null); setWorkOpen(false) }, PICK_FLASH_MS)
  }
  const cont = () => {
    const next = tryContinue(s)
    if (next.phase === 'done') finish(next); else setS(next)
  }
  const skip = () => { clearTimers(); setFlash(null); finish(tryFinish(s)) }
  const choose = (id) => { setSubject(id); setS(tryStart(id)) }
  const restart = () => { clearTimers(); setFlash(null); setAdding(false); setWorkOpen(false); setSubject(null); setS(tryStart()) }

  const q = s.question
  const picking = !subject
  const playing = !picking && s.phase !== 'done'
  const subjectName = TRY_SUBJECTS.find(x => x.id === s.subject)?.name
  const inComeback = s.mode === 'comeback'
  const r = s.phase === 'result' ? tryResult(s) : null
  const lit = tryLegend(s)
  const sum = trySummary(s)

  return (
    <section className="sec" id="try" aria-labelledby="gfx-try-h">
      <div className="in">
        <h2 className="h2" id="gfx-try-h">Try it now. See what happens.</h2>
        {/* The box with its explanations either side: Spaced Repetition on the left, Comeback Mode or
            Difficulty on the right. Each shows only while it's happening. Below the box on narrow screens. */}
        <div className="tqrow">
        <div className="side l" aria-live="polite">
          {lit.spaced && <div className="lgi lit"><span className="li">{CLOCK}</span><div><b>Spaced Repetition</b><span>You just missed this question and gradefarm has logged it. It will be reshown to you at specific times to ensure it sticks.</span></div></div>}
        </div>
        <div className="card tq">
          {picking && (
            <div className="pick">
              <p className="pk-h">Pick a subject</p>
              <div className="pk-opts">
                {TRY_SUBJECTS.map(x => (
                  <button key={x.id} type="button" className="pk" onClick={() => choose(x.id)}><b>{x.name}</b></button>
                ))}
              </div>
            </div>
          )}
          {playing && (
            <>
              <div className="top">
                {inComeback ? (
                  <div className="prog"><span className="cbp"><Icon d={LOOP} width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />Comeback Mode</span><span>One like the one you missed</span></div>
                ) : (
                  <div className="prog">
                    <span className="subj-tag">{subjectName}</span>
                    <span>Question {s.step + 1} of {TRY_RUN_LENGTH}</span>
                    <span className="dots" aria-hidden="true">{Array.from({ length: TRY_RUN_LENGTH }, (_, j) => <i key={j} className={j < s.step ? 'done' : j === s.step ? 'cur' : ''} />)}</span>
                  </div>
                )}
                <div className="diff"><span>Difficulty</span><Stars level={s.level} pop={s.levelUp} /><b>{s.level} of 5</b></div>
              </div>
              <div key={s.key} className={s.key % 2 ? 'qa' : 'qb'}>
                <p className="stem"><MathText text={q.stem} /></p>
                {s.phase === 'ask' && (
                  <div className={`opts${q.options.every(isShort) ? ' short' : ''}`}>
                    {q.options.map((o, i) => (
                      <button key={i} type="button" disabled={flash !== null} onClick={() => pick(i)}
                        className={`opt${flash === null ? '' : i === q.answer ? ' r' : i === flash ? ' w' : ' d'}`}>
                        <span className="k">{'ABCD'[i]}</span><span className="mth"><MathText text={o} /></span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {r && (
                <div className="res" aria-live="polite">
                  <div className="rh">
                    {s.correct
                      ? <span className="ic ok"><Icon d="M5 12.5l4.5 4.5L19 7.5" /></span>
                      : <span className="ic no"><Icon d="M7 7l10 10M17 7L7 17" /></span>}
                    <div className="rt">
                      <b>{r.title}</b>
                      <span>
                        {r.answer && <>The answer is <Answer text={r.answer} />{r.line ? ' ' : ''}</>}
                        {r.line}
                      </span>
                    </div>
                  </div>
                  <div className="nx">
                    <b>{r.nextTitle}</b>
                    <span className="nm">{r.nextStars && <Stars level={s.level} />}<span>{r.nextNote}</span></span>
                  </div>
                  {workOpen && <p className="work"><MathText text={q.working} /></p>}
                  <div className="ra">
                    <button type="button" className="btn lg gold go" onClick={cont}>{r.button}<ArrowRight size={20} strokeWidth={2.75} aria-hidden="true" /></button>
                    <button type="button" className="wk" aria-expanded={workOpen} onClick={() => setWorkOpen(o => !o)}>{workOpen ? 'Hide the working' : 'See the working'}</button>
                  </div>
                </div>
              )}
            </>
          )}
          {!picking && !playing && adding && (
            <div className="fin">
              <div className="adding" role="status">
                <InfinityLoader size={52} color="var(--sq3)" track="var(--sq0)" label={null} />
                <b>Adding 10 more questions…</b>
                <span className="tens" aria-hidden="true">{Array.from({ length: 10 }, (_, j) => <i key={j} />)}</span>
              </div>
            </div>
          )}
          {!picking && !playing && !adding && (
            <div className="fin">
              <div className="wall" aria-hidden="true">
                {TRY_WALL[s.subject].map((row, li) => (
                  <div key={li} className={`lane l${li + 1}`}>
                    <div className="track">
                      {[...row, ...row].map((text, j) => (
                        <div key={j} className="wq" style={{ animationDelay: `${j < row.length ? (li ? 0.2 : 0.05) + j * 0.07 : 0}s` }}>
                          <span className="mt"><MathText text={text} /></span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <h3>That's the point. You'll never run out.</h3>
              <p>Run low and <span className="wm">grade<span>farm.</span></span> writes 10 more instantly, so there's always a next question.</p>
              <div className="frows">
                <div className="frow"><span>Difficulty reached</span><b className="fst"><Stars level={sum.level} /><span>{sum.level} of 5</span></b></div>
                <div className="frow"><span>Spaced Repetition</span><b>{sum.spaced}</b></div>
                <div className="frow"><span>Comeback Mode</span><b>{sum.comeback}</b></div>
              </div>
              <div className="fbtn">
                <StartButton onClick={onStart} />
                <button type="button" className="btn lg" onClick={restart}>Try again</button>
              </div>
            </div>
          )}
        </div>
        <div className="side r" aria-live="polite">
          {lit.comeback && <div className="lgi lit"><span className="li"><Icon d={LOOP} /></span><div><b>Comeback Mode</b><span>Drop one mark, and gradefarm gives you three questions to make up for it. Your chance for an Academic Comeback.</span></div></div>}
          {lit.difficulty && <div className="lgi lit"><span className="li"><Icon d={STAR} /></span><div><b>Adaptive Difficulty</b><span>You got this one right. gradefarm has logged this and you will be shown more difficult questions to push you further.</span></div></div>}
        </div>
        </div>
        {playing && <p className="skip"><button type="button" className="wk" onClick={skip}>Skip to the end</button></p>}
        {onNext && (
          <p className="tonext">
            <a className="btn lg try nextarrow" href="#anywhere" onClick={onNext} aria-label="Next"><ArrowDown size={22} strokeWidth={2.6} aria-hidden="true" /></a>
          </p>
        )}
      </div>
    </section>
  )
}
