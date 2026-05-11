import { useEffect, useRef } from 'react'
import { useConnectionState, useLocalParticipant } from '@livekit/components-react'
import { ConnectionState, Track } from 'livekit-client'

/** Matches publishTrack({ name }) — used to replace prior whiteboard stream cleanly. */
export const WHITEBOARD_SCREEN_SHARE_NAME = 'gradefarm-whiteboard'

/**
 * Publish the Excalidraw canvas as LiveKit screen-share (camera-style broadcast to the room).
 * Only runs when {@link shouldPublish} is true (e.g. tutor); students keep a local-only board.
 */
export function useWhiteboardScreenShare({ enabled, shouldPublish, captureRootRef }) {
  const { localParticipant } = useLocalParticipant()
  const connectionState = useConnectionState()
  const videoTrackRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    let retryTimer = null

    async function unpublishOurTrack() {
      const vt = videoTrackRef.current
      videoTrackRef.current = null
      if (!vt || !localParticipant) return
      try {
        await localParticipant.unpublishTrack(vt, true)
      } catch {
        /* ignore */
      }
    }

    if (!enabled || !shouldPublish || connectionState !== ConnectionState.Connected) {
      void unpublishOurTrack()
      return () => {
        cancelled = true
        if (retryTimer) clearTimeout(retryTimer)
        void unpublishOurTrack()
      }
    }

    async function start(attempt) {
      if (cancelled || videoTrackRef.current) return

      const root = captureRootRef?.current
      const canvas = pickLargestCanvas(root)
      if (!canvas) {
        if (attempt < 60) {
          retryTimer = setTimeout(() => start(attempt + 1), 100)
        }
        return
      }

      const ssPub = localParticipant.getTrackPublication(Track.Source.ScreenShare)
      if (ssPub?.track) {
        try {
          await localParticipant.unpublishTrack(ssPub.track, true)
        } catch {
          /* ignore */
        }
      }

      if (cancelled || !localParticipant) return

      try {
        const stream = canvas.captureStream(24)
        const vt = stream.getVideoTracks()[0]
        if (!vt || cancelled) return
        try {
          vt.contentHint = 'detail'
        } catch {
          /* optional hint */
        }

        await localParticipant.publishTrack(vt, {
          source: Track.Source.ScreenShare,
          name: WHITEBOARD_SCREEN_SHARE_NAME,
          simulcast: false,
        })
        videoTrackRef.current = vt
      } catch (e) {
        console.warn('[gradefarm] whiteboard screen share failed', e)
      }
    }

    start(0)

    return () => {
      cancelled = true
      if (retryTimer) clearTimeout(retryTimer)
      void unpublishOurTrack()
    }
  }, [enabled, shouldPublish, connectionState, localParticipant, captureRootRef])
}

/**
 * @param {ParentNode | null | undefined} root
 * @returns {HTMLCanvasElement | null}
 */
function pickLargestCanvas(root) {
  if (typeof document === 'undefined' || !root) return null
  const nodes = root.querySelectorAll('canvas')
  let best = null
  let bestArea = 0
  for (const canvas of nodes) {
    const w = canvas.width
    const h = canvas.height
    const area = w * h
    if (w < 8 || h < 8 || area < 5000) continue
    if (area > bestArea) {
      bestArea = area
      best = canvas
    }
  }
  return best
}
