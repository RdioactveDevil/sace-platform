import { memo, useState, useEffect, useLayoutEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  LiveKitRoom,
  GridLayout,
  CarouselLayout,
  ParticipantTile,
  RoomAudioRenderer,
  Chat,
  TrackToggle,
  useTracks,
  useConnectionState,
} from '@livekit/components-react'
import { Track } from 'livekit-client'
import '@livekit/components-styles'
import { Excalidraw } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import { fetchTutoringSession, getTutoringSessionToken, endTutoringSession } from '../lib/db'
import { useLiveKitJoinOverlay } from '../hooks/useLiveKitJoinOverlay'

const GOLD = '#f1be43'
const FONT_B = "'Plus Jakarta Sans', sans-serif"

function useCallViewportLock() {
  useLayoutEffect(() => {
    if (typeof document === 'undefined') return undefined

    const root = document.getElementById('root')
    const previous = {
      htmlHeight: document.documentElement.style.height,
      htmlOverflow: document.documentElement.style.overflow,
      bodyHeight: document.body.style.height,
      bodyMaxHeight: document.body.style.maxHeight,
      bodyOverflow: document.body.style.overflow,
      rootHeight: root?.style.height || '',
      rootMaxHeight: root?.style.maxHeight || '',
      rootOverflow: root?.style.overflow || '',
    }

    document.documentElement.style.height = '100%'
    document.documentElement.style.overflow = 'hidden'
    document.body.style.height = '100dvh'
    document.body.style.maxHeight = '100dvh'
    document.body.style.overflow = 'hidden'

    if (root) {
      root.style.height = '100dvh'
      root.style.maxHeight = '100dvh'
      root.style.overflow = 'hidden'
    }

    return () => {
      document.documentElement.style.height = previous.htmlHeight
      document.documentElement.style.overflow = previous.htmlOverflow
      document.body.style.height = previous.bodyHeight
      document.body.style.maxHeight = previous.bodyMaxHeight
      document.body.style.overflow = previous.bodyOverflow

      if (root) {
        root.style.height = previous.rootHeight
        root.style.maxHeight = previous.rootMaxHeight
        root.style.overflow = previous.rootOverflow
      }
    }
  }, [])
}

const WhiteboardSurface = memo(function WhiteboardSurface() {
  return (
    <div className="gf-whiteboard-surface">
      <Excalidraw theme="light" autoFocus={false} />
    </div>
  )
})

function RoomHeader({ session }) {
  const title = session?.title || 'Tutoring Session'
  return (
    <div className="gf-room-header">
      <div className="gf-room-title-row">
        <span className="gf-brand">gradefarm.</span>
        <span className="gf-room-title">{title}</span>
        <span className="gf-live-pill">LIVE</span>
      </div>
    </div>
  )
}

function CallStage({ showChat, showWhiteboard, onToggleChat, onToggleWhiteboard, onLeave, onEnd, isTutor }) {
  const connectionState = useConnectionState()
  const showJoinOverlay = useLiveKitJoinOverlay(connectionState)

  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false }
  )

  return (
    <div className="gf-call-stage">
      {/* Fullscreen spinner only until first in-room handshake; mid-session SDK flicker must not cover the whiteboard */}
      {showJoinOverlay && (
        <div className="gf-connecting-overlay">
          <div className="gf-connecting-spinner" />
          <p className="gf-connecting-text">Connecting…</p>
        </div>
      )}

      <div className={showWhiteboard ? 'gf-call-surface gf-call-surface--whiteboard' : 'gf-call-surface'}>
        {showWhiteboard ? (
          <div className="gf-whiteboard-split">
            <div className="gf-whiteboard-main">
              <div className="gf-whiteboard-frame">
                <WhiteboardSurface />
              </div>
            </div>
            <div className="gf-video-rail" aria-label="Participants">
              <CarouselLayout tracks={tracks} className="gf-video-carousel">
                <ParticipantTile />
              </CarouselLayout>
            </div>
          </div>
        ) : (
          <div className="gf-video-surface">
            <GridLayout tracks={tracks} className="gf-video-grid">
              <ParticipantTile />
            </GridLayout>
          </div>
        )}

        <div className="gf-call-dock">
          <TrackToggle source={Track.Source.Microphone} className="gf-dock-button">
            Mic
          </TrackToggle>
          <TrackToggle source={Track.Source.Camera} className="gf-dock-button">
            Camera
          </TrackToggle>
          <TrackToggle source={Track.Source.ScreenShare} className="gf-dock-button">
            Share
          </TrackToggle>
          <button className="gf-dock-button" type="button" aria-pressed={showWhiteboard} onClick={onToggleWhiteboard}>
            Whiteboard
          </button>
          <button className="gf-dock-button" type="button" aria-pressed={showChat} onClick={onToggleChat}>
            Chat
          </button>
          {isTutor ? (
            <button className="gf-dock-button gf-dock-button-danger" type="button" onClick={onEnd}>
              End Session
            </button>
          ) : (
            <button className="gf-dock-button gf-dock-button-danger" type="button" onClick={onLeave}>
              Leave
            </button>
          )}
        </div>
      </div>

      {showChat && (
        <aside className="gf-chat-panel">
          <div className="gf-chat-header">
            <span>Chat</span>
            <button type="button" onClick={onToggleChat} aria-label="Close chat">×</button>
          </div>
          <Chat style={{ flex: 1, '--lk-bg': '#0d0d1a', '--lk-border-color': '#2a2a3e', '--lk-fg': '#e5e5e5' }} />
        </aside>
      )}
      <RoomAudioRenderer />
    </div>
  )
}

function RoomContent({ session, showChat, showWhiteboard, onToggleChat, onToggleWhiteboard, onLeave, onEnd, isTutor }) {
  return (
    <div className="gf-room-shell">
      <RoomHeader session={session} />
      <CallStage
        showChat={showChat}
        showWhiteboard={showWhiteboard}
        onToggleChat={onToggleChat}
        onToggleWhiteboard={onToggleWhiteboard}
        onLeave={onLeave}
        onEnd={onEnd}
        isTutor={isTutor}
      />
    </div>
  )
}

function StatusScreen({ message, isError, onBack }) {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', background: '#0a0a14', color: '#ccc',
      fontFamily: FONT_B, gap: 16, padding: 32,
    }}>
      {isError ? (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
          <p style={{ color: '#f87171', fontSize: 16, fontWeight: 600, margin: '0 0 8px' }}>{message}</p>
          <button
            onClick={onBack}
            style={{ background: GOLD, color: '#1a1a2e', border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B, fontSize: 14 }}
          >
            Go Back
          </button>
        </div>
      ) : (
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, border: `3px solid ${GOLD}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
          <p style={{ color: '#aaa', fontSize: 15 }}>{message}</p>
        </div>
      )}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

export default function SessionRoom({ profile }) {
  useCallViewportLock()

  const { sessionId } = useParams()
  const navigate = useNavigate()

  const [session, setSession] = useState(null)
  const [livekitToken, setLivekitToken] = useState(null)
  const [wsUrl, setWsUrl] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Lifted above LiveKitRoom so panel state survives any internal LiveKit re-renders
  const [showChat, setShowChat] = useState(false)
  const [showWhiteboard, setShowWhiteboard] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const s = await fetchTutoringSession(sessionId)
      setSession(s)
      const { token, wsUrl: url } = await getTutoringSessionToken(sessionId)
      setLivekitToken(token)
      setWsUrl(url)
    } catch (e) {
      setError(e.message || 'Failed to load session.')
    } finally {
      setLoading(false)
    }
  }, [sessionId])

  useEffect(() => { load() }, [load])

  const handleLeave = () => navigate(profile?.is_tutor ? '/tutor' : '/home')

  const handleEnd = async () => {
    try { await endTutoringSession(sessionId) } catch {}
    handleLeave()
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', maxHeight: '100dvh', overflow: 'hidden', background: '#0a0a14' }}>
        <StatusScreen message="Joining session…" />
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', maxHeight: '100dvh', overflow: 'hidden', background: '#0a0a14' }}>
        <StatusScreen message={error} isError onBack={handleLeave} />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', maxHeight: '100dvh', overflow: 'hidden', background: '#0a0a14' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @font-face { font-family: 'Sifonn Pro'; src: url('/SIFONN_PRO.otf') format('opentype'); font-display: swap; }
        .lk-room-container { background: #0a0a14 !important; height: 100% !important; min-height: 0 !important; overflow: hidden !important; }
        .lk-video-conference { height: 100% !important; min-height: 0 !important; overflow: hidden !important; }
        .lk-grid-layout-wrapper, .lk-focus-layout-wrapper { min-height: 0 !important; overflow: hidden !important; }
        .lk-grid-layout { background: #070711 !important; min-height: 0 !important; gap: 10px !important; }
        .lk-focus-layout { background: #070711 !important; min-height: 0 !important; }
        .lk-participant-tile { border-radius: 12px !important; overflow: hidden; border: 1px solid rgba(255,255,255,0.08) !important; background: #11111f !important; }
        .gf-room-shell { flex: 1; display: flex; flex-direction: column; min-height: 0; overflow: hidden; background: #070711; color: #f7f7fb; font-family: ${FONT_B}; }
        .gf-room-header { height: 48px; flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; padding: 0 18px; background: rgba(8,8,18,0.96); border-bottom: 1px solid rgba(255,255,255,0.08); }
        .gf-room-title-row { min-width: 0; display: flex; align-items: center; gap: 12px; }
        .gf-brand { flex-shrink: 0; color: ${GOLD}; font-family: 'Sifonn Pro', sans-serif; font-size: 17px; letter-spacing: 0; }
        .gf-room-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #d8d8e8; font-size: 13px; }
        .gf-live-pill { flex-shrink: 0; border-radius: 6px; background: #173225; color: #6ee7b7; font-size: 10px; font-weight: 800; padding: 3px 7px; }
        .gf-call-stage { flex: 1; min-height: 0; display: flex; position: relative; background: #05050d; overflow: hidden; }
        .gf-connecting-overlay { position: absolute; inset: 0; z-index: 30; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; background: #05050d; }
        .gf-connecting-spinner { width: 40px; height: 40px; border: 3px solid ${GOLD}; border-top-color: transparent; border-radius: 50%; animation: spin 0.8s linear infinite; }
        .gf-connecting-text { color: #aaa; font-family: ${FONT_B}; font-size: 15px; margin: 0; }
        .gf-call-surface { flex: 1; min-width: 0; min-height: 0; display: flex; position: relative; overflow: hidden; padding: 12px 12px 86px; }
        .gf-call-surface--whiteboard { overflow: visible !important; }
        .gf-video-surface { flex: 1; min-width: 0; min-height: 0; overflow: hidden; border-radius: 14px; background: #10101b; border: 1px solid rgba(255,255,255,0.08); }
        .gf-video-grid { width: 100%; height: 100%; background: #070711 !important; }
        .gf-call-dock { position: absolute; left: 50%; bottom: 18px; z-index: 20; display: flex; align-items: center; gap: 8px; max-width: calc(100% - 24px); overflow-x: auto; transform: translateX(-50%); padding: 8px; border-radius: 14px; background: rgba(11,11,24,0.92); border: 1px solid rgba(255,255,255,0.12); box-shadow: 0 18px 40px rgba(0,0,0,0.36); backdrop-filter: blur(12px); }
        .gf-dock-button { min-height: 40px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; border: 1px solid rgba(255,255,255,0.12); border-radius: 10px; background: #1b1b2f; color: #f5f5fb; padding: 0 14px; font-family: ${FONT_B}; font-size: 13px; font-weight: 700; line-height: 1; white-space: nowrap; cursor: pointer; }
        .gf-dock-button:hover { background: #262641; border-color: rgba(255,255,255,0.22); }
        .gf-dock-button[aria-pressed="true"],
        .gf-dock-button[data-lk-enabled="true"] { background: ${GOLD}; color: #171724; border-color: ${GOLD}; }
        .gf-dock-button-danger { background: #7f1d1d; color: #fecaca; border-color: #9f2727; }
        .gf-dock-button-danger:hover { background: #992222; border-color: #b83434; }
        .gf-chat-panel { width: 340px; min-width: 300px; min-height: 0; display: flex; flex-direction: column; background: #0d0d1a; border-left: 1px solid rgba(255,255,255,0.08); }
        .gf-chat-header { min-height: 46px; display: flex; align-items: center; justify-content: space-between; padding: 0 14px; border-bottom: 1px solid rgba(255,255,255,0.08); color: #f5f5fb; font-size: 13px; font-weight: 800; }
        .gf-chat-header button { width: 30px; height: 30px; border: 0; border-radius: 8px; background: transparent; color: #a8a8bd; cursor: pointer; font-size: 16px; }
        .gf-chat-header button:hover { background: #1b1b2f; color: #fff; }
        .gf-whiteboard-split { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: row; gap: 10px; align-items: stretch; }
        .gf-whiteboard-main { flex: 1; min-width: 0; min-height: 0; position: relative; border-radius: 14px; }
        .gf-whiteboard-frame { position: absolute; inset: 0; min-width: 0; min-height: 0; overflow: visible; border-radius: 14px; background: #f8fafc; }
        .gf-video-rail { flex-shrink: 0; width: 176px; min-height: 0; display: flex; flex-direction: column; border-radius: 14px; overflow: hidden; background: #10101b; border: 1px solid rgba(255,255,255,0.08); padding: 6px; box-sizing: border-box; }
        .gf-video-rail .gf-video-carousel { flex: 1; min-height: 0; width: 100%; --lk-grid-gap: 8px; }
        .gf-video-rail .lk-participant-tile { min-height: 0 !important; }
        .gf-whiteboard-surface { position: absolute; inset: 0; width: 100%; height: 100% !important; min-height: 0 !important; overflow: visible; background: #f8fafc; border-radius: 14px; }
        .gf-whiteboard-surface .excalidraw { position: absolute !important; inset: 0 !important; width: 100% !important; height: 100% !important; }
        .lk-chat { background: #0d0d1a !important; color: #e5e5e5 !important; height: 100% !important; }
        .lk-chat-messages { flex: 1 !important; }
        .lk-chat-entry { border-bottom: 1px solid #1a1a2e !important; padding: 10px 14px !important; }
        .lk-chat-form { border-top: 1px solid #2a2a3e !important; background: #0d0d1a !important; padding: 10px !important; }
        .lk-chat-form-input { background: #1a1a2e !important; color: #e5e5e5 !important; border: 1px solid #2a2a3e !important; border-radius: 8px !important; padding: 8px 12px !important; }
        .lk-chat-form-button { background: ${GOLD} !important; color: #1a1a2e !important; border-radius: 8px !important; }
        @media (max-width: 860px) {
          .gf-room-header { padding: 0 12px; }
          .gf-call-stage { flex-direction: column; }
          .gf-call-surface { padding: 8px 8px 84px; }
          .gf-whiteboard-split { flex-direction: column; }
          .gf-video-rail { width: 100%; height: 132px; flex-direction: row; }
          .gf-chat-panel { width: 100%; min-width: 0; height: 38%; border-left: 0; border-top: 1px solid rgba(255,255,255,0.08); }
          .gf-dock-button { padding: 0 11px; }
        }
      `}</style>
      <LiveKitRoom
        serverUrl={wsUrl}
        token={livekitToken}
        connect={true}
        video={true}
        audio={true}
        style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
        onDisconnected={handleLeave}
      >
        <RoomContent
          session={session}
          showChat={showChat}
          showWhiteboard={showWhiteboard}
          onToggleChat={() => setShowChat(c => !c)}
          onToggleWhiteboard={() => setShowWhiteboard(w => !w)}
          onLeave={handleLeave}
          onEnd={handleEnd}
          isTutor={profile?.is_tutor ?? false}
        />
      </LiveKitRoom>
    </div>
  )
}
