import { VideoTrack, useIsSpeaking, useIsMuted } from '@livekit/components-react'
import { Track } from 'livekit-client'
import { MicOff } from 'lucide-react'
import { isLiveTrack } from './callLayout'

const PALETTE = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6', '#ef4444']

function nameOf(participant) {
  return participant?.name || participant?.identity || 'Guest'
}

function initials(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] || '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

function colourFor(name) {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return PALETTE[h % PALETTE.length]
}

/**
 * One participant's camera (or an initials card when it's off), always 16:9
 * so every tile in a layout has the same shape. Also used by the recording
 * page, so it has no dependency on the app's theme.
 */
export default function VideoTile({ trackRef, style, compact = false, showName = true }) {
  const participant = trackRef.participant
  const name = nameOf(participant)
  const speaking = useIsSpeaking(participant)
  const micMuted = useIsMuted({ participant, source: Track.Source.Microphone })
  const hasVideo = isLiveTrack(trackRef)
  const self = participant.isLocal

  return (
    <div className={speaking ? 'gf-tile gf-tile--speaking' : 'gf-tile'} style={style}>
      {hasVideo ? (
        <VideoTrack trackRef={trackRef} className="gf-tile-video" style={self ? { transform: 'scaleX(-1)' } : undefined} />
      ) : (
        <div className="gf-tile-placeholder">
          <span className="gf-tile-avatar" style={{ background: colourFor(name), width: compact ? 40 : 72, height: compact ? 40 : 72, fontSize: compact ? 15 : 26 }}>
            {initials(name)}
          </span>
        </div>
      )}
      {showName && (
        <div className="gf-tile-name">
          {micMuted && <MicOff size={12} aria-label="Muted" />}
          <span>{self ? `${name} (you)` : name}</span>
        </div>
      )}
    </div>
  )
}

/** Styles shared by the call and the recording page. */
export const TILE_CSS = `
  .gf-tile { position: relative; overflow: hidden; border-radius: 14px; background: #161a2e; border: 1px solid rgba(255,255,255,0.08); box-shadow: 0 0 0 0 transparent; transition: box-shadow 0.15s, border-color 0.15s; aspect-ratio: 16 / 9; }
  .gf-tile--speaking { border-color: #f1be43; box-shadow: 0 0 0 2px rgba(241,190,67,0.55); }
  .gf-tile-video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; background: #0b0d1a; }
  .gf-tile-placeholder { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: radial-gradient(circle at 50% 40%, #1f2440, #12152a); }
  .gf-tile-avatar { display: inline-flex; align-items: center; justify-content: center; border-radius: 50%; color: #fff; font-weight: 800; letter-spacing: 0.02em; }
  .gf-tile-name { position: absolute; left: 8px; bottom: 8px; max-width: calc(100% - 16px); display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 7px; background: rgba(6,8,20,0.72); color: #f5f6ff; font-size: 12px; font-weight: 700; line-height: 1.4; }
  .gf-tile-name span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .gf-tile-name svg { color: #f87171; flex-shrink: 0; }
`
