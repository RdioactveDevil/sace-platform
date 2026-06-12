import { useEffect, useState } from 'react'
import { useLocalParticipant } from '@livekit/components-react'
import { Track } from 'livekit-client'

const BROADCAST_FPS = 12
const TRACK_NAME = 'gradefarm-whiteboard'

/**
 * Publish the Excalidraw whiteboard inside `containerRef` as a LiveKit
 * screen-share track while `enabled` is true (tutor with the board open).
 *
 * Excalidraw paints onto stacked canvases (committed scene + in-progress
 * stroke layer), so each frame composites every `.excalidraw__canvas` found
 * in the container onto an offscreen canvas and streams that via
 * `captureStream`. Remote participants receive it as an ordinary screen-share
 * tile — no receiver-side changes needed — and Room Composite egress records
 * it like any other share. The fixed-rate redraw also keeps frames flowing
 * when the board is static (captureStream only emits on repaint).
 *
 * Starting a broadcast takes over any active desktop screen share,
 * Zoom-style. Returns true while the track is live.
 */
export function useWhiteboardBroadcast(containerRef, enabled) {
  const { localParticipant } = useLocalParticipant()
  const [broadcasting, setBroadcasting] = useState(false)

  useEffect(() => {
    if (!enabled || !localParticipant) return undefined

    let cancelled = false
    let timer = null
    let publishedTrack = null

    const composite = document.createElement('canvas')
    composite.width = 1280
    composite.height = 720
    const ctx = composite.getContext('2d')

    const drawFrame = () => {
      const container = containerRef.current
      // Live HTMLCollection — survives Excalidraw remounting its canvases.
      const canvases = container ? container.getElementsByClassName('excalidraw__canvas') : []
      const base = canvases[0]
      if (base && base.width > 0 && base.height > 0 &&
          (composite.width !== base.width || composite.height !== base.height)) {
        composite.width = base.width
        composite.height = base.height
      }
      ctx.fillStyle = '#f8fafc'
      ctx.fillRect(0, 0, composite.width, composite.height)
      for (const c of canvases) {
        if (c.width > 0 && c.height > 0) ctx.drawImage(c, 0, 0, composite.width, composite.height)
      }
    }

    const start = async () => {
      try {
        // Whiteboard takes over any active desktop share, Zoom-style.
        await localParticipant.setScreenShareEnabled(false).catch(() => {})
        if (cancelled) return
        drawFrame()
        const stream = composite.captureStream(BROADCAST_FPS)
        const [videoTrack] = stream.getVideoTracks()
        if (!videoTrack) return
        if (cancelled) { videoTrack.stop(); return }
        await localParticipant.publishTrack(videoTrack, {
          name: TRACK_NAME,
          source: Track.Source.ScreenShare,
          simulcast: false,
        })
        if (cancelled) {
          try { await localParticipant.unpublishTrack(videoTrack) } catch { /* already gone */ }
          videoTrack.stop()
          return
        }
        publishedTrack = videoTrack
        timer = setInterval(drawFrame, Math.round(1000 / BROADCAST_FPS))
        setBroadcasting(true)
      } catch {
        // Publish failed (permissions, disconnect) — stay in local-only mode.
      }
    }
    start()

    return () => {
      cancelled = true
      if (timer) clearInterval(timer)
      if (publishedTrack) {
        const track = publishedTrack
        publishedTrack = null
        Promise.resolve(localParticipant.unpublishTrack(track)).catch(() => {})
        track.stop()
      }
      setBroadcasting(false)
    }
  }, [enabled, localParticipant, containerRef])

  return broadcasting
}
