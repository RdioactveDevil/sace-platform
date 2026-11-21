import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { appZoom } from '../lib/appZoom'

const LearnScreen = lazy(() => import('./LearnScreen'))

const WIDTH_KEY = 'gf-titan-dock-width'
const DEFAULT_W = 420
const MIN_W = 320
const MAX_W = 900
// The question keeps at least this much room beside the pane.
const MIN_QUESTION_W = 420
const MOBILE_MAX = 860

const readWidth = () => {
  try { return Number(localStorage.getItem(WIDTH_KEY)) || DEFAULT_W } catch { return DEFAULT_W }
}
const maxWidth = () => Math.max(MIN_W, Math.min(MAX_W, window.innerWidth / appZoom() - MIN_QUESTION_W))
const clampW = (w) => Math.round(Math.max(MIN_W, Math.min(maxWidth(), w)))

/**
 * Titan beside a practice question, like the Ask Titan panel in a lesson:
 * a pane on the right whose left edge drags to make it wider or narrower
 * (the width is remembered in this browser). On a phone it covers the screen.
 *
 * request: { topic, ctx, at } from the question's "Ask Titan" button (ctx is
 * buildQuestionHelpContext's question context). Asking about the question
 * already in the pane just reopens it; a different question starts a new chat.
 * The pane stays mounted while closed, so reopening keeps the conversation.
 */
export default function TitanDock({ open, request, onClose, onOpenChat, profile, struggleMap, questions, subject, theme, interests, setInterests, onUpgrade }) {
  const [width, setWidth] = useState(() => clampW(readWidth()))
  const [dragging, setDragging] = useState(false)
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < MOBILE_MAX)

  // Titan's conversation, separate from the Learn page's.
  const [phase, setPhase] = useState('chat')
  const [topic, setTopic] = useState('')
  const [messages, setMessages] = useState([])
  const [docContext, setDocContext] = useState('')
  const [docName, setDocName] = useState('')
  const [questionContext, setQuestionContext] = useState(null)
  const askedAbout = useRef(null)

  useEffect(() => {
    if (!request) return
    const key = request.ctx?.question || request.topic || ''
    if (key && key === askedAbout.current && messages.length) return // same question: carry on
    askedAbout.current = key
    if (request.topic) setTopic(request.topic)
    if (request.ctx) setQuestionContext(request.ctx)
    else { setMessages([]); setPhase('chat') }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.at])

  useEffect(() => {
    const onResize = () => { setIsMobile(window.innerWidth < MOBILE_MAX); setWidth(w => clampW(w)) }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => { if (e.key === 'Escape' && isMobile) onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, isMobile, onClose])

  const save = (w) => { try { localStorage.setItem(WIDTH_KEY, String(w)) } catch {} }
  const setAndSave = (w) => { const next = clampW(w); setWidth(next); save(next) }

  const startDrag = (e) => {
    if (e.button !== 0) return
    e.preventDefault()
    const startX = e.clientX
    const startW = width
    let last = startW
    setDragging(true)
    const prevCursor = document.body.style.cursor
    const prevSelect = document.body.style.userSelect
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    const move = (ev) => {
      // Dragging left widens the pane. Pointer moves are in screen pixels; the app is zoomed.
      last = clampW(startW + (startX - ev.clientX) / appZoom())
      setWidth(last)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      document.body.style.cursor = prevCursor
      document.body.style.userSelect = prevSelect
      setDragging(false)
      save(last)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const onHandleKey = (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); setAndSave(width + 24) }
    else if (e.key === 'ArrowRight') { e.preventDefault(); setAndSave(width - 24) }
    else if (e.key === 'Home') { e.preventDefault(); setAndSave(MIN_W) }
    else if (e.key === 'End') { e.preventDefault(); setAndSave(maxWidth()) }
  }

  const frame = isMobile
    ? { position: 'fixed', inset: 0, zIndex: 70, width: 'auto' }
    : { position: 'relative', width, flex: `0 0 ${width}px`, height: '100%' }

  return (
    <aside aria-label="Ask Titan" className="td-dock"
      style={{ ...frame, display: open ? 'flex' : 'none', flexDirection: 'column', minHeight: 0, background: 'var(--t-bg)', borderLeft: isMobile ? 'none' : '1px solid var(--t-border)' }}>
      <style>{`
        @keyframes tdIn { from { opacity: 0; transform: translateX(24px); } to { opacity: 1; transform: none; } }
        .td-dock { animation: tdIn 0.28s cubic-bezier(.3,.7,.2,1); }
        .td-handle { position: absolute; top: 0; bottom: 0; left: -5px; width: 10px; z-index: 5; cursor: col-resize; touch-action: none; display: flex; justify-content: center; }
        .td-handle::before { content: ''; width: 2px; height: 100%; background: transparent; transition: background 0.15s ease; }
        .td-handle::after { content: ''; position: absolute; top: 50%; left: 50%; width: 6px; height: 36px; margin: -18px 0 0 -3px; border-radius: 999px; background: var(--t-borderStrong, var(--t-border)); transition: background 0.15s ease, height 0.15s ease; }
        .td-handle:hover::before, .td-handle:focus-visible::before, .td-handle.on::before { background: var(--t-accent); }
        .td-handle:hover::after, .td-handle:focus-visible::after, .td-handle.on::after { background: var(--t-accent); }
        .td-handle:focus-visible { outline: none; }
        @media (prefers-reduced-motion: reduce) { .td-dock { animation: none; } }
      `}</style>
      {!isMobile && (
        <div role="separator" aria-orientation="vertical" aria-label="Resize Titan" tabIndex={0}
          aria-valuemin={MIN_W} aria-valuemax={Math.round(maxWidth())} aria-valuenow={width}
          title="Drag to resize · double-click to reset"
          className={`td-handle${dragging ? ' on' : ''}`}
          onPointerDown={startDrag} onKeyDown={onHandleKey} onDoubleClick={() => setAndSave(DEFAULT_W)} />
      )}
      {/* While dragging, keep the chat from swallowing pointer moves. */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', pointerEvents: dragging ? 'none' : 'auto' }}>
        <Suspense fallback={null}>
          <LearnScreen docked onClose={onClose} onBack={onClose} onOpenChat={onOpenChat}
            profile={profile} struggleMap={struggleMap} questions={questions} subject={subject} theme={theme} onUpgrade={onUpgrade}
            phase={phase} setPhase={setPhase} topic={topic} setTopic={setTopic} messages={messages} setMessages={setMessages}
            interests={interests} setInterests={setInterests} docContext={docContext} setDocContext={setDocContext}
            docName={docName} setDocName={setDocName} questionContext={questionContext} setQuestionContext={setQuestionContext} />
        </Suspense>
      </div>
    </aside>
  )
}
