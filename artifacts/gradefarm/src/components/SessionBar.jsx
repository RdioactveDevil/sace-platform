import { useEffect, useState } from 'react'
import { Gamepad2 } from 'lucide-react'
import { THEMES } from '../lib/theme'
import { BREAK_EVERY } from '../lib/engagement'

/**
 * The study session's progress: answers so far, time since it started, and
 * how far to the next break (a mini game every BREAK_EVERY answers). Keeps its
 * own clock so the quiz around it doesn't re-render every second.
 */
export default function SessionBar({ theme = 'dark', answered, startedAt, breakAt, compact = false }) {
  const t = THEMES[theme]
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  const secs = Math.max(0, Math.floor((now - (startedAt || now)) / 1000))
  const time = secs >= 3600
    ? `${Math.floor(secs / 3600)} h ${Math.floor((secs % 3600) / 60)} min`
    : `${Math.floor(secs / 60)} min ${String(secs % 60).padStart(2, '0')} s`
  const from = breakAt - BREAK_EVERY
  const pct = Math.min(100, Math.max(0, ((answered - from) / BREAK_EVERY) * 100))
  const toGo = Math.max(0, breakAt - answered)

  return (
    <div role="group" aria-label="Session progress" style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', fontSize: 12.5 }}>
        <span style={{ fontWeight: 700, color: t.text }}>
          {answered} answered <span style={{ color: t.textMuted, fontWeight: 500 }}>· {time}</span>
        </span>
        {!compact && (
          <span style={{ color: t.textMuted }}>
            {toGo === 0 ? 'Break after this one' : `${toGo} more until your break`}
          </span>
        )}
      </div>
      <div style={{ position: 'relative', height: 10, borderRadius: 999, background: t.bgHover, marginRight: 10 }}
        role="progressbar" aria-valuemin={from} aria-valuemax={breakAt} aria-valuenow={Math.min(answered, breakAt)} aria-valuetext={`${answered} answered, break at ${breakAt}`}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, borderRadius: 999, background: t.accent, transition: 'width 0.35s ease' }} />
        {[1, 2].map(i => (
          <div key={i} aria-hidden="true" style={{ position: 'absolute', left: `${(i / 3) * 100}%`, top: 0, bottom: 0, width: 2, background: t.bg }} />
        ))}
        <div aria-hidden="true" title={`Break at ${breakAt}`}
          style={{ position: 'absolute', right: -12, top: -7, width: 24, height: 24, borderRadius: 999, background: t.bgCard, border: `2px solid ${t.purple}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Gamepad2 size={13} color={t.purple} />
        </div>
      </div>
    </div>
  )
}
