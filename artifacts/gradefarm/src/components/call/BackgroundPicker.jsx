import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocalParticipant } from '@livekit/components-react'
import { Ban, Droplets, ImagePlus, X, Check } from 'lucide-react'

const STORAGE_KEY = 'gf-call-background'
const CUSTOM_KEY = 'gf-call-background-custom'

export const WALLPAPERS = [
  { id: 'gradefarm-night', label: 'Night', src: '/backgrounds/gradefarm-night.jpg' },
  { id: 'soft-studio', label: 'Studio', src: '/backgrounds/soft-studio.jpg' },
  { id: 'chalkboard', label: 'Chalkboard', src: '/backgrounds/chalkboard.jpg' },
  { id: 'ocean', label: 'Ocean', src: '/backgrounds/ocean.jpg' },
  { id: 'forest', label: 'Forest', src: '/backgrounds/forest.jpg' },
  { id: 'sunrise', label: 'Sunrise', src: '/backgrounds/sunrise.jpg' },
]

const NONE = { kind: 'none' }

function loadChoice() {
  try {
    const c = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
    if (c?.kind === 'blur' || (c?.kind === 'image' && (c.id === 'custom' || WALLPAPERS.some(w => w.id === c.id)))) return c
  } catch {}
  return NONE
}

function loadCustom() {
  try { return localStorage.getItem(CUSTOM_KEY) } catch { return null }
}

function imageFor(choice) {
  if (choice.kind !== 'image') return null
  return choice.id === 'custom' ? loadCustom() : WALLPAPERS.find(w => w.id === choice.id)?.src || null
}

function processorOptions(choice) {
  if (choice.kind === 'blur') return { mode: 'background-blur', blurRadius: choice.strength === 'strong' ? 20 : 8 }
  const imagePath = imageFor(choice)
  return imagePath ? { mode: 'virtual-background', imagePath } : { mode: 'disabled' }
}

/** Shrink an uploaded picture to at most 1280×720 JPEG so it fits in localStorage. */
function resizeImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, 1280 / img.width, 720 / img.height)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.85))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file isn’t an image we can use.')) }
    img.src = url
  })
}

/**
 * The local camera's background: none, blur, or a picture. The choice is
 * remembered per browser and re-applied whenever the camera track changes.
 * The processor package (MediaPipe) loads only when a background is used.
 */
export function useCallBackground() {
  const { cameraTrack } = useLocalParticipant()
  const track = cameraTrack?.track || null
  const [choice, setChoice] = useState(loadChoice)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [supported, setSupported] = useState(true)
  const applied = useRef(null) // { track, processor }

  const apply = useCallback(async (next, tr) => {
    if (!tr) return
    if (next.kind === 'none') {
      if (applied.current?.track === tr && tr.getProcessor()) await tr.stopProcessor()
      applied.current = null
      return
    }
    const mod = await import('@livekit/track-processors')
    if (!mod.supportsBackgroundProcessors()) {
      setSupported(false)
      throw new Error('This browser can’t change your background. Try Chrome, Edge or Safari 18+.')
    }
    const opts = processorOptions(next)
    if (applied.current?.track === tr && tr.getProcessor() === applied.current.processor) {
      await applied.current.processor.switchTo(opts)
    } else {
      const processor = mod.BackgroundProcessor(opts)
      await tr.setProcessor(processor)
      applied.current = { track: tr, processor }
    }
  }, [])

  // Re-apply the saved background when the camera starts or its track is replaced.
  useEffect(() => {
    if (!track || choice.kind === 'none') return
    if (applied.current?.track === track && track.getProcessor()) return
    apply(choice, track).catch(e => setError(e.message || 'Couldn’t apply your background.'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track])

  const select = useCallback(async (next) => {
    setBusy(true); setError('')
    try {
      await apply(next, track)
      setChoice(next)
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch {}
    } catch (e) {
      setError(e.message || 'Couldn’t apply that background.')
    }
    setBusy(false)
  }, [apply, track])

  const uploadCustom = useCallback(async (file) => {
    setError('')
    try {
      const dataUrl = await resizeImage(file)
      try { localStorage.setItem(CUSTOM_KEY, dataUrl) } catch { throw new Error('That picture is too large to keep. Try a smaller one.') }
      await select({ kind: 'image', id: 'custom' })
    } catch (e) {
      setError(e.message)
    }
  }, [select])

  return { choice, select, uploadCustom, busy, error, supported, hasCamera: !!track }
}

/** Panel of background options, shown above the call controls. */
export function BackgroundPanel({ bg, onClose }) {
  const fileRef = useRef(null)
  const panelRef = useRef(null)
  const custom = loadCustom()

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    const onDown = (e) => { if (panelRef.current && !panelRef.current.contains(e.target) && !e.target.closest?.('[data-bg-toggle]')) onClose() }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('pointerdown', onDown) }
  }, [onClose])

  const is = (c) => bg.choice.kind === c.kind && (c.kind !== 'blur' || (bg.choice.strength || 'light') === (c.strength || 'light')) && (c.kind !== 'image' || bg.choice.id === c.id)

  const Option = ({ c, label, children, style }) => (
    <button type="button" className={`gf-bg-opt${is(c) ? ' gf-bg-opt--on' : ''}`} disabled={bg.busy} onClick={() => bg.select(c)} aria-pressed={is(c)} title={label} style={style}>
      {children}
      <span className="gf-bg-opt-label">{label}</span>
      {is(c) && <span className="gf-bg-opt-check"><Check size={12} aria-hidden="true" /></span>}
    </button>
  )

  return (
    <div className="gf-bg-panel" ref={panelRef} role="dialog" aria-label="Background">
      <div className="gf-bg-head">
        <span>Background</span>
        <button type="button" onClick={onClose} aria-label="Close"><X size={16} aria-hidden="true" /></button>
      </div>
      {!bg.hasCamera && <p className="gf-bg-note">Turn your camera on to see it. Your choice is saved for next time.</p>}
      <div className="gf-bg-grid">
        <Option c={NONE} label="None"><span className="gf-bg-icon"><Ban size={20} aria-hidden="true" /></span></Option>
        <Option c={{ kind: 'blur', strength: 'light' }} label="Slight blur"><span className="gf-bg-icon gf-bg-icon--blur"><Droplets size={18} aria-hidden="true" /></span></Option>
        <Option c={{ kind: 'blur', strength: 'strong' }} label="Blur"><span className="gf-bg-icon gf-bg-icon--blur gf-bg-icon--strong"><Droplets size={22} aria-hidden="true" /></span></Option>
        {WALLPAPERS.map(w => (
          <Option key={w.id} c={{ kind: 'image', id: w.id }} label={w.label} style={{ backgroundImage: `url(${w.src})` }} />
        ))}
        {custom && <Option c={{ kind: 'image', id: 'custom' }} label="Your picture" style={{ backgroundImage: `url(${custom})` }} />}
        <button type="button" className="gf-bg-opt" onClick={() => fileRef.current?.click()} disabled={bg.busy} title="Upload a picture">
          <span className="gf-bg-icon"><ImagePlus size={20} aria-hidden="true" /></span>
          <span className="gf-bg-opt-label">{custom ? 'Replace' : 'Upload'}</span>
        </button>
      </div>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) bg.uploadCustom(f) }} />
      {bg.busy && <p className="gf-bg-note">Applying…</p>}
      {bg.error && <p className="gf-bg-note gf-bg-note--error">{bg.error}</p>}
    </div>
  )
}

export const BACKGROUND_CSS = `
  .gf-bg-anchor { position: relative; height: 0; z-index: 40; }
  .gf-bg-panel { position: absolute; left: 50%; bottom: 10px; transform: translateX(-50%); z-index: 40; width: min(440px, calc(100vw - 24px)); box-sizing: border-box; padding: 12px 14px 14px; border-radius: 16px; background: #12152a; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 24px 60px rgba(0,0,0,0.55); }
  .gf-bg-head { display: flex; align-items: center; justify-content: space-between; font-size: 13px; font-weight: 800; margin-bottom: 10px; }
  .gf-bg-head button { width: 30px; height: 30px; display: inline-flex; align-items: center; justify-content: center; border: 0; border-radius: 8px; background: transparent; color: #9aa0bf; cursor: pointer; }
  .gf-bg-head button:hover { background: rgba(255,255,255,0.06); color: #fff; }
  .gf-bg-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  .gf-bg-opt { position: relative; aspect-ratio: 16 / 10; border-radius: 10px; border: 2px solid transparent; background: #1c2040 center / cover no-repeat; color: #e7e9f7; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; overflow: hidden; font-family: inherit; }
  .gf-bg-opt:hover:not(:disabled) { border-color: rgba(255,255,255,0.3); }
  .gf-bg-opt:disabled { cursor: wait; opacity: 0.7; }
  .gf-bg-opt--on { border-color: #f1be43 !important; }
  .gf-bg-opt-label { position: absolute; left: 0; right: 0; bottom: 0; padding: 3px 4px; font-size: 10px; font-weight: 700; text-align: center; background: linear-gradient(transparent, rgba(0,0,0,0.65)); color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .gf-bg-opt-check { position: absolute; top: 4px; right: 4px; width: 18px; height: 18px; border-radius: 50%; background: #f1be43; color: #171724; display: flex; align-items: center; justify-content: center; }
  .gf-bg-icon { margin-bottom: 10px; display: flex; color: #c9cde6; }
  .gf-bg-icon--blur { filter: blur(0.4px); }
  .gf-bg-icon--strong { filter: blur(1px); }
  .gf-bg-note { margin: 10px 0 0; font-size: 12px; color: #9aa0bf; }
  .gf-bg-note--error { color: #fca5a5; }
  @media (max-width: 860px) { .gf-bg-grid { grid-template-columns: repeat(3, 1fr); } }
`
