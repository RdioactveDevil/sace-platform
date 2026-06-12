import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const files = [
  '../components/SessionRoom.jsx',
  '../components/RecurringRoomPage.jsx',
]

function readComponent(relativePath) {
  return readFileSync(resolve(import.meta.dirname, relativePath), 'utf8')
}

for (const file of files) {
  test(`${file} constrains video calls to the viewport`, () => {
    const source = readComponent(file)

    assert.match(source, /useCallViewportLock\(\)/)
    assert.match(source, /document\.documentElement\.style\.overflow = 'hidden'/)
    assert.match(source, /document\.body\.style\.overflow = 'hidden'/)
    assert.match(source, /root\.style\.height = '100dvh'/)
    assert.match(source, /height:\s*'100dvh'/)
    assert.match(source, /maxHeight:\s*'100dvh'/)
    assert.match(source, /overflow:\s*'hidden'/)
    assert.match(source, /\.lk-video-conference\s*\{/)
    assert.match(source, /min-height:\s*0\s*!important;/)
  })

  test(`${file} gives LiveKit toolbar buttons contrast from the toolbar`, () => {
    const source = readComponent(file)

    assert.doesNotMatch(source, /<VideoConference/)
    assert.match(source, /function CallStage\(/)
    assert.match(source, /<GridLayout tracks=\{tracks\}/)
    assert.match(source, /<TrackToggle source=\{Track\.Source\.Microphone\}/)
    assert.match(source, /<TrackToggle source=\{Track\.Source\.Camera\}/)
    assert.match(source, /<TrackToggle source=\{Track\.Source\.ScreenShare\}/)
    assert.match(source, /className="gf-call-dock"/)
    assert.match(source, /\.gf-dock-button\s*\{/)
    assert.match(source, /\.gf-dock-button\[aria-pressed="true"\]/)
  })

  test(`${file} keeps whiteboard controls unobstructed`, () => {
    const source = readComponent(file)

    assert.doesNotMatch(source, /Back to video/)
    assert.match(source, /memo\(function WhiteboardSurface\(\)/)
    assert.match(source, /className="gf-whiteboard-frame"/)
    assert.match(source, /\.gf-whiteboard-frame\s*\{/)
    assert.match(source, /className="gf-whiteboard-surface"/)
    assert.match(source, /\.gf-whiteboard-surface\s*\{/)
    assert.match(source, /overflow:\s*visible;/)
    assert.match(source, /height:\s*100%\s*!important;/)
    assert.match(source, /\.gf-call-surface--whiteboard/)
  })

  test(`${file} embeds Excalidraw for the whiteboard`, () => {
    const source = readComponent(file)

    assert.match(source, /from '@excalidraw\/excalidraw'/)
    assert.match(source, /@excalidraw\/excalidraw\/index\.css/)
    assert.match(source, /function WhiteboardSurface\(\)/)
    assert.match(source, /<Excalidraw /)
    assert.match(source, /\.gf-whiteboard-surface\s+\.excalidraw\s*\{/)
    assert.match(source, /position:\s*absolute\s*!important;/)
    assert.match(source, /inset:\s*0\s*!important;/)
  })

  test(`${file} uses latched LiveKit join overlay so mid-session flashes do not cover the whiteboard`, () => {
    const source = readComponent(file)
    assert.match(source, /useLiveKitJoinOverlay\(/)
    assert.match(source, /showJoinOverlay/)
  })

  test(`${file} keeps participant videos visible beside the whiteboard`, () => {
    const source = readComponent(file)

    assert.match(source, /CarouselLayout,/)
    assert.match(source, /className="gf-wb-layout"/)
    assert.match(source, /\.gf-wb-layout\s*\{/)
    assert.match(source, /className="gf-wb-rail"/)
    assert.match(source, /\.gf-wb-rail\s*\{/)
    assert.match(source, /<CarouselLayout tracks=\{cameraTracks\}/)
    // Rail shows cameras only — the tutor's whiteboard share must not echo into it.
    assert.match(source, /tracks\.filter\(t => t\.source === Track\.Source\.Camera\)/)
    // Mobile: rail drops to a horizontal strip under the board.
    assert.match(source, /\.gf-wb-layout\s*\{\s*inset:[^}]*flex-direction:\s*column/)
  })

  test(`${file} broadcasts the tutor's whiteboard as a screen-share track`, () => {
    const source = readComponent(file)

    assert.match(source, /from '\.\.\/hooks\/useWhiteboardBroadcast'/)
    assert.match(source, /useWhiteboardBroadcast\(whiteboardFrameRef, isTutor && showWhiteboard\)/)
    assert.match(source, /ref=\{whiteboardFrameRef\}/)
    // Tutor sees a live indicator on the board.
    assert.match(source, /gf-wb-live-pill/)
    // Manual screen share is locked out while the whiteboard is broadcasting.
    assert.match(source, /disabled=\{isTutor && showWhiteboard\}/)
  })
}

test('../hooks/useWhiteboardBroadcast.js publishes a composited Excalidraw canvas over LiveKit', () => {
  const hookPath = resolve(import.meta.dirname, '../hooks/useWhiteboardBroadcast.js')
  const source = readFileSync(hookPath, 'utf8')

  // Composites every Excalidraw layer (committed scene + in-progress stroke).
  assert.match(source, /getElementsByClassName\('excalidraw__canvas'\)/)
  assert.match(source, /captureStream\(BROADCAST_FPS\)/)
  // Publishes as a screen share so receivers and egress recording need no changes.
  assert.match(source, /source: Track\.Source\.ScreenShare/)
  assert.match(source, /name: TRACK_NAME/)
  // Takes over any active desktop share, Zoom-style.
  assert.match(source, /setScreenShareEnabled\(false\)/)
  // Fixed-rate redraw keeps frames flowing while the board is static.
  assert.match(source, /setInterval\(drawFrame/)
  // Cleans up the published track when the board closes or the room unmounts.
  assert.match(source, /unpublishTrack\(/)
  assert.match(source, /track\.stop\(\)/)
})

test('../hooks/useLiveKitJoinOverlay.js latches after in-room LiveKit states', () => {
  const hookPath = resolve(import.meta.dirname, '../hooks/useLiveKitJoinOverlay.js')
  const source = readFileSync(hookPath, 'utf8')
  assert.match(source, /ConnectionState\.SignalReconnecting/)
  assert.match(source, /setHandshakeObserved/)
})
