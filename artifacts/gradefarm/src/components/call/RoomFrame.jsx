import { LiveKitRoom } from '@livekit/components-react'
import { TriangleAlert } from 'lucide-react'
import '@livekit/components-styles'
import CallRoom, { useCallViewportLock } from './CallRoom'

const GOLD = '#f1be43'
const FONT_B = "'Plus Jakarta Sans', sans-serif"

const frameStyle = { display: 'flex', flexDirection: 'column', height: '100dvh', maxHeight: '100dvh', overflow: 'hidden', background: '#0a0c1a' }

function StatusScreen({ message, isError, onBack }) {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32, fontFamily: FONT_B, textAlign: 'center' }}>
      <style>{`@keyframes gf-spin{to{transform:rotate(360deg)}}`}</style>
      {isError ? (
        <div>
          <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'center', color: '#f87171' }}><TriangleAlert size={40} aria-hidden="true" /></div>
          <p style={{ color: '#f87171', fontSize: 16, fontWeight: 600, margin: '0 0 16px' }}>{message}</p>
          <button onClick={onBack}
            style={{ background: GOLD, color: '#171724', border: 'none', borderRadius: 10, padding: '10px 20px', fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B, fontSize: 14 }}>
            Go back
          </button>
        </div>
      ) : (
        <div>
          <div style={{ width: 38, height: 38, border: `3px solid ${GOLD}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'gf-spin 0.8s linear infinite', margin: '0 auto 16px' }} />
          <p style={{ color: '#9aa0bf', fontSize: 15, margin: 0 }}>{message}</p>
        </div>
      )}
    </div>
  )
}

/**
 * Full-page call: a loading / error screen until the token arrives, then the
 * LiveKit room with the shared call UI.
 */
export default function RoomFrame({ loading, error, token, wsUrl, title, subtitle, isTutor, onLeave, onEnd }) {
  useCallViewportLock()
  return (
    <div style={frameStyle}>
      {loading ? (
        <StatusScreen message="Joining session…" />
      ) : error ? (
        <StatusScreen message={error} isError onBack={onLeave} />
      ) : (
        <LiveKitRoom
          serverUrl={wsUrl}
          token={token}
          connect
          video
          audio
          style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: '#0a0c1a' }}
          onDisconnected={onLeave}
        >
          <CallRoom title={title} subtitle={subtitle} isTutor={isTutor} onLeave={onLeave} onEnd={onEnd} />
        </LiveKitRoom>
      )}
    </div>
  )
}
