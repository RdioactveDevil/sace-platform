import { useEffect, useState } from 'react'
import { Lock, Check, X } from 'lucide-react'
import { scramble } from '../lib/examPreview'
import { minutesUntilReset, formatWait } from '../lib/freeLimit'

const FONT_B = "'Plus Jakarta Sans', sans-serif"

/**
 * The free subject after today's free questions: the next question waiting,
 * blurred (scrambled text, so there's nothing real to un-blur), this
 * session's answers, when the free questions come back, and Get unlimited.
 */
export default function FreeLimitScreen({ t, limit, nextQ, results = [], onUpgrade, onHome }) {
  const [wait, setWait] = useState(() => minutesUntilReset())
  useEffect(() => {
    const id = setInterval(() => setWait(minutesUntilReset()), 30000)
    return () => clearInterval(id)
  }, [])

  const right = results.filter(r => r.correct).length
  const topic = nextQ?.subtopic || nextQ?.topic || ''
  const seed = nextQ?.id || 'next'
  const stem = scramble(String(nextQ?.question || 'What is the value of the expression when the reaction reaches equilibrium?').slice(0, 220), seed)
  const options = Array.isArray(nextQ?.options) && nextQ.options.length
    ? nextQ.options.slice(0, 4).map((o, i) => scramble(String(o).slice(0, 60) || 'answer', `${seed}:${i}`))
    : null

  return (
    <div style={{ minHeight: '100%', background: t.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 20px', fontFamily: FONT_B, boxSizing: 'border-box' }}>
      <div style={{ width: '100%', maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 13, color: t.textMuted }}>
          <span style={{ fontWeight: 800, color: t.text }}>Question {limit + 1} is ready</span>
          {topic && <span style={{ padding: '3px 10px', borderRadius: 999, background: 'color-mix(in srgb, var(--t-accent) 16%, transparent)', color: t.goldText, fontSize: 12, fontWeight: 800 }}>{topic}</span>}
        </div>

        <div style={{ position: 'relative' }}>
          {/* The next question, unreadable. */}
          <div aria-hidden="true" style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 18, padding: '26px 26px 30px', minHeight: 480, boxSizing: 'border-box', filter: 'blur(5px)', userSelect: 'none', pointerEvents: 'none' }}>
            <div style={{ fontSize: 17, lineHeight: 1.6, color: t.text, marginBottom: 22 }}>{stem}</div>
            {options ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {options.map((o, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px', borderRadius: 12, border: `1px solid ${t.border}`, fontSize: 15, color: t.text }}>
                    <span style={{ width: 26, height: 26, borderRadius: 8, border: `1px solid ${t.border}`, display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800 }}>{'ABCD'[i]}</span>{o}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ height: 150, borderRadius: 12, border: `1px solid ${t.border}`, background: t.bgSubtle }} />
            )}
          </div>

          {/* The lock, over it. */}
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div role="status" style={{ width: '100%', maxWidth: 420, textAlign: 'center', background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 20, padding: '28px 26px', boxShadow: '0 16px 50px rgba(0,0,0,0.18)', boxSizing: 'border-box' }}>
              <div style={{ width: 48, height: 48, borderRadius: 14, margin: '0 auto 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--t-accent)', color: 'var(--t-onAccent)' }}>
                <Lock size={22} aria-hidden="true" />
              </div>
              <div style={{ fontSize: 19, fontWeight: 800, color: t.text, marginBottom: 6, lineHeight: 1.3 }}>That&rsquo;s your {limit} free questions for today</div>

              {results.length > 0 && (
                <div style={{ margin: '10px 0 12px' }}>
                  <div aria-hidden="true" style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                    {results.map((r, i) => (
                      <span key={i} style={{ width: 18, height: 18, borderRadius: 6, display: 'grid', placeItems: 'center', background: r.correct ? 'color-mix(in srgb, var(--t-success) 20%, transparent)' : 'color-mix(in srgb, var(--t-danger) 16%, transparent)', color: r.correct ? t.success : t.danger }}>
                        {r.correct ? <Check size={12} strokeWidth={3} /> : <X size={12} strokeWidth={3} />}
                      </span>
                    ))}
                  </div>
                  <div style={{ fontSize: 13, color: t.textSub }}><b style={{ color: t.text }}>{right} of {results.length}</b> right this session</div>
                </div>
              )}

              <p style={{ fontSize: 13.5, color: t.textMuted, lineHeight: 1.6, margin: '0 0 18px' }}>
                {limit} more in <b style={{ color: t.text }}>{formatWait(wait)}</b>, or keep going now with unlimited questions, Exam Mode and the exam builder.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button type="button" onClick={onUpgrade}
                  style={{ height: 44, borderRadius: 12, border: 'none', background: 'var(--t-accent)', color: 'var(--t-onAccent)', fontFamily: FONT_B, fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>
                  Unlock question {limit + 1}
                </button>
                <button type="button" onClick={onHome}
                  style={{ height: 40, borderRadius: 12, border: `1px solid ${t.border}`, background: 'transparent', color: t.textMuted, fontFamily: FONT_B, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  Back to Practice
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
