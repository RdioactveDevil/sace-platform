import { useEffect, useRef, useState } from 'react'
import { THEMES } from '../../lib/theme'

const W = 320
const H = 420
const BLOCK_H = 22

/** Where a dropped block lands on the one below: the overlap, or null when it misses. */
export function landBlock(below, moving) {
  const left = Math.max(below.x, moving.x)
  const right = Math.min(below.x + below.w, moving.x + moving.w)
  return right - left > 0 ? { x: left, w: right - left } : null
}

/**
 * Stack Drop: a block slides back and forth; tap or press Space to drop it.
 * Whatever hangs over the block below is cut off, so the tower narrows. A
 * miss ends the round; reports the blocks stacked (higher is better).
 */
export default function StackDrop({ theme = 'dark', onResult }) {
  const t = THEMES[theme]
  const canvasRef = useRef(null)
  const stateRef = useRef(null)
  const [score, setScore] = useState(0)
  const [over, setOver] = useState(false)

  const reset = () => {
    stateRef.current = { stack: [{ x: W / 2 - 70, w: 140 }], moving: { x: 0, w: 140, dir: 1 }, speed: 150 }
    setScore(0)
    setOver(false)
  }
  if (!stateRef.current) reset()

  const drop = () => {
    if (over) { reset(); return }
    const s = stateRef.current
    const below = s.stack[s.stack.length - 1]
    const landed = landBlock(below, s.moving)
    if (!landed) {
      setOver(true)
      onResult?.(s.stack.length - 1)
      return
    }
    s.stack.push(landed)
    s.moving = { x: s.stack.length % 2 ? 0 : W - landed.w, w: landed.w, dir: s.stack.length % 2 ? 1 : -1 }
    s.speed = Math.min(420, s.speed + 12)
    setScore(s.stack.length - 1)
  }

  useEffect(() => {
    const canvas = canvasRef.current
    const c = canvas?.getContext('2d')
    if (!c) return undefined
    const dpr = window.devicePixelRatio || 1
    canvas.width = W * dpr
    canvas.height = H * dpr
    c.setTransform(dpr, 0, 0, dpr, 0, 0)
    let last = performance.now()
    let raf = 0
    const colours = [t.accent, t.blue, t.success, t.purple]
    const frame = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const s = stateRef.current
      if (!over) {
        s.moving.x += s.moving.dir * s.speed * dt
        if (s.moving.x <= 0) { s.moving.x = 0; s.moving.dir = 1 }
        if (s.moving.x + s.moving.w >= W) { s.moving.x = W - s.moving.w; s.moving.dir = -1 }
      }
      c.fillStyle = t.bgNav
      c.fillRect(0, 0, W, H)
      // Keep the top of the tower in view.
      const shift = Math.max(0, (s.stack.length + 2) * BLOCK_H - (H - 40))
      s.stack.forEach((b, i) => {
        c.fillStyle = colours[i % colours.length]
        c.fillRect(b.x, H - (i + 1) * BLOCK_H + shift, b.w, BLOCK_H - 2)
      })
      if (!over) {
        c.fillStyle = colours[s.stack.length % colours.length]
        c.fillRect(s.moving.x, H - (s.stack.length + 1) * BLOCK_H + shift, s.moving.w, BLOCK_H - 2)
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    canvas.focus()
    return () => cancelAnimationFrame(raf)
  }, [over, theme]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <p style={{ margin: 0, fontSize: 14, color: t.textSub }}>Tap the board or press Space to drop the block. Stack it high.</p>
      <div style={{ position: 'relative', width: W, maxWidth: '100%' }}>
        <canvas ref={canvasRef} tabIndex={0} role="img" aria-label={`Stack Drop board, ${score} blocks stacked. Press Space to drop.`}
          onPointerDown={(e) => { e.preventDefault(); drop() }}
          onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); drop() } }}
          style={{ width: W, height: H, maxWidth: '100%', borderRadius: 14, display: 'block', touchAction: 'none', cursor: 'pointer', outlineColor: t.accent }} />
        {over && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'rgba(0,0,0,0.55)', borderRadius: 14, pointerEvents: 'none' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#fff' }}>{score} stacked</div>
            <div style={{ fontSize: 14, color: '#e4e4e7' }}>Tap or press Space to go again</div>
          </div>
        )}
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: t.text }}>{score} blocks</div>
    </div>
  )
}

export const STACK_DROP = {
  id: 'stack-drop',
  name: 'Stack Drop',
  blurb: 'Drop sliding blocks to build the tallest tower you can.',
  lowerIsBetter: false,
  format: (v) => `${v} blocks`,
  Component: StackDrop,
}
