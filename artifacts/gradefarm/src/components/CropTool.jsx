import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Minus, Plus, Scissors, X } from 'lucide-react'
import { btn, FONT_B } from '../lib/adminUi'
import { clampBox, tightenBox, CROP_SCALE } from '../lib/cropTools'
import { renderPdfPage, greyOf, cropPng } from '../lib/pdfPage'
import { figureSizeMm } from '../lib/examBuilder'

const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
const MIN = 12 // px: smaller than this isn't a figure

/**
 * Crop a figure from an exam paper's original PDF (Admin → a loaded paper →
 * Edit). The page is drawn at the ingest's 3 px per point, so the crop prints
 * at the size the figure had on the paper. Drag a box (or drag inside it to
 * move it, or its handles to resize), Tighten trims it to the drawing, and
 * "Use this crop" hands back a PNG: onUse(blob, { page, box }).
 */
export default function CropTool({ pdfUrl, startPage = 1, onUse, onCancel }) {
  const [pageNo, setPageNo] = useState(Math.max(1, startPage || 1))
  const [doc, setDoc] = useState(null) // { canvas, width, height, page, pages }
  const [error, setError] = useState('')
  const [zoom, setZoom] = useState(null) // display px per page px; null = fit width
  const [box, setBox] = useState(null)
  const [busy, setBusy] = useState(false)
  const stageRef = useRef(null)
  const holderRef = useRef(null)
  const previewRef = useRef(null)
  const drag = useRef(null)
  const grey = useRef(null)

  useEffect(() => {
    let alive = true
    setDoc(null); setError(''); setBox(null); grey.current = null
    renderPdfPage(pdfUrl, pageNo).then(d => { if (alive) { setDoc(d); if (d.page !== pageNo) setPageNo(d.page) } })
      .catch(e => { if (alive) setError(`The paper's PDF couldn't be opened: ${e?.message || e}`) })
    return () => { alive = false }
  }, [pdfUrl, pageNo])

  // Fit the page to the stage's width until the admin zooms.
  const [fit, setFit] = useState(0.3)
  useEffect(() => {
    const el = stageRef.current
    if (!el || !doc) return
    const measure = () => setFit(Math.max(0.1, (el.clientWidth - 24) / doc.width))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [doc])
  const scale = zoom ?? fit

  // The page canvas itself is shown, scaled.
  useEffect(() => {
    const holder = holderRef.current
    if (!holder || !doc) return
    holder.replaceChildren(doc.canvas)
    Object.assign(doc.canvas.style, { width: '100%', height: '100%', display: 'block' })
  }, [doc])

  // The crop as it will be saved.
  const good = box && box.width >= MIN && box.height >= MIN
  useEffect(() => {
    const c = previewRef.current
    if (!c || !doc || !good) return
    c.width = box.width; c.height = box.height
    c.getContext('2d').drawImage(doc.canvas, box.left, box.top, box.width, box.height, 0, 0, box.width, box.height)
  }, [doc, box, good])

  const toPage = (e) => {
    const r = holderRef.current.getBoundingClientRect()
    return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale }
  }
  const onDown = (e, mode) => {
    if (!doc || e.button !== 0) return
    e.preventDefault(); e.stopPropagation()
    const p = toPage(e)
    drag.current = { mode, start: p, box: box || { left: p.x, top: p.y, width: 0, height: 0 } }
    if (mode === 'new') setBox({ left: p.x, top: p.y, width: 0, height: 0 })
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const onMove = (e) => {
    const d = drag.current
    if (!d || !doc) return
    const p = toPage(e)
    const dx = p.x - d.start.x, dy = p.y - d.start.y
    const b = d.box
    let next
    if (d.mode === 'new') next = { left: d.start.x, top: d.start.y, width: dx, height: dy }
    else if (d.mode === 'move') {
      next = { ...b, left: Math.min(Math.max(0, b.left + dx), doc.width - b.width), top: Math.min(Math.max(0, b.top + dy), doc.height - b.height) }
    } else {
      let { left, top, width, height } = b
      if (d.mode.includes('w')) { left += dx; width -= dx }
      if (d.mode.includes('e')) width += dx
      if (d.mode.includes('n')) { top += dy; height -= dy }
      if (d.mode.includes('s')) height += dy
      next = { left, top, width, height }
    }
    setBox(clampBox(next, doc.width, doc.height))
  }
  const onUp = () => { drag.current = null }

  const tighten = () => {
    if (!doc || !box) return
    if (!grey.current) grey.current = greyOf(doc.canvas)
    setBox(tightenBox(grey.current, doc.width, doc.height, box, CROP_SCALE))
  }
  const use = async () => {
    if (!good) return
    setBusy(true)
    try { onUse(await cropPng(doc.canvas, box), { page: doc.page, box }) } catch (e) { setError(e.message || 'The crop could not be made') }
    setBusy(false)
  }

  const onKey = useCallback((e) => { if (e.key === 'Escape') onCancel?.() }, [onCancel])
  useEffect(() => { window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey) }, [onKey])

  const mm = good ? figureSizeMm(box.width, box.height, Infinity, Infinity) : null
  const fitted = good ? figureSizeMm(box.width, box.height) : null
  const small = (on) => ({ ...btn('secondary', !on), padding: '6px 9px', display: 'inline-flex', alignItems: 'center', gap: 4 })

  return (
    <div role="dialog" aria-modal="true" aria-label="Crop a figure from the paper"
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'var(--t-bg)', display: 'flex', flexDirection: 'column', fontFamily: FONT_B, color: 'var(--t-text)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: '1px solid var(--t-border)', flexWrap: 'wrap' }}>
        <Scissors size={16} aria-hidden="true" />
        <b style={{ fontSize: 14 }}>Crop from the paper</b>
        <span style={{ flex: 1 }} />
        <button type="button" onClick={() => setPageNo(n => n - 1)} disabled={!doc || doc.page <= 1} style={small(doc && doc.page > 1)} aria-label="Previous page"><ChevronLeft size={15} /></button>
        <span style={{ fontSize: 13, minWidth: 92, textAlign: 'center' }}>{doc ? `Page ${doc.page} of ${doc.pages}` : `Page ${pageNo}`}</span>
        <button type="button" onClick={() => setPageNo(n => n + 1)} disabled={!doc || doc.page >= doc.pages} style={small(doc && doc.page < doc.pages)} aria-label="Next page"><ChevronRight size={15} /></button>
        <span style={{ width: 8 }} />
        <button type="button" onClick={() => setZoom(z => Math.max(0.1, (z ?? fit) / 1.25))} disabled={!doc} style={small(!!doc)} aria-label="Zoom out"><Minus size={15} /></button>
        <button type="button" onClick={() => setZoom(null)} disabled={!doc} style={small(!!doc)}>Fit</button>
        <button type="button" onClick={() => setZoom(z => Math.min(2, (z ?? fit) * 1.25))} disabled={!doc} style={small(!!doc)} aria-label="Zoom in"><Plus size={15} /></button>
        <span style={{ width: 8 }} />
        <button type="button" onClick={onCancel} style={small(true)}><X size={15} aria-hidden="true" /> Cancel</button>
      </div>

      <style>{`
        .ct-body { flex: 1; min-height: 0; display: flex; }
        .ct-stage { flex: 1 1 0; min-width: 0; overflow: auto; background: var(--t-bgSubtle); padding: 12px; }
        .ct-side { flex: 0 0 300px; min-height: 0; overflow: auto; border-left: 1px solid var(--t-border); padding: 14px; display: flex; flex-direction: column; gap: 10px; }
        @media (max-width: 760px) {
          .ct-body { flex-direction: column; }
          .ct-side { flex: 0 0 auto; max-height: 42vh; border-left: 0; border-top: 1px solid var(--t-border); }
        }
      `}</style>
      <div className="ct-body">
        <div ref={stageRef} className="ct-stage">
          {error && <div role="alert" style={{ color: 'var(--t-danger)', fontSize: 13.5 }}>{error}</div>}
          {!doc && !error && <div style={{ color: 'var(--t-textMuted)', fontSize: 13.5 }}>Opening the paper…</div>}
          {doc && (
            <div onPointerDown={e => onDown(e, 'new')} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
              style={{ position: 'relative', width: doc.width * scale, height: doc.height * scale, cursor: 'crosshair', touchAction: 'none', boxShadow: '0 1px 6px rgba(0,0,0,0.25)', userSelect: 'none' }}>
              <div ref={holderRef} style={{ position: 'absolute', inset: 0 }} />
              {box && box.width > 0 && box.height > 0 && (
                <div onPointerDown={e => onDown(e, 'move')}
                  style={{ position: 'absolute', left: box.left * scale, top: box.top * scale, width: box.width * scale, height: box.height * scale,
                    outline: '2px solid var(--t-blue)', boxShadow: '0 0 0 9999px rgba(15,23,42,0.35)', cursor: 'move' }}>
                  {HANDLES.map(h => {
                    const pos = {
                      left: h.includes('w') ? -6 : h.includes('e') ? 'calc(100% - 6px)' : 'calc(50% - 6px)',
                      top: h.includes('n') ? -6 : h.includes('s') ? 'calc(100% - 6px)' : 'calc(50% - 6px)',
                    }
                    return <div key={h} onPointerDown={e => onDown(e, h)} aria-hidden="true"
                      style={{ position: 'absolute', width: 12, height: 12, background: '#fff', border: '2px solid var(--t-blue)', borderRadius: 3, cursor: `${h}-resize`, ...pos }} />
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="ct-side">
          <div style={{ fontSize: 13, color: 'var(--t-textSub)', lineHeight: 1.5 }}>
            Drag a box over the figure: its axes, labels and caption, but no question text, marks or answer lines. Drag inside the box to move it, or its corners and edges to resize it.
          </div>
          <button type="button" onClick={tighten} disabled={!good} style={btn('secondary', !good)}>Tighten to the drawing</button>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--t-textFaint)' }}>The crop</div>
          {good ? (
            <>
              <div style={{ background: '#fff', border: '1px solid var(--t-border)', borderRadius: 8, padding: 8 }}>
                <canvas ref={previewRef} style={{ maxWidth: '100%', height: 'auto', display: 'block' }} />
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--t-textMuted)' }}>
                {box.width} × {box.height} px · prints at {fitted.width.toFixed(0)} × {fitted.height.toFixed(0)} mm
                {(fitted.width < mm.width - 0.5) && ` (shrunk from ${mm.width.toFixed(0)} × ${mm.height.toFixed(0)} mm to fit the page)`}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--t-textMuted)' }}>{box ? 'Make the box bigger.' : 'No box yet.'}</div>
          )}
          <span style={{ flex: 1 }} />
          <button type="button" onClick={use} disabled={!good || busy} style={btn('primary', !good || busy)}>{busy ? 'Cropping…' : 'Use this crop'}</button>
        </div>
      </div>
    </div>
  )
}
