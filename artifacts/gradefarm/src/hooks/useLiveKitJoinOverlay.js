import { useEffect, useState } from 'react'
import { ConnectionState } from 'livekit-client'

/**
 * Whether to show the fullscreen LiveKit join overlay (spinner).
 * After we've reached any stable "in room" SDK state once, transient
 * Connecting/Disconnected flashes must not cover embedded UI like the whiteboard.
 */
export function useLiveKitJoinOverlay(connectionState) {
  const [handshakeObserved, setHandshakeObserved] = useState(false)

  useEffect(() => {
    if (
      connectionState === ConnectionState.Connected ||
      connectionState === ConnectionState.Reconnecting ||
      connectionState === ConnectionState.SignalReconnecting
    ) {
      setHandshakeObserved(true)
    }
  }, [connectionState])

  const showJoinOverlay =
    !handshakeObserved &&
    (connectionState === ConnectionState.Connecting ||
      connectionState === ConnectionState.Disconnected)

  return showJoinOverlay
}
