import { useEffect, useRef } from 'react'

const COLOURS = ['#f1be43', '#5bb98c', '#7fa7d9', '#e5736f', '#a89ad9', '#ecc96e']

/**
 * A short burst of confetti over the page, for finishing a quiz or lesson
 * well. Draws on a canvas that ignores clicks and removes itself after about
 * two and a half seconds. Skipped for people who ask for reduced motion.
 * Change `burst` (e.g. a counter) to fire it again.
 */
export default function Celebration({ burst = 1 }) {
  const ref = useRef(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas || !burst) return undefined
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined
    const c = canvas.getContext('2d')
    if (!c) return undefined

    const dpr = window.devicePixelRatio || 1
    const resize = () => {
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
      c.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const w = window.innerWidth
    const h = window.innerHeight
    // Two bursts from the lower corners, angled in towards the middle.
    const pieces = Array.from({ length: 140 }, (_, i) => {
      const left = i % 2 === 0
      const angle = (left ? -60 : -120) * (Math.PI / 180) + (Math.random() - 0.5) * 0.9
      const speed = 9 + Math.random() * 9
      return {
        x: left ? w * 0.08 : w * 0.92, y: h * 0.85,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        size: 5 + Math.random() * 6, rot: Math.random() * Math.PI, spin: (Math.random() - 0.5) * 0.3,
        colour: COLOURS[i % COLOURS.length],
      }
    })

    const DURATION = 2600
    const startAt = performance.now()
    let frame = 0
    const tick = (now) => {
      const elapsed = now - startAt
      c.clearRect(0, 0, w, h)
      c.globalAlpha = Math.max(0, 1 - Math.max(0, elapsed - DURATION * 0.6) / (DURATION * 0.4))
      for (const p of pieces) {
        p.vy += 0.32
        p.vx *= 0.99
        p.x += p.vx
        p.y += p.vy
        p.rot += p.spin
        c.save()
        c.translate(p.x, p.y)
        c.rotate(p.rot)
        c.fillStyle = p.colour
        c.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
        c.restore()
      }
      if (elapsed < DURATION) frame = requestAnimationFrame(tick)
      else c.clearRect(0, 0, w, h)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
    }
  }, [burst])

  return <canvas ref={ref} aria-hidden="true" style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: 9998 }} />
}
