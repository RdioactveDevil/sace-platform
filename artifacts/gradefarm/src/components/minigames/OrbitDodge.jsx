import { useEffect, useRef, useState } from 'react'
import { THEMES } from '../../lib/theme'

const SIZE = 360
const ORBITS = [70, 125]

/**
 * Orbit Dodge: an electron circles the nucleus on one of two orbits; debris
 * flies across. Tap, click or press Space to switch orbit. Reports how many
 * seconds the round lasted (higher is better). Starts again on a hit.
 */
export default function OrbitDodge({ theme = 'dark', onResult }) {
  const t = THEMES[theme]
  const canvasRef = useRef(null)
  const orbitRef = useRef(1)
  const [round, setRound] = useState(0)
  const [over, setOver] = useState(null) // seconds lasted, once hit

  const toggle = () => {
    if (over != null) { setOver(null); setRound(r => r + 1); return }
    orbitRef.current = orbitRef.current ? 0 : 1
  }

  useEffect(() => {
    const canvas = canvasRef.current
    const c = canvas?.getContext('2d')
    if (!c) return undefined
    const dpr = window.devicePixelRatio || 1
    canvas.width = SIZE * dpr
    canvas.height = SIZE * dpr
    c.setTransform(dpr, 0, 0, dpr, 0, 0)
    orbitRef.current = 1

    const mid = SIZE / 2
    let angle = 0
    let radius = ORBITS[1]
    let debris = []
    let spawnIn = 1.2
    let last = performance.now()
    const start = last
    let raf = 0
    let alive = true

    const spawn = (elapsed) => {
      // From a random edge point, aimed near the middle so it crosses the orbits.
      const a = Math.random() * Math.PI * 2
      const x = mid + Math.cos(a) * (SIZE / 2 + 20)
      const y = mid + Math.sin(a) * (SIZE / 2 + 20)
      const aim = Math.random() * Math.PI * 2
      const tx = mid + Math.cos(aim) * (40 + Math.random() * 90)
      const ty = mid + Math.sin(aim) * (40 + Math.random() * 90)
      const speed = 55 + Math.min(110, elapsed * 3) + Math.random() * 30
      const len = Math.hypot(tx - x, ty - y)
      debris.push({ x, y, vx: ((tx - x) / len) * speed, vy: ((ty - y) / len) * speed, r: 5 + Math.random() * 4 })
    }

    const frame = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const elapsed = (now - start) / 1000
      angle += dt * (1.6 + Math.min(1.2, elapsed * 0.03))
      const target = ORBITS[orbitRef.current]
      radius += (target - radius) * Math.min(1, dt * 14)
      spawnIn -= dt
      if (spawnIn <= 0) { spawn(elapsed); spawnIn = Math.max(0.4, 1.3 - elapsed * 0.012) }
      debris = debris.filter(d => d.x > -40 && d.x < SIZE + 40 && d.y > -40 && d.y < SIZE + 40)
      for (const d of debris) { d.x += d.vx * dt; d.y += d.vy * dt }

      const ex = mid + Math.cos(angle) * radius
      const ey = mid + Math.sin(angle) * radius
      const hit = debris.some(d => Math.hypot(d.x - ex, d.y - ey) < d.r + 5) || Math.hypot(ex - mid, ey - mid) < 22

      c.clearRect(0, 0, SIZE, SIZE)
      c.fillStyle = t.bgNav
      c.fillRect(0, 0, SIZE, SIZE)
      c.setLineDash([5, 7])
      c.strokeStyle = '#52525b'
      c.lineWidth = 2
      for (const r of ORBITS) { c.beginPath(); c.arc(mid, mid, r, 0, Math.PI * 2); c.stroke() }
      c.setLineDash([])
      c.fillStyle = t.accent
      c.beginPath(); c.arc(mid, mid, 18, 0, Math.PI * 2); c.fill()
      c.fillStyle = t.danger
      for (const d of debris) {
        c.save(); c.translate(d.x, d.y); c.rotate(d.x * 0.05)
        c.fillRect(-d.r, -d.r, d.r * 2, d.r * 2)
        c.restore()
      }
      c.fillStyle = t.blue
      c.beginPath(); c.arc(ex, ey, 8, 0, Math.PI * 2); c.fill()
      c.fillStyle = '#ececef' // the board is dark in both themes
      c.font = "700 16px 'JetBrains Mono', monospace"
      c.fillText(`${elapsed.toFixed(1)} s`, 12, 24)

      if (hit) {
        alive = false
        const lasted = Math.round(elapsed * 10) / 10
        setOver(lasted)
        onResult?.(lasted)
        return
      }
      if (alive) raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    canvas.focus()
    return () => { alive = false; cancelAnimationFrame(raf) }
  }, [round]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <p style={{ margin: 0, fontSize: 14, color: t.textSub }}>Tap the board or press Space to switch orbit. Dodge the debris.</p>
      <div style={{ position: 'relative', width: SIZE, maxWidth: '100%' }}>
        <canvas ref={canvasRef} tabIndex={0} role="img" aria-label="Orbit Dodge board. Press Space to switch orbit."
          onPointerDown={(e) => { e.preventDefault(); toggle() }}
          onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); toggle() } }}
          style={{ width: SIZE, height: SIZE, maxWidth: '100%', borderRadius: 14, display: 'block', touchAction: 'none', cursor: 'pointer', outlineColor: t.accent }} />
        {over != null && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, background: 'rgba(0,0,0,0.55)', borderRadius: 14, pointerEvents: 'none' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#fff' }}>Hit! {over} s</div>
            <div style={{ fontSize: 14, color: '#e4e4e7' }}>Tap or press Space to go again</div>
          </div>
        )}
      </div>
    </div>
  )
}

export const ORBIT_DODGE = {
  id: 'orbit-dodge',
  name: 'Orbit Dodge',
  blurb: 'Steer your electron round the nucleus and dodge the debris.',
  lowerIsBetter: false,
  format: (v) => `${v} s`,
  Component: OrbitDodge,
}
