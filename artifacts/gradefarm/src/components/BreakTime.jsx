import { useEffect, useMemo, useRef, useState } from 'react'
import { Gamepad2 } from 'lucide-react'
import { THEMES } from '../lib/theme'
import { BREAK_SECONDS, pickBreakGame } from '../lib/engagement'
import { BREAK_GAMES, readBest, readLastGame, saveBest, saveLastGame } from './minigames'

const FONT_B = "'Plus Jakarta Sans', sans-serif"
const PURPLE_INK = '#18181b'

/**
 * A break after every BREAK_EVERY answers: the session so far and a mini game
 * picked at random. "Play" runs it for BREAK_SECONDS, then it hands back to
 * the quiz on its own; "Skip" goes straight back. Games earn no XP.
 * `stats`: { answered, right, minutes, xp } for the session so far.
 */
export default function BreakTime({ theme = 'dark', stats, subject, onDone }) {
  const t = THEMES[theme]
  const game = useMemo(() => pickBreakGame(BREAK_GAMES, readLastGame()), [])
  const [phase, setPhase] = useState('offer') // offer | play
  const [left, setLeft] = useState(BREAK_SECONDS)
  const [best, setBest] = useState(() => (game ? readBest(game.id) : null))
  const [newBest, setNewBest] = useState(false)
  const dialogRef = useRef(null)

  useEffect(() => { dialogRef.current?.focus() }, [phase])

  useEffect(() => {
    if (phase !== 'play') return undefined
    if (left <= 0) { onDone(); return undefined }
    const id = setTimeout(() => setLeft(s => s - 1), 1000)
    return () => clearTimeout(id)
  }, [phase, left, onDone])

  if (!game) return null
  const Game = game.Component
  const play = () => { saveLastGame(game.id); setPhase('play') }
  const onResult = (score) => {
    if (saveBest(game, score)) { setBest(score); setNewBest(true) }
  }
  const btn = (primary) => ({
    minHeight: 46, padding: '0 22px', borderRadius: 12, fontFamily: FONT_B, fontSize: 15, fontWeight: 800, cursor: 'pointer',
    ...(primary ? { border: 'none', background: t.purple, color: PURPLE_INK } : { border: `1px solid ${t.borderMid}`, background: 'transparent', color: t.textSub }),
  })
  const stat = (label, value, color) => (
    <div style={{ background: t.bgHover, borderRadius: 12, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 12, color: t.textMuted, fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 20, fontWeight: 800, color: color || t.text }}>{value}</span>
    </div>
  )

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, overflowY: 'auto', fontFamily: FONT_B, color: t.text }}>
      {phase === 'offer' ? (
        <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="gf-break-title"
          style={{ width: '100%', maxWidth: 640, background: t.bgCard, border: `1px solid ${t.borderMid}`, borderRadius: 20, padding: 'clamp(20px, 4vw, 32px)', display: 'flex', flexDirection: 'column', gap: 20, outline: 'none' }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: t.purple, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Break time</div>
            <h2 id="gf-break-title" style={{ margin: '6px 0 0', fontSize: 26, lineHeight: 1.25, fontWeight: 800 }}>
              {stats.answered} questions done. Your brain's earned two minutes off.
            </h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
            {stat('Right', `${stats.right} / ${stats.answered}`)}
            {stat('Time', `${stats.minutes} min`)}
            {stat('XP so far', `${stats.xp >= 0 ? '+' : ''}${stats.xp}`, t.goldText)}
          </div>
          <div style={{ borderRadius: 16, border: `2px solid ${t.purple}`, background: t.purpleBg, padding: 18, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <div aria-hidden="true" style={{ width: 64, height: 64, borderRadius: 14, background: t.bgNav, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Gamepad2 size={30} color={t.purple} />
            </div>
            <div style={{ flex: '1 1 240px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: t.purple, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Today's game, picked at random</span>
              <span style={{ fontSize: 21, fontWeight: 800 }}>{game.name}</span>
              <span style={{ fontSize: 14, color: t.textSub, lineHeight: 1.5 }}>{game.blurb}</span>
              <span style={{ fontSize: 13, color: t.textMuted }}>{BREAK_SECONDS / 60} minutes{best != null ? ` · your best: ${game.format(best)}` : ''}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button type="button" onClick={onDone} style={btn(false)}>Skip, keep going</button>
            <button type="button" onClick={play} style={btn(true)}>Play for {BREAK_SECONDS / 60} minutes</button>
          </div>
          <p style={{ margin: 0, fontSize: 12.5, color: t.textMuted, textAlign: 'right' }}>
            The game ends itself and drops you back at question {stats.answered + 1}. Games don't earn XP.
          </p>
        </section>
      ) : (
        <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`${game.name}, break game`}
          style={{ width: '100%', maxWidth: 680, background: t.bgCard, border: `1px solid ${t.borderMid}`, borderRadius: 20, overflow: 'hidden', outline: 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '14px 20px', background: t.bgNav, borderBottom: `1px solid ${t.border}` }}>
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 800, color: t.purple, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Break · mini game</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: '#ececef' }}>{game.name}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <span aria-live="off" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 18, fontWeight: 700, color: t.purple }}>
                {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
              </span>
              <button type="button" onClick={onDone} style={{ minHeight: 40, padding: '0 14px', borderRadius: 10, border: '1px solid #45454d', background: 'transparent', color: '#d4d4d8', fontFamily: FONT_B, fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>
                Back to questions
              </button>
            </div>
          </div>
          <div aria-hidden="true" style={{ height: 5, background: t.bgHover }}>
            <div style={{ width: `${(1 - left / BREAK_SECONDS) * 100}%`, height: 5, background: t.purple, transition: 'width 1s linear' }} />
          </div>
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <Game theme={theme} subject={subject} onResult={onResult} />
            <div role="status" style={{ fontSize: 13, color: newBest ? t.goldText : t.textMuted, fontWeight: newBest ? 700 : 500 }}>
              {newBest ? `New best: ${game.format(best)}` : best != null ? `Your best: ${game.format(best)}` : 'No XP here, just a breather.'}
            </div>
          </div>
        </section>
      )}
    </div>
  )
}

