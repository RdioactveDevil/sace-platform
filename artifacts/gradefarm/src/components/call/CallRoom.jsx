import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  RoomAudioRenderer,
  VideoTrack,
  useChat,
  useConnectionState,
  useIsRecording,
  useParticipants,
  useTrackToggle,
  useTracks,
} from '@livekit/components-react'
import { Track } from 'livekit-client'
import { Mic, MicOff, Video, VideoOff, MonitorUp, MonitorX, PenLine, MessageSquare, PhoneOff, Users, X, SendHorizontal, Circle } from 'lucide-react'
import { Excalidraw } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import { useLiveKitJoinOverlay } from '../../hooks/useLiveKitJoinOverlay'
import { useWhiteboardBroadcast } from '../../hooks/useWhiteboardBroadcast'
import VideoTile, { TILE_CSS } from './VideoTile'
import { pickStage, fitGrid } from './callLayout'

const GOLD = '#f1be43'
const FONT_B = "'Plus Jakarta Sans', sans-serif"
const GAP = 12

/** Lock the page to the viewport while a call is open (no body scroll). */
export function useCallViewportLock() {
  useLayoutEffect(() => {
    if (typeof document === 'undefined') return undefined
    const root = document.getElementById('root')
    const targets = [
      [document.documentElement, { height: '100%', overflow: 'hidden' }],
      [document.body, { height: '100dvh', maxHeight: '100dvh', overflow: 'hidden' }],
      ...(root ? [[root, { height: '100dvh', maxHeight: '100dvh', overflow: 'hidden' }]] : []),
    ]
    const previous = targets.map(([el, styles]) => Object.fromEntries(Object.keys(styles).map(k => [k, el.style[k]])))
    targets.forEach(([el, styles]) => Object.assign(el.style, styles))
    return () => targets.forEach(([el], i) => Object.assign(el.style, previous[i]))
  }, [])
}

function useElementSize(ref) {
  const [size, setSize] = useState({ width: 0, height: 0 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setSize({ width, height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return size
}

function useElapsed() {
  const [start] = useState(() => Date.now())
  const [now, setNow] = useState(start)
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  const s = Math.floor((now - start) / 1000)
  const hh = Math.floor(s / 3600)
  const mm = String(Math.floor((s % 3600) / 60)).padStart(hh ? 2 : 1, '0')
  const ss = String(s % 60).padStart(2, '0')
  return hh ? `${hh}:${mm}:${ss}` : `${mm}:${ss}`
}

const WhiteboardSurface = memo(function WhiteboardSurface() {
  return (
    <div className="gf-whiteboard-surface">
      <Excalidraw theme="light" autoFocus={false} />
    </div>
  )
})

// ── Header ────────────────────────────────────────────────────────────────────

function CallHeader({ title, subtitle }) {
  const elapsed = useElapsed()
  const recording = useIsRecording()
  const participants = useParticipants()
  return (
    <header className="gf-call-header">
      <div className="gf-call-header-main">
        <span className="gf-brand">gradefarm.</span>
        <span className="gf-header-divider" />
        <div className="gf-call-title-block">
          <span className="gf-call-title">{title}</span>
          {subtitle && <span className="gf-call-subtitle">{subtitle}</span>}
        </div>
      </div>
      <div className="gf-call-header-meta">
        {recording && (
          <span className="gf-chip gf-chip--rec" title="This session is being recorded">
            <Circle size={8} fill="currentColor" aria-hidden="true" /> REC
          </span>
        )}
        <span className="gf-chip gf-chip--live">LIVE · {elapsed}</span>
        <span className="gf-chip" title="People in the call">
          <Users size={13} aria-hidden="true" /> {participants.length}
        </span>
      </div>
    </header>
  )
}

// ── Stage ────────────────────────────────────────────────────────────────────

/** Equal 16:9 tiles, as large as the box allows, centred. */
function TileGrid({ cameras }) {
  const boxRef = useRef(null)
  const { width, height } = useElementSize(boxRef)
  const { cols, tileW } = fitGrid(cameras.length, width, height, { gap: GAP })
  return (
    <div ref={boxRef} className="gf-grid-box">
      {tileW > 0 && (
        <div className="gf-grid" style={{ gridTemplateColumns: `repeat(${cols}, ${tileW}px)` }}>
          {cameras.map(ref => (
            <VideoTile key={`${ref.participant.identity}:${ref.source}`} trackRef={ref} style={{ width: tileW }} />
          ))}
        </div>
      )}
    </div>
  )
}

/** Camera strip beside (or, on phones, below) the featured screen. */
function CameraRail({ cameras }) {
  if (!cameras.length) return null
  return (
    <aside className="gf-rail" aria-label="Participants">
      {cameras.map(ref => (
        <VideoTile key={`${ref.participant.identity}:${ref.source}`} trackRef={ref} compact />
      ))}
    </aside>
  )
}

function ScreenStage({ screen, onStopShare }) {
  const self = screen.participant.isLocal
  const name = screen.participant.name || screen.participant.identity
  return (
    <div className="gf-feature">
      {self ? (
        <div className="gf-presenting">
          <MonitorUp size={34} aria-hidden="true" />
          <p>You’re sharing your screen</p>
          <span>Everyone in the call can see it.</span>
          <button type="button" className="gf-pill-btn" onClick={onStopShare}>Stop sharing</button>
        </div>
      ) : (
        <>
          <VideoTrack trackRef={screen} className="gf-feature-video" />
          <div className="gf-tile-name gf-feature-label"><MonitorUp size={12} aria-hidden="true" /><span>{name}’s screen</span></div>
        </>
      )}
    </div>
  )
}

// ── Dock ─────────────────────────────────────────────────────────────────────

function ToggleButton({ source, onIcon: OnIcon, offIcon: OffIcon, onLabel, offLabel, disabled, title }) {
  const { enabled, pending, toggle } = useTrackToggle({ source })
  const Icon = enabled ? OnIcon : OffIcon
  const off = !enabled && source !== Track.Source.ScreenShare
  const label = enabled ? onLabel : offLabel
  return (
    <button type="button" className={`gf-dock-btn${off ? ' gf-dock-btn--off' : ''}${enabled && source === Track.Source.ScreenShare ? ' gf-dock-btn--on' : ''}`}
      onClick={() => toggle()} disabled={pending || disabled} title={title || label} aria-label={label} aria-pressed={enabled}>
      <Icon size={19} aria-hidden="true" />
      <span>{label}</span>
    </button>
  )
}

function Dock({ isTutor, showWhiteboard, onToggleWhiteboard, showChat, onToggleChat, unread, onLeave, onEnd }) {
  return (
    <div className="gf-dock" role="toolbar" aria-label="Call controls">
      <div className="gf-dock-group">
        <ToggleButton source={Track.Source.Microphone} onIcon={Mic} offIcon={MicOff} onLabel="Mute" offLabel="Unmute" />
        <ToggleButton source={Track.Source.Camera} onIcon={Video} offIcon={VideoOff} onLabel="Stop video" offLabel="Start video" />
        <ToggleButton source={Track.Source.ScreenShare} onIcon={MonitorX} offIcon={MonitorUp} onLabel="Stop share" offLabel="Share"
          disabled={isTutor && showWhiteboard}
          title={isTutor && showWhiteboard ? 'The whiteboard is being shared — close it to share your screen' : undefined} />
        <button type="button" className={`gf-dock-btn${showWhiteboard ? ' gf-dock-btn--on' : ''}`} aria-pressed={showWhiteboard} onClick={onToggleWhiteboard} title="Whiteboard" aria-label="Whiteboard">
          <PenLine size={19} aria-hidden="true" />
          <span>Whiteboard</span>
        </button>
        <button type="button" className={`gf-dock-btn${showChat ? ' gf-dock-btn--on' : ''}`} aria-pressed={showChat} onClick={onToggleChat} title="Chat" aria-label={unread > 0 && !showChat ? `Chat, ${unread} unread` : 'Chat'}>
          <MessageSquare size={19} aria-hidden="true" />
          <span>Chat</span>
          {unread > 0 && !showChat && <span className="gf-badge">{unread > 9 ? '9+' : unread}</span>}
        </button>
      </div>
      <div className="gf-dock-group">
        {isTutor && onEnd ? (
          <>
            <button type="button" className="gf-dock-btn gf-dock-btn--ghost" onClick={onLeave} title="Leave" aria-label="Leave">
              <PhoneOff size={19} aria-hidden="true" />
              <span>Leave</span>
            </button>
            <button type="button" className="gf-dock-btn gf-dock-btn--danger" onClick={onEnd} title="End for all" aria-label="End for all">
              <PhoneOff size={19} aria-hidden="true" />
              <span>End for all</span>
            </button>
          </>
        ) : (
          <button type="button" className="gf-dock-btn gf-dock-btn--danger" onClick={onLeave} title="Leave" aria-label="Leave">
            <PhoneOff size={19} aria-hidden="true" />
            <span>Leave</span>
          </button>
        )}
      </div>
    </div>
  )
}

// ── Chat ─────────────────────────────────────────────────────────────────────

function ChatPanel({ chatMessages, send, isSending, onClose }) {
  const [draft, setDraft] = useState('')
  const listRef = useRef(null)

  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [chatMessages.length])

  const submit = async (e) => {
    e.preventDefault()
    const text = draft.trim()
    if (!text) return
    setDraft('')
    try { await send(text) } catch { setDraft(text) }
  }

  return (
    <aside className="gf-chat" aria-label="Chat">
      <div className="gf-chat-head">
        <span><MessageSquare size={15} aria-hidden="true" /> Chat</span>
        <button type="button" onClick={onClose} aria-label="Close chat"><X size={16} aria-hidden="true" /></button>
      </div>
      <div className="gf-chat-list" ref={listRef}>
        {chatMessages.length === 0 && (
          <p className="gf-chat-empty">Messages are visible to everyone in the call.</p>
        )}
        {chatMessages.map((m, i) => {
          const self = !!m.from?.isLocal
          const name = m.from?.name || m.from?.identity || 'Guest'
          const prev = chatMessages[i - 1]
          const grouped = prev && prev.from?.identity === m.from?.identity && m.timestamp - prev.timestamp < 60_000
          return (
            <div key={m.id || `${m.timestamp}-${i}`} className={`gf-msg${self ? ' gf-msg--self' : ''}`}>
              {!grouped && (
                <div className="gf-msg-meta">
                  <span>{self ? 'You' : name}</span>
                  <time>{new Date(m.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time>
                </div>
              )}
              <div className="gf-msg-bubble">{m.message}</div>
            </div>
          )
        })}
      </div>
      <form className="gf-chat-form" onSubmit={submit}>
        <input value={draft} onChange={e => setDraft(e.target.value)} placeholder="Send a message…" aria-label="Message" maxLength={2000} />
        <button type="submit" disabled={!draft.trim() || isSending} aria-label="Send"><SendHorizontal size={16} aria-hidden="true" /></button>
      </form>
    </aside>
  )
}

// ── Room ─────────────────────────────────────────────────────────────────────

/**
 * Everything inside <LiveKitRoom>: header, stage, controls and chat. Shared by
 * one-off sessions (/session/:id) and recurring rooms (/room/:name).
 */
export default function CallRoom({ title, subtitle, isTutor, onLeave, onEnd }) {
  const connectionState = useConnectionState()
  const showJoinOverlay = useLiveKitJoinOverlay(connectionState)
  const [showChat, setShowChat] = useState(false)
  const [showWhiteboard, setShowWhiteboard] = useState(false)

  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  )
  // A tutor's whiteboard is broadcast as their own screen share; they see the board itself instead.
  const { screen, cameras } = useMemo(
    () => pickStage(tracks, { includeLocal: true }),
    [tracks],
  )
  const featuredScreen = showWhiteboard && isTutor ? null : screen

  const whiteboardFrameRef = useRef(null)
  const broadcasting = useWhiteboardBroadcast(whiteboardFrameRef, isTutor && showWhiteboard)
  const shareToggle = useTrackToggle({ source: Track.Source.ScreenShare })

  // Unread counter while the chat is closed.
  const { chatMessages, send, isSending } = useChat()
  const [seen, setSeen] = useState(0)
  useEffect(() => { if (showChat) setSeen(chatMessages.length) }, [showChat, chatMessages.length])
  const unread = Math.max(0, chatMessages.length - seen)

  const featured = showWhiteboard || !!featuredScreen

  return (
    <div className="gf-call">
      <style>{CALL_CSS}</style>
      <CallHeader title={title} subtitle={subtitle} />

      <div className="gf-call-body">
        {showJoinOverlay && (
          <div className="gf-connecting">
            <div className="gf-spinner" />
            <p>Connecting…</p>
          </div>
        )}

        <main className={featured ? 'gf-stage gf-stage--featured' : 'gf-stage'}>
          {showWhiteboard ? (
            <div className="gf-feature gf-feature--board" ref={whiteboardFrameRef}>
              <WhiteboardSurface />
              {isTutor && (
                <div className={broadcasting ? 'gf-board-pill gf-board-pill--on' : 'gf-board-pill'}>
                  {broadcasting ? 'Students can see this board' : 'Starting broadcast…'}
                </div>
              )}
            </div>
          ) : featuredScreen ? (
            <ScreenStage screen={featuredScreen} onStopShare={() => shareToggle.toggle(false)} />
          ) : (
            <TileGrid cameras={cameras} />
          )}
          {featured && <CameraRail cameras={cameras} />}
        </main>

        {showChat && (
          <ChatPanel chatMessages={chatMessages} send={send} isSending={isSending} onClose={() => setShowChat(false)} />
        )}
      </div>

      <Dock
        isTutor={isTutor}
        showWhiteboard={showWhiteboard}
        onToggleWhiteboard={() => setShowWhiteboard(v => !v)}
        showChat={showChat}
        onToggleChat={() => setShowChat(v => !v)}
        unread={unread}
        onLeave={onLeave}
        onEnd={onEnd}
      />
      <RoomAudioRenderer />
    </div>
  )
}

const CALL_CSS = `
  @keyframes gf-spin { to { transform: rotate(360deg) } }
  @font-face { font-family: 'Sifonn Pro'; src: url('/SIFONN_PRO.otf') format('opentype'); font-display: swap; }
  ${TILE_CSS}
  .gf-call { flex: 1; min-height: 0; display: flex; flex-direction: column; background: #0a0c1a; color: #f5f6ff; font-family: ${FONT_B}; }
  .gf-call-header { height: 56px; flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 0 20px; border-bottom: 1px solid rgba(255,255,255,0.07); }
  .gf-call-header-main { min-width: 0; display: flex; align-items: center; gap: 14px; }
  .gf-brand { flex-shrink: 0; color: ${GOLD}; font-family: 'Sifonn Pro', sans-serif; font-size: 17px; }
  .gf-header-divider { width: 1px; height: 22px; background: rgba(255,255,255,0.12); flex-shrink: 0; }
  .gf-call-title-block { min-width: 0; display: flex; flex-direction: column; }
  .gf-call-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; font-weight: 800; }
  .gf-call-subtitle { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11.5px; color: #9aa0bf; }
  .gf-call-header-meta { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
  .gf-chip { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px; border-radius: 8px; background: rgba(255,255,255,0.06); color: #c9cde6; font-size: 12px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .gf-chip--live { background: rgba(16,185,129,0.14); color: #6ee7b7; }
  .gf-chip--rec { background: rgba(239,68,68,0.15); color: #fca5a5; letter-spacing: 0.04em; }

  .gf-call-body { position: relative; flex: 1; min-height: 0; display: flex; gap: ${GAP}px; padding: ${GAP}px ${GAP}px 0; }
  .gf-connecting { position: absolute; inset: 0; z-index: 30; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; background: #0a0c1a; color: #9aa0bf; font-size: 14px; }
  .gf-spinner { width: 38px; height: 38px; border: 3px solid ${GOLD}; border-top-color: transparent; border-radius: 50%; animation: gf-spin 0.8s linear infinite; }

  .gf-stage { flex: 1; min-width: 0; min-height: 0; display: flex; gap: ${GAP}px; }
  .gf-grid-box { flex: 1; min-width: 0; min-height: 0; display: flex; align-items: center; justify-content: center; overflow: hidden; }
  .gf-grid { display: grid; gap: ${GAP}px; justify-content: center; align-content: center; }

  .gf-feature { position: relative; flex: 1; min-width: 0; min-height: 0; overflow: hidden; border-radius: 14px; background: #05060f; border: 1px solid rgba(255,255,255,0.08); }
  .gf-feature-video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }
  .gf-feature-label { left: 12px; bottom: 12px; }
  .gf-feature-label svg { color: ${GOLD} !important; }
  .gf-feature--board { overflow: visible; background: #f8fafc; }
  .gf-whiteboard-surface { position: absolute; inset: 0; border-radius: 14px; overflow: visible; }
  .gf-whiteboard-surface .excalidraw { position: absolute !important; inset: 0 !important; width: 100% !important; height: 100% !important; }
  .gf-board-pill { position: absolute; top: 10px; right: 10px; z-index: 5; padding: 4px 10px; border-radius: 999px; font-size: 11px; font-weight: 800; background: rgba(15,20,48,0.85); color: #94a3b8; pointer-events: none; }
  .gf-board-pill--on { background: rgba(23,50,37,0.92); color: #6ee7b7; }
  .gf-presenting { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; color: #c9cde6; text-align: center; padding: 20px; }
  .gf-presenting svg { color: ${GOLD}; margin-bottom: 4px; }
  .gf-presenting p { margin: 0; font-size: 16px; font-weight: 800; color: #f5f6ff; }
  .gf-presenting span { font-size: 13px; color: #9aa0bf; }
  .gf-pill-btn { margin-top: 10px; height: 36px; padding: 0 16px; border-radius: 10px; border: 1px solid rgba(239,68,68,0.5); background: rgba(239,68,68,0.14); color: #fecaca; font-family: ${FONT_B}; font-size: 13px; font-weight: 700; cursor: pointer; }

  .gf-rail { width: 232px; flex-shrink: 0; min-height: 0; display: flex; flex-direction: column; gap: ${GAP}px; overflow-y: auto; scrollbar-width: thin; }
  .gf-rail .gf-tile { width: 100%; flex-shrink: 0; }

  .gf-chat { width: 340px; flex-shrink: 0; min-height: 0; display: flex; flex-direction: column; overflow: hidden; border-radius: 14px; background: #12152a; border: 1px solid rgba(255,255,255,0.08); }
  .gf-chat-head { height: 48px; flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; padding: 0 8px 0 16px; border-bottom: 1px solid rgba(255,255,255,0.07); font-size: 13px; font-weight: 800; }
  .gf-chat-head > span { display: inline-flex; align-items: center; gap: 8px; }
  .gf-chat-head > span svg { color: ${GOLD}; }
  .gf-chat-head button { width: 32px; height: 32px; display: inline-flex; align-items: center; justify-content: center; border: 0; border-radius: 8px; background: transparent; color: #9aa0bf; cursor: pointer; }
  .gf-chat-head button:hover { background: rgba(255,255,255,0.06); color: #fff; }
  .gf-chat-list { flex: 1; min-height: 0; overflow-y: auto; padding: 14px 14px 6px; display: flex; flex-direction: column; gap: 4px; scrollbar-width: thin; }
  .gf-chat-empty { margin: auto 0; text-align: center; color: #7d83a3; font-size: 12.5px; padding: 0 16px; }
  .gf-msg { display: flex; flex-direction: column; align-items: flex-start; max-width: 86%; }
  .gf-msg--self { align-self: flex-end; align-items: flex-end; }
  .gf-msg-meta { display: flex; gap: 8px; align-items: baseline; margin: 8px 2px 3px; font-size: 11.5px; font-weight: 700; color: #c9cde6; }
  .gf-msg-meta time { font-weight: 500; color: #7d83a3; }
  .gf-msg-bubble { padding: 8px 12px; border-radius: 12px; background: rgba(255,255,255,0.07); color: #eef0ff; font-size: 13.5px; line-height: 1.45; white-space: pre-wrap; overflow-wrap: anywhere; }
  .gf-msg--self .gf-msg-bubble { background: rgba(241,190,67,0.16); color: #fdf2d3; }
  .gf-chat-form { flex-shrink: 0; display: flex; gap: 8px; padding: 12px; border-top: 1px solid rgba(255,255,255,0.07); }
  .gf-chat-form input { flex: 1; min-width: 0; height: 40px; padding: 0 12px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.1); background: #0a0c1a; color: #f5f6ff; font-family: ${FONT_B}; font-size: 13.5px; outline: none; }
  .gf-chat-form input:focus { border-color: ${GOLD}; }
  .gf-chat-form button { width: 40px; height: 40px; flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; border: 0; border-radius: 10px; background: ${GOLD}; color: #171724; cursor: pointer; }
  .gf-chat-form button:disabled { opacity: 0.4; cursor: default; }

  .gf-dock { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: ${GAP}px 20px; overflow-x: auto; scrollbar-width: none; }
  .gf-dock::-webkit-scrollbar { display: none; }
  .gf-dock-group { display: flex; align-items: center; gap: 8px; }
  .gf-dock-group:first-child { margin: 0 auto; }
  .gf-dock-btn { position: relative; min-width: 76px; height: 58px; display: inline-flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px; padding: 0 10px; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; background: #171a30; color: #e7e9f7; font-family: ${FONT_B}; font-size: 11.5px; font-weight: 700; white-space: nowrap; cursor: pointer; transition: background 0.12s, border-color 0.12s; }
  .gf-dock-btn:hover:not(:disabled) { background: #20243f; border-color: rgba(255,255,255,0.18); }
  .gf-dock-btn:disabled { opacity: 0.45; cursor: not-allowed; }
  .gf-dock-btn--off { background: rgba(239,68,68,0.14); border-color: rgba(239,68,68,0.35); color: #fecaca; }
  .gf-dock-btn--on { background: rgba(241,190,67,0.16); border-color: rgba(241,190,67,0.55); color: ${GOLD}; }
  .gf-dock-btn--ghost { background: transparent; }
  .gf-dock-btn--danger { background: #b91c1c; border-color: #b91c1c; color: #fff; }
  .gf-dock-btn--danger:hover:not(:disabled) { background: #dc2626; border-color: #dc2626; }
  .gf-badge { position: absolute; top: 6px; right: 14px; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; background: ${GOLD}; color: #171724; font-size: 10.5px; font-weight: 800; line-height: 18px; }

  @media (max-width: 860px) {
    .gf-call-header { padding: 0 12px; height: 52px; }
    .gf-brand, .gf-header-divider, .gf-call-subtitle { display: none; }
    .gf-call-body { padding: 8px 8px 0; }
    .gf-stage--featured { flex-direction: column; }
    .gf-rail { width: auto; height: 96px; flex-direction: row; overflow-x: auto; overflow-y: hidden; }
    .gf-rail .gf-tile { width: auto; height: 100%; }
    .gf-chat { position: absolute; inset: 8px 8px 0; width: auto; z-index: 25; }
    .gf-dock { padding: 8px; gap: 6px; }
    .gf-dock-group { gap: 6px; }
    .gf-dock-group:first-child { margin: 0; }
    .gf-dock-btn { min-width: 42px; width: 42px; height: 44px; padding: 0; }
    .gf-dock-btn > span:not(.gf-badge) { display: none; }
    .gf-badge { top: -4px; right: -4px; }
  }
`
