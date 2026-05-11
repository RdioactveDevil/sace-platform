import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  LiveKitRoom,
  VideoConference,
  RoomAudioRenderer,
  Chat,
} from '@livekit/components-react'
import '@livekit/components-styles'
import { Tldraw } from '@tldraw/tldraw'
import '@tldraw/tldraw/tldraw.css'
import { fetchTutoringSession, getTutoringSessionToken } from '../lib/db'

const GOLD = '#f1be43'
const FONT_B = "'Plus Jakarta Sans', sans-serif"

// ── Room header ───────────────────────────────────────────────────────────────
function RoomHeader({ session, showChat, showWhiteboard, onToggleChat, onToggleWhiteboard, onLeave }) {
  const title = session?.title || 'Tutoring Session'
  const btnBase = {
    border: 'none', borderRadius: 8, padding: '7px 14px',
    fontSize: 13, fontWeight: 600, fontFamily: FONT_B, cursor: 'pointer',
    transition: 'all 0.15s',
  }
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 16px', height: 52, background: '#0d0d1a',
      borderBottom: '1px solid #2a2a3e', flexShrink: 0, gap: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <span style={{ fontFamily: "'Sifonn Pro', sans-serif", fontSize: 17, color: GOLD, letterSpacing: -0.5, flexShrink: 0 }}>
          gradefarm.
        </span>
        <span style={{ color: '#ccc', fontSize: 13, fontFamily: FONT_B, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {title}
        </span>
        <span style={{ background: '#1e3a2f', color: '#4ade80', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, fontFamily: FONT_B, flexShrink: 0 }}>
          LIVE
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <button
          onClick={onToggleWhiteboard}
          style={{
            ...btnBase,
            background: showWhiteboard ? GOLD : '#1a1a2e',
            color: showWhiteboard ? '#1a1a2e' : '#ccc',
            border: '1px solid #2a2a3e',
          }}
        >
          🖊 Whiteboard
        </button>
        <button
          onClick={onToggleChat}
          style={{
            ...btnBase,
            background: showChat ? GOLD : '#1a1a2e',
            color: showChat ? '#1a1a2e' : '#ccc',
            border: '1px solid #2a2a3e',
          }}
        >
          💬 Chat
        </button>
        <button
          onClick={onLeave}
          style={{ ...btnBase, background: '#7f1d1d', color: '#fca5a5', border: 'none' }}
        >
          Leave
        </button>
      </div>
    </div>
  )
}

// ── Main room content ─────────────────────────────────────────────────────────
function RoomContent({ session }) {
  const [showChat, setShowChat] = useState(false)
  const [showWhiteboard, setShowWhiteboard] = useState(false)
  const navigate = useNavigate()

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden', background: '#0a0a14' }}>
      <RoomHeader
        session={session}
        showChat={showChat}
        showWhiteboard={showWhiteboard}
        onToggleChat={() => setShowChat(c => !c)}
        onToggleWhiteboard={() => setShowWhiteboard(w => !w)}
        onLeave={() => navigate('/tutor')}
      />

      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden', position: 'relative' }}>
        {showWhiteboard ? (
          /* ── Whiteboard overlay ── */
          <div className="gf-whiteboard-surface">
            <Tldraw />
          </div>
        ) : (
          /* ── Video + optional chat panel ── */
          <>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
              <VideoConference />
              <RoomAudioRenderer />
            </div>
            {showChat && (
              <div style={{
                width: 300, minWidth: 300, minHeight: 0, display: 'flex', flexDirection: 'column',
                borderLeft: '1px solid #2a2a3e', background: '#0d0d1a',
              }}>
                <div style={{ padding: '10px 14px', borderBottom: '1px solid #2a2a3e', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ color: '#ccc', fontFamily: FONT_B, fontSize: 13, fontWeight: 600 }}>Chat</span>
                  <button onClick={() => setShowChat(false)} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
                </div>
                <Chat style={{ flex: 1, '--lk-bg': '#0d0d1a', '--lk-border-color': '#2a2a3e', '--lk-fg': '#e5e5e5' }} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Loading / error screen ────────────────────────────────────────────────────
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

// ── SessionRoom ───────────────────────────────────────────────────────────────
export default function SessionRoom({ profile }) {
  const { sessionId } = useParams()
  const navigate = useNavigate()

  const [session, setSession] = useState(null)
  const [livekitToken, setLivekitToken] = useState(null)
  const [wsUrl, setWsUrl] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

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
        @font-face { font-family: 'Sifonn Pro'; src: url('/SIFONN_PRO.otf') format('opentype'); font-display: swap; }
        .lk-room-container { background: #0a0a14 !important; height: 100% !important; min-height: 0 !important; overflow: hidden !important; }
        .lk-video-conference { height: 100% !important; min-height: 0 !important; overflow: hidden !important; }
        .lk-grid-layout-wrapper, .lk-focus-layout-wrapper { min-height: 0 !important; overflow: hidden !important; }
        .lk-grid-layout { background: #0a0a14 !important; min-height: 0 !important; }
        .lk-focus-layout { background: #0a0a14 !important; min-height: 0 !important; }
        .lk-participant-tile { border-radius: 10px !important; overflow: hidden; }
        .gf-whiteboard-surface { flex: 1; width: 100%; height: 100% !important; min-height: 0 !important; overflow: hidden; position: relative; }
        .gf-whiteboard-surface > .tl-container { width: 100% !important; height: 100% !important; }
        .lk-control-bar { background: #0d0d1a !important; border-top: 1px solid #2a2a3e !important; padding: 10px 16px !important; flex-shrink: 0 !important; }
        .lk-control-bar .lk-button { background: #23233a !important; color: #f4f4fb !important; border: 1px solid #3a3a58 !important; border-radius: 8px !important; }
        .lk-control-bar .lk-button:hover { background: #2d2d49 !important; border-color: #56567a !important; transform: translateY(-1px); }
        .lk-control-bar .lk-button[aria-pressed="true"],
        .lk-control-bar .lk-button[data-lk-enabled="true"] { background: ${GOLD} !important; color: #171724 !important; border-color: ${GOLD} !important; }
        .lk-disconnect-button { background: #7f1d1d !important; color: #fca5a5 !important; }
        .lk-chat { background: #0d0d1a !important; color: #e5e5e5 !important; height: 100% !important; }
        .lk-chat-messages { flex: 1 !important; }
        .lk-chat-entry { border-bottom: 1px solid #1a1a2e !important; padding: 10px 14px !important; }
        .lk-chat-form { border-top: 1px solid #2a2a3e !important; background: #0d0d1a !important; padding: 10px !important; }
        .lk-chat-form-input { background: #1a1a2e !important; color: #e5e5e5 !important; border: 1px solid #2a2a3e !important; border-radius: 8px !important; padding: 8px 12px !important; }
        .lk-chat-form-button { background: ${GOLD} !important; color: #1a1a2e !important; border-radius: 8px !important; }
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
        <RoomContent session={session} />
      </LiveKitRoom>
    </div>
  )
}
