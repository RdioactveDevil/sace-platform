import { useEffect, useMemo, useRef, useState, useLayoutEffect } from 'react'
import { LiveKitRoom, RoomAudioRenderer, VideoTrack, useRoomContext, useTracks } from '@livekit/components-react'
import { RoomEvent, Track } from 'livekit-client'
import { MonitorUp } from 'lucide-react'
import VideoTile, { TILE_CSS } from '../components/call/VideoTile'
import { pickStage, fitGrid } from '../components/call/callLayout'

// LiveKit Egress opens this page in headless Chrome with ?url=&token=&layout=
// and records whatever it renders. Recording starts when the page logs
// START_RECORDING and stops on END_RECORDING (the @livekit/egress-sdk protocol).
const params = new URLSearchParams(window.location.search)
const serverUrl = params.get('url')
const token = params.get('token')

const startRecording = () => console.log('START_RECORDING')
const endRecording = () => console.log('END_RECORDING')

const PAD = 24
const GAP = 16

function useSize(ref) {
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const ro = new ResizeObserver(([e]) => setSize({ width: e.contentRect.width, height: e.contentRect.height }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return size
}

/** Start recording once there's something to record (or after a short wait). */
function useRecordingLifecycle() {
  const room = useRoomContext()
  useEffect(() => {
    let started = false
    const start = () => { if (!started) { started = true; startRecording() } }
    const hasTracks = [...room.remoteParticipants.values()].some(p => p.trackPublications.size > 0)
    if (hasTracks) start()
    room.on(RoomEvent.TrackSubscribed, start)
    const fallback = setTimeout(start, 10_000)
    room.on(RoomEvent.Disconnected, endRecording)
    return () => {
      clearTimeout(fallback)
      room.off(RoomEvent.TrackSubscribed, start)
      room.off(RoomEvent.Disconnected, endRecording)
    }
  }, [room])
}

/**
 * The recorded frame. With a screen share (or the tutor's whiteboard, which is
 * broadcast as one) the share fills the frame and the presenter's camera sits
 * in a small box in the corner. Otherwise everyone's camera in equal tiles.
 */
export function RecordingStage({ tracks }) {
  const boxRef = useRef(null)
  const { width, height } = useSize(boxRef)
  // The recorder joins as a hidden participant; never show it.
  const { screen, presenterCam, cameras } = useMemo(() => pickStage(tracks, { includeLocal: false }), [tracks])
  const grid = fitGrid(cameras.length, width - PAD * 2, height - PAD * 2, { gap: GAP })
  const pipW = Math.round(Math.min(360, width * 0.2))

  return (
    <div ref={boxRef} className="gf-rec">
      <style>{TILE_CSS + REC_CSS}</style>
      {screen ? (
        <>
          <VideoTrack trackRef={screen} className="gf-rec-screen" />
          {presenterCam && (
            <VideoTile trackRef={presenterCam} compact style={{ position: 'absolute', right: PAD, bottom: PAD, width: pipW, boxShadow: '0 12px 32px rgba(0,0,0,0.55)', border: '2px solid rgba(255,255,255,0.18)' }} />
          )}
          {!presenterCam && (
            <div className="gf-tile-name" style={{ left: PAD, bottom: PAD }}>
              <MonitorUp size={12} aria-hidden="true" /><span>{screen.participant.name || screen.participant.identity}</span>
            </div>
          )}
        </>
      ) : cameras.length > 0 ? (
        <div className="gf-rec-grid" style={{ gridTemplateColumns: `repeat(${grid.cols}, ${grid.tileW}px)` }}>
          {cameras.map(ref => (
            <VideoTile key={ref.participant.identity} trackRef={ref} style={{ width: grid.tileW }} />
          ))}
        </div>
      ) : (
        <div className="gf-rec-waiting">gradefarm.</div>
      )}
    </div>
  )
}

function RecorderRoom() {
  useRecordingLifecycle()
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: true },
  )
  return (
    <>
      <RecordingStage tracks={tracks} />
      <RoomAudioRenderer />
    </>
  )
}

export default function RecordingApp() {
  if (!serverUrl || !token) {
    return <div style={{ color: '#9aa0bf', fontFamily: 'sans-serif', padding: 24 }}>Missing url/token — this page is opened by the recorder.</div>
  }
  return (
    <LiveKitRoom
      serverUrl={serverUrl}
      token={token}
      connect
      audio={false}
      video={false}
      options={{ adaptiveStream: false, dynacast: false }}
      style={{ width: '100%', height: '100%' }}
    >
      <RecorderRoom />
    </LiveKitRoom>
  )
}

const REC_CSS = `
  .gf-rec { position: relative; width: 100%; height: 100%; overflow: hidden; background: #0a0c1a; font-family: 'Plus Jakarta Sans', sans-serif; display: flex; align-items: center; justify-content: center; }
  .gf-rec-screen { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; background: #000; }
  .gf-rec-grid { display: grid; gap: ${GAP}px; justify-content: center; align-content: center; }
  .gf-rec-waiting { color: #f1be43; font-size: 42px; font-weight: 800; opacity: 0.5; }
`
