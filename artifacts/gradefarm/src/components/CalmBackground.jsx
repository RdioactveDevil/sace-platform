import { useEffect, useRef } from 'react'
import { THEMES } from '../lib/theme'

// A quiet moving background: two soft gold glows drifting in opposite
// corners, faint gold waves rising and falling across the lower half, and a
// fine grain over it all. It fills the window behind the page (fixed, under
// everything), runs at about 30 frames a second, pauses while the tab is
// hidden, and draws one still frame for people who prefer reduced motion.

const rgba = (hex, a) => {
  const n = parseInt(hex.replace('#', ''), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

function makeGrain() {
  const size = 160
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')
  const img = g.createImageData(size, size)
  let seed = 5
  for (let i = 0; i < img.data.length; i += 4) {
    seed = (seed * 16807) % 2147483647
    const v = (seed / 2147483647) * 255
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v
    img.data[i + 3] = 14
  }
  g.putImageData(img, 0, 0)
  return c
}

// [height as a share of the page, amplitude in px, wave frequency, phase]
const WAVES = [[0.72, 34, 0.0042, 0], [0.84, 26, 0.0055, 2.1], [0.58, 22, 0.0035, 4.2]]
// Each wave is three strokes, wide and faint to narrow, so it reads as a soft band.
// With matchLight, dark mode keeps the light mode's glows but draws the waves at WAVE_DARK of their
// strength. The same gold band shifts a dark page's lightness about three times as much as a light
// page's (L* 13.9 against 4.3), so at 0.35 the waves are as blended in, and as calm to watch, as in
// light mode (L* about 4.2). Speed is the same in both.
const WAVE_DARK = 0.35
const STROKES = [[150, 0.035], [80, 0.04], [26, 0.05]]

export function drawCalm(ctx, w, h, t, { gold, dark, grain, refH, matchLight = false }) {
  ctx.clearRect(0, 0, w, h)
  // Glows and waves are placed against refH when given (a contained background
  // keeps its layout when its box grows), else against the canvas height.
  const H = refH || h
  // Dark mode normally draws the glows and waves fainter; matchLight keeps the light-mode strengths.
  const faint = dark && !matchLight
  const a = t / 5200
  const R = Math.max(w, H)
  const spots = [
    [w * (0.82 + 0.1 * Math.sin(a)), H * (0.12 + 0.12 * Math.cos(a * 1.3)), R * 0.55, faint ? 0.16 : 0.3],
    [w * (0.12 + 0.09 * Math.cos(a * 0.8)), H * (0.92 + 0.07 * Math.sin(a * 1.1)), R * 0.45, faint ? 0.1 : 0.2],
  ]
  for (const [x, y, r, al] of spots) {
    const gr = ctx.createRadialGradient(x, y, 0, x, y, r)
    gr.addColorStop(0, rgba(gold, al))
    gr.addColorStop(1, rgba(gold, 0))
    ctx.fillStyle = gr
    ctx.fillRect(0, 0, w, h)
  }
  ctx.lineCap = 'round'
  const sp = t / 2600
  for (const [yb, amp, f, ph] of WAVES) {
    const y0 = H * yb
    for (const [lw, al] of STROKES) {
      ctx.strokeStyle = rgba(gold, al * (faint ? 0.8 : dark ? WAVE_DARK : 1))
      ctx.lineWidth = lw
      ctx.beginPath()
      for (let x = -40; x <= w + 40; x += 12) {
        const y = y0 + amp * Math.sin(x * f + sp + ph) + amp * 0.4 * Math.sin(x * f * 2.3 - sp * 0.7 + ph)
        if (x === -40) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
  }
  if (grain) {
    ctx.fillStyle = ctx.createPattern(grain, 'repeat')
    ctx.fillRect(0, 0, w, h)
  }
}

/**
 * `contained`: fill the positioned parent instead of the window (the homepage
 * hero), and only animate while it's on screen. `matchLight`: in dark mode, draw the glows and waves as
 * strongly as in light mode (the public pages) instead of the fainter dark setting (sign-in).
 */
export default function CalmBackground({ theme = 'dark', contained = false, matchLight = false }) {
  const ref = useRef(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return undefined
    const ctx = canvas.getContext('2d')
    if (!ctx) return undefined
    const t = THEMES[theme] || THEMES.dark
    const opts = { gold: t.accent, dark: theme === 'dark', grain: makeGrain(), matchLight }
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    let w = 0, h = 0, raf = 0, last = 0, refW = 0

    const size = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const box = contained ? canvas.parentElement.getBoundingClientRect() : null
      w = box ? box.width : window.innerWidth; h = box ? box.height : window.innerHeight
      // Contained: lay out against the first height seen, and again only if the width changes
      // (e.g. a phone turned sideways), so content growing or shrinking never moves the waves.
      if (contained && (!opts.refH || w !== refW)) { opts.refH = h; refW = w }
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    const still = () => drawCalm(ctx, w, h, 4000, opts)
    const tick = (now) => {
      raf = requestAnimationFrame(tick)
      if (now - last < 33) return // about 30 frames a second is plenty for this
      last = now
      drawCalm(ctx, w, h, now, opts)
    }
    let onScreen = true
    const start = () => {
      cancelAnimationFrame(raf)
      if (reduce?.matches || document.hidden || !onScreen) { still(); return }
      raf = requestAnimationFrame(tick)
    }
    const onResize = () => { size(); if (reduce?.matches) still() }

    size()
    start()
    // Contained: follow the parent's size, and rest while it's scrolled out of view.
    const ro = contained && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onResize) : null
    ro?.observe(canvas.parentElement)
    const io = contained && typeof IntersectionObserver !== 'undefined'
      ? new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; start() }) : null
    io?.observe(canvas.parentElement)
    window.addEventListener('resize', onResize)
    document.addEventListener('visibilitychange', start)
    reduce?.addEventListener?.('change', start)
    return () => {
      cancelAnimationFrame(raf)
      ro?.disconnect()
      io?.disconnect()
      window.removeEventListener('resize', onResize)
      document.removeEventListener('visibilitychange', start)
      reduce?.removeEventListener?.('change', start)
    }
  }, [theme, contained, matchLight])

  return (
    <canvas ref={ref} aria-hidden="true"
      style={{ position: contained ? 'absolute' : 'fixed', inset: 0, width: '100%', height: '100%', zIndex: 0, pointerEvents: 'none', display: 'block' }} />
  )
}
