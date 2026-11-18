import { useEffect, useMemo, useState } from 'react'
import { getAnswersSince } from '../lib/db'
import { dayStart, markedSheet, sheetCopy, minutesUntilReset, formatWait } from '../lib/freeLimit'

const FONT_B = "'Plus Jakarta Sans', sans-serif"
const HAND = "'Caveat', 'Segoe Print', 'Comic Sans MS', cursive"
const PEN = '#c2362d' // the red pen, on white paper in every theme
const INK = '#2a2118'

/**
 * The free subject after today's free questions: today's answers marked
 * like a test (red-pen ticks, the score circled, a note), and beside it the
 * questions that got away, with Retry (a plan) or come back at midnight.
 * The words fit how many got away (lib/freeLimit.js sheetCopy).
 */
export default function FreeLimitScreen({ t, limit, userId, questions = [], results = [], nextQ, onUpgrade, onRetry = null, onHome, loadAnswers = getAnswersSince }) {
  const byId = useMemo(() => new Map((questions || []).map(q => [q.id, q])), [questions])
  // Today's answers from the log; this session's until they arrive (or if they can't be read).
  const [answers, setAnswers] = useState(null)
  useEffect(() => {
    if (!userId) return
    let alive = true
    loadAnswers(userId, dayStart().toISOString()).then(rows => { if (alive && rows?.length) setAnswers(rows) }).catch(() => {})
    return () => { alive = false }
  }, [userId]) // eslint-disable-line react-hooks/exhaustive-deps
  const sheet = useMemo(() => markedSheet(answers || results, byId, limit), [answers, results, byId, limit])
  const copy = sheetCopy(sheet.misses, nextQ?.subtopic || nextQ?.topic || '', limit)

  const [wait, setWait] = useState(() => minutesUntilReset())
  useEffect(() => {
    const id = setInterval(() => setWait(minutesUntilReset()), 30000)
    return () => clearInterval(id)
  }, [])

  const today = new Intl.DateTimeFormat('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Australia/Adelaide' }).format(new Date())
  const rows = Math.ceil(sheet.items.length / 2)
  const shown = sheet.misses.slice(0, 3)
  const more = sheet.misses.length - shown.length

  return (
    <div style={{ height: '100%', minHeight: '100%', overflowY: 'auto', background: t.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: '40px 56px', padding: '40px 20px', boxSizing: 'border-box', fontFamily: FONT_B, color: t.text }}>
      <style>{"@import url('https://fonts.googleapis.com/css2?family=Caveat:wght@600;700&display=swap');"}</style>

      {sheet.items.length > 0 && (
        <figure aria-label={`Today's practice: ${sheet.right} of ${sheet.items.length} right`} style={{ margin: 0, width: 'min(400px, 100%)', minHeight: 470, background: '#fff', color: INK, boxShadow: '0 2px 0 rgba(0,0,0,0.06), 0 18px 40px rgba(40,25,5,0.14)', padding: '30px 32px 26px', boxSizing: 'border-box', position: 'relative', transform: 'rotate(-1.2deg)', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#6f6455', borderBottom: '1px solid #e8e0d2', paddingBottom: 10 }}>
            <b style={{ color: INK }}>Today&rsquo;s practice</b><span>{today}</span>
          </div>
          <div aria-hidden="true" style={{ alignSelf: 'flex-end', position: 'relative', width: 150, height: 92, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: -4 }}>
            <svg width="150" height="92" viewBox="0 0 150 92" style={{ position: 'absolute', inset: 0 }}>
              <path d="M18 50 C 10 16, 120 4, 136 38 C 150 74, 40 94, 16 64 C 8 54, 24 32, 44 26" fill="none" stroke={PEN} strokeWidth="3" strokeLinecap="round" />
            </svg>
            <span style={{ fontFamily: HAND, fontSize: 50, fontWeight: 700, color: PEN, transform: 'rotate(-6deg)', whiteSpace: 'nowrap' }}>{sheet.right}/{sheet.items.length}</span>
          </div>
          <ol aria-hidden="true" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gridTemplateRows: `repeat(${rows}, auto)`, gridAutoFlow: 'column', columnGap: 18, rowGap: 7, fontSize: 13, color: '#4b4033' }}>
            {sheet.items.map(it => (
              <li key={it.n} style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.n}. {it.label}</span>
                <span style={{ fontFamily: HAND, fontSize: 22, lineHeight: '16px', color: PEN, width: 14, textAlign: 'center' }}>{it.correct ? '✓' : '✗'}</span>
              </li>
            ))}
          </ol>
          <div aria-hidden="true" style={{ marginTop: 'auto', paddingTop: 12, fontFamily: HAND, fontSize: 25, color: PEN, lineHeight: 1.1, transform: 'rotate(-2deg)' }}>{sheet.note}</div>
        </figure>
      )}

      <section aria-labelledby="fl-title" style={{ width: 'min(380px, 100%)', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: t.textMuted }}>That&rsquo;s your {limit} for today</div>
        <h1 id="fl-title" style={{ margin: 0, fontSize: 32, lineHeight: 1.15, fontWeight: 800, letterSpacing: '-0.01em' }}>{copy.title[0]}<br />{copy.title[1]}</h1>
        {copy.lead && <div style={{ fontSize: 14.5, color: t.textSub }}>{copy.lead}</div>}
        {shown.length > 0 && (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, borderTop: `1px solid ${t.border}` }}>
            {shown.map(m => (
              <li key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, padding: '12px 0', borderBottom: `1px solid ${t.border}`, fontSize: 14 }}>
                <span style={{ minWidth: 0 }}><b>Q{m.n}</b> {m.label}</span>
                <span style={{ fontSize: 12.5, color: t.textMuted, whiteSpace: 'nowrap' }}>{m.note}</span>
              </li>
            ))}
            {more > 0 && <li style={{ padding: '10px 0', fontSize: 13, color: t.textMuted, borderBottom: `1px solid ${t.border}` }}>+ {more} more</li>}
          </ul>
        )}
        <button type="button" onClick={() => {
          // The upgrade pop-up; once they're in, straight into the questions they missed.
          const ids = sheet.misses.map(m => m.id)
          const n = ids.length
          onUpgrade?.(n && onRetry
            ? { doneLabel: n === 1 ? 'Retry it now' : `Retry my ${n} mistakes`, onDone: () => onRetry(ids) }
            : { doneLabel: 'Keep going' })
        }}
          style={{ height: 48, borderRadius: 12, border: 'none', background: t.text, color: t.bg, fontFamily: FONT_B, fontSize: 15, fontWeight: 800, cursor: 'pointer' }}>
          {copy.cta}
        </button>
        <div style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.55 }}>
          {sheet.misses.length ? 'Retrying needs unlimited questions. ' : 'Keeping going needs unlimited questions. '}
          Or come back at midnight, in {formatWait(wait)}, for {limit} more.{' '}
          <button type="button" onClick={onHome} style={{ border: 'none', background: 'none', padding: 0, color: t.text, fontFamily: FONT_B, fontSize: 13, fontWeight: 700, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }}>Back to Practice</button>
        </div>
      </section>
    </div>
  )
}
