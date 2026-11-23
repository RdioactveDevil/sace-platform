import { useEffect, useRef, useState } from 'react'
import { Clock } from 'lucide-react'
import { formatClock } from '../lib/examSitting'
import { timerAnnouncement } from '../lib/timedDiagnostic'
import { C } from './publicUi'

const HIDDEN = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }

/**
 * The timed diagnostic's bar, sticky at the top of both parts: where the
 * student is on the left, the time left on the right. In the last five
 * minutes it turns the danger colour and tells screen readers once, and
 * again ("Time's up") at 0:00.
 */
export default function TimerBar({ left, warning, part, progress }) {
  const [announcement, setAnnouncement] = useState('')
  // Each said once: the warning (minutes left) and, at 0:00, "Time's up".
  const said = useRef({ warning: false, up: false })
  useEffect(() => {
    if (left <= 0) {
      if (said.current.up) return
      said.current = { warning: true, up: true }
      setAnnouncement(timerAnnouncement(left))
      return
    }
    if (!warning || said.current.warning) return
    said.current.warning = true
    setAnnouncement(timerAnnouncement(left))
  }, [warning, left])

  return (
    <div style={{ position: 'sticky', top: 0, zIndex: 20, background: C.bg, padding: '8px 0' }}>
      <style>{`
        .dg-timer { transition: color 0.3s, border-color 0.3s, background-color 0.3s; }
        @media (prefers-reduced-motion: reduce) { .dg-timer { transition: none; } }
      `}</style>
      <div className="dg-timer" style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 12,
        border: `1px solid ${warning ? 'var(--t-danger)' : C.border}`,
        background: warning ? 'var(--t-dangerBg)' : C.card,
        boxShadow: '0 4px 14px rgba(var(--ink-rgb), 0.06)',
      }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span style={{ fontSize: 13.5, fontWeight: 800, color: C.text }}>{part}</span>
          <span style={{ fontSize: 12.5, color: C.muted }}>{progress}</span>
        </div>
        <div className="dg-timer" role="timer" aria-label="Time left" style={{
          display: 'inline-flex', alignItems: 'center', gap: 7, flexShrink: 0,
          fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums',
          color: warning ? 'var(--t-danger)' : C.text,
        }}>
          <Clock size={18} strokeWidth={2.4} aria-hidden="true" />
          {formatClock(left)}
        </div>
      </div>
      <div aria-live="polite" style={HIDDEN}>{announcement}</div>
    </div>
  )
}
