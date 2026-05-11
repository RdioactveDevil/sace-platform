import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  LiveKitRoom,
  VideoConference,
  RoomAudioRenderer,
} from '@livekit/components-react'
import { Chat } from '@livekit/components-react'
import '@livekit/components-styles'
import { Tldraw } from '@tldraw/tldraw'
import '@tldraw/tldraw/tldraw.css'
import { getRoomInfo, getRoomToken } from '../lib/db'

const GOLD = '#f1be43'
const FONT_B = "'Plus Jakarta Sans', sans-serif"

function RoomTabs({ active, onChange }) {
  const tabs = [
    { id: 'video', label: '📹 Video' },
    { id: 'whiteboard', label: '🖊 Whiteboard' },
    { id: 'chat', label: '💬 Chat' },
  ]
  return (
    <div style={{ display: 'flex', gap: 0, background: '#0d0d1a', borderBottom: '1px solid #2a2a3e', flexShrink: 0, padding: '0 16px' }}>
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          style={{
            padding: '12px 20px', border: 'none',
            borderBottom: active === tab.id ? `2px solid ${GOLD}` : '2px solid transparent',
            background: 'transparent', color: active === tab.id ? GOLD : '#888',
            fontSize: 13, fontWeight: 600, fontFamily: FONT_B, cursor: 'pointer', transition: 'color 0.15s',
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

function RoomHeader({ room, onLeave }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', height: 56, background: '#0d0d1a', borderBottom: '1px solid #2a2a3e', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ fontFamily: "'Sifonn Pro', sans-serif", fontSize: 18, color: GOLD, letterSpacing: -0.5 }}>gradefarm.</span>
        <span style={{ color: '#ccc', fontSize: 14, fontFamily: FONT_B }}>{room?.title ?? 'Session'}</span>
        {room?.schedule && <span style={{ color: '#888', fontSize: 12, fontFamily: FONT_B }}>🔁 {room.schedule}</span>}
        <span style={{ background: '#1e3a2f', color: '#4ade80', fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 4 }}>LIVE</span>
      </div>
      <button onClick={onLeave} style={{ background: '#7f1d1d', color: '#fca5a5', border: 'none', borderRadius: 6, padding: '8px 16px', fontSize: 13, fontWeight: 600, fontFamily: FONT_B, cursor: 'pointer' }}>
        Leave Session
      </button>
    </div>
  )
}

function RoomContent() {
  const [activeTab, setActiveTab] = useState('video')
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: '#0a0a14' }}>
      <RoomTabs active={activeTab} onChange={setActiveTab} />
      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        <div style={{ position: 'absolute', inset: 0, display: activeTab === 'video' ? 'flex' : 'none', flexDirection: 'column' }}>
          <VideoConference />
          <RoomAudioRenderer />
        </div>
        <div style={{ position: 'absolute', inset: 0, display: activeTab === 'whiteboard' ? 'block' : 'none' }}>
          <Tldraw />
        </div>
        <div style={{ position: 'absolute', inset: 0, display: activeTab === 'chat' ? 'flex' : 'none', flexDirection: 'column', background: '#0d0d1a' }}>
          <Chat style={{ flex: 1, '--lk-bg': '#0d0d1a', '--lk-border-color': '#2a2a3e', '--lk-fg': '#e5e5e5' }} />
        </div>
      </div>
    </div>
  )
}

function StatusScreen({ message, isError, onBack }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0a0a14', color: '#ccc', fontFamily: FONT_B, gap: 16, padding: 32 }}>
      {isError ? (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
          <p style={{ color: '#f87171', fontSize: 16, fontWeight: 600, margin: '0 0 8px' }}>{message}</p>
          <button onClick={onBack} style={{ background: GOLD, color: '#1a1a2e', border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B, fontSize: 14 }}>
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

export default function RecurringRoomPage({ profile }) {
  const { roomName } = useParams()
  const navigate = useNavigate()
  const [room, setRoom] = useState(null)
  const [livekitToken, setLivekitToken] = useState(null)
  const [wsUrl, setWsUrl] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [roomInfo, tokenData] = await Promise.all([
        getRoomInfo(roomName),
        getRoomToken(roomName),
      ])
      setRoom(roomInfo)
      setLivekitToken(tokenData.token)
      setWsUrl(tokenData.wsUrl)
    } catch (e) {
      setError(e.message || 'Failed to join room.')
    } finally {
      setLoading(false)
    }
  }, [roomName])

  useEffect(() => { load() }, [load])

  const handleLeave = () => navigate(profile?.is_tutor ? '/tutor' : '/home')

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0a0a14' }}>
        <StatusScreen message="Joining session…" />
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0a0a14' }}>
        <StatusScreen message={error} isError onBack={handleLeave} />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0a0a14' }}>
      <style>{`
        @font-face { font-family: 'Sifonn Pro'; src: url('/SIFONN_PRO.otf') format('opentype'); font-display: swap; }
        .lk-room-container { background: #0a0a14 !important; }
        .lk-control-bar { background: #0d0d1a !important; border-top: 1px solid #2a2a3e !important; }
        .lk-chat { background: #0d0d1a !important; color: #e5e5e5 !important; }
        .lk-chat-entry { border-bottom: 1px solid #2a2a3e !important; }
        .lk-chat-form { border-top: 1px solid #2a2a3e !important; background: #0d0d1a !important; }
        .lk-chat-form-input { background: #1a1a2e !important; color: #e5e5e5 !important; border: 1px solid #2a2a3e !important; }
      `}</style>
      <RoomHeader room={room} onLeave={handleLeave} />
      <LiveKitRoom
        serverUrl={wsUrl}
        token={livekitToken}
        connect={true}
        video={true}
        audio={true}
        style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
        onDisconnected={handleLeave}
      >
        <RoomContent />
      </LiveKitRoom>
    </div>
  )
}
