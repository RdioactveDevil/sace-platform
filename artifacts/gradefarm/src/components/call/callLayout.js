import { Track } from 'livekit-client'

const live = (ref) => !!ref?.publication && !ref.publication.isMuted && !!ref.publication.track

/**
 * Split a room's track references into what the stage shows.
 *  • screen       – the screen share to feature (a remote one wins over our own)
 *  • presenterCam – the camera of whoever is sharing, when it's on
 *  • cameras      – one camera ref (or placeholder) per participant
 */
export function pickStage(tracks, { includeLocal = true } = {}) {
  const refs = includeLocal ? tracks : tracks.filter(t => !t.participant.isLocal)
  const shares = refs.filter(t => t.source === Track.Source.ScreenShare && live(t))
  const screen = shares.find(t => !t.participant.isLocal) || shares[0] || null
  const cameras = refs.filter(t => t.source === Track.Source.Camera)
  const presenterCam = screen
    ? cameras.find(t => t.participant.identity === screen.participant.identity && live(t)) || null
    : null
  return { screen, presenterCam, cameras }
}

export const isLiveTrack = live

/**
 * Largest equal tiles of the given aspect ratio that fit `count` tiles into a
 * width × height box. Returns the column count and the tile size.
 */
export function fitGrid(count, width, height, { aspect = 16 / 9, gap = 12 } = {}) {
  if (!count || width <= 0 || height <= 0) return { cols: 1, tileW: 0, tileH: 0 }
  let best = { cols: 1, tileW: 0, tileH: 0 }
  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols)
    const maxW = (width - gap * (cols - 1)) / cols
    const maxH = (height - gap * (rows - 1)) / rows
    const tileW = Math.min(maxW, maxH * aspect)
    if (tileW > best.tileW) best = { cols, tileW, tileH: tileW / aspect }
  }
  return { cols: best.cols, tileW: Math.floor(best.tileW), tileH: Math.floor(best.tileH) }
}
