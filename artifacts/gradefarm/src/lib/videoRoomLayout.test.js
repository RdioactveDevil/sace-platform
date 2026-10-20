import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { pickStage, fitGrid } from '../components/call/callLayout.js'

function readComponent(relativePath) {
  return readFileSync(resolve(import.meta.dirname, relativePath), 'utf8')
}

const CALL = '../components/call/CallRoom.jsx'

for (const file of ['../components/SessionRoom.jsx', '../components/RecurringRoomPage.jsx']) {
  test(`${file} renders the shared call room`, () => {
    const source = readComponent(file)
    assert.match(source, /import RoomFrame from '\.\/call\/RoomFrame'/)
    assert.match(source, /<RoomFrame/)
    assert.doesNotMatch(source, /<VideoConference/)
  })
}

test('RoomFrame locks the call to the viewport', () => {
  const frame = readComponent('../components/call/RoomFrame.jsx')
  assert.match(frame, /useCallViewportLock\(\)/)
  assert.match(frame, /height: '100dvh', maxHeight: '100dvh', overflow: 'hidden'/)
  const call = readComponent(CALL)
  assert.match(call, /\[document\.documentElement, \{ height: '100%', overflow: 'hidden' \}\]/)
  assert.match(call, /\[document\.body, \{ height: '100dvh', maxHeight: '100dvh', overflow: 'hidden' \}\]/)
  assert.match(call, /\[root, \{ height: '100dvh', maxHeight: '100dvh', overflow: 'hidden' \}\]/)
})

test('call controls use our own dock with clear on/off states', () => {
  const source = readComponent(CALL)
  assert.match(source, /source=\{Track\.Source\.Microphone\}/)
  assert.match(source, /source=\{Track\.Source\.Camera\}/)
  assert.match(source, /source=\{Track\.Source\.ScreenShare\}/)
  assert.match(source, /className="gf-dock"/)
  assert.match(source, /\.gf-dock-btn--off\s*\{/)
  assert.match(source, /\.gf-dock-btn--on\s*\{/)
})

test('whiteboard embeds Excalidraw without clipping its menus', () => {
  const source = readComponent(CALL)
  assert.doesNotMatch(source, /Back to video/)
  assert.match(source, /from '@excalidraw\/excalidraw'/)
  assert.match(source, /@excalidraw\/excalidraw\/index\.css/)
  assert.match(source, /memo\(function WhiteboardSurface\(\)/)
  assert.match(source, /<Excalidraw /)
  assert.match(source, /\.gf-feature--board \{ overflow: visible;/)
  assert.match(source, /\.gf-whiteboard-surface \{[^}]*overflow: visible;/)
  assert.match(source, /\.gf-whiteboard-surface \.excalidraw \{ position: absolute !important; inset: 0 !important;/)
})

test('join overlay is latched so mid-session flashes do not cover the whiteboard', () => {
  const source = readComponent(CALL)
  assert.match(source, /useLiveKitJoinOverlay\(/)
  assert.match(source, /showJoinOverlay/)
})

test("tutor's whiteboard is broadcast as a screen share with cameras kept beside it", () => {
  const source = readComponent(CALL)
  assert.match(source, /from '\.\.\/\.\.\/hooks\/useWhiteboardBroadcast'/)
  assert.match(source, /useWhiteboardBroadcast\(whiteboardFrameRef, isTutor && showWhiteboard\)/)
  assert.match(source, /ref=\{whiteboardFrameRef\}/)
  assert.match(source, /gf-board-pill/)
  // Manual screen share is locked out while the whiteboard is broadcasting.
  assert.match(source, /disabled=\{isTutor && showWhiteboard\}/)
  // Camera rail beside the board / share; a strip under it on phones.
  assert.match(source, /\{featured && <CameraRail cameras=\{cameras\} \/>\}/)
  assert.match(source, /\.gf-stage--featured \{ flex-direction: column; \}/)
})

// ── Layout maths shared by the call and the recording ─────────────────────────

const person = (identity, isLocal = false) => ({ identity, isLocal })
const ref = (participant, source, live = true) => ({
  participant, source,
  publication: live ? { isMuted: false, track: {} } : undefined,
})

test('pickStage features a screen share with the sharer\'s camera as the presenter', () => {
  const tutor = person('tutor'), student = person('student')
  const tracks = [ref(tutor, 'camera'), ref(student, 'camera'), ref(tutor, 'screen_share')]
  const { screen, presenterCam, cameras } = pickStage(tracks)
  assert.equal(screen.participant, tutor)
  assert.equal(presenterCam.participant, tutor)
  assert.equal(presenterCam.source, 'camera')
  assert.equal(cameras.length, 2)
})

test('pickStage prefers a remote share and can leave out the local participant', () => {
  const me = person('me', true), other = person('other')
  const tracks = [ref(me, 'screen_share'), ref(other, 'screen_share'), ref(me, 'camera'), ref(other, 'camera', false)]
  assert.equal(pickStage(tracks).screen.participant, other)
  // The sharer's camera is off → no presenter box.
  assert.equal(pickStage(tracks).presenterCam, null)
  const recorder = pickStage(tracks, { includeLocal: false })
  assert.deepEqual(recorder.cameras.map(c => c.participant.identity), ['other'])
})

test('pickStage without a share shows cameras only', () => {
  const { screen, presenterCam, cameras } = pickStage([ref(person('a'), 'camera'), ref(person('b'), 'camera', false)])
  assert.equal(screen, null)
  assert.equal(presenterCam, null)
  assert.equal(cameras.length, 2, 'cameras that are off still get a (placeholder) tile')
})

test('fitGrid gives every tile the same 16:9 size and fills the box', () => {
  const one = fitGrid(1, 1600, 900, { gap: 0 })
  assert.deepEqual(one, { cols: 1, tileW: 1600, tileH: 900 })
  const two = fitGrid(2, 1600, 900, { gap: 16 })
  assert.equal(two.cols, 2)
  assert.equal(two.tileW, 792)
  assert.ok(Math.abs(two.tileW / two.tileH - 16 / 9) < 0.01)
  // Tall box → stack instead.
  assert.equal(fitGrid(2, 600, 900, { gap: 16 }).cols, 1)
  const four = fitGrid(4, 1600, 900, { gap: 16 })
  assert.equal(four.cols, 2)
  assert.ok(four.tileW * 2 + 16 <= 1600 && four.tileH * 2 + 16 <= 900)
  assert.deepEqual(fitGrid(0, 100, 100), { cols: 1, tileW: 0, tileH: 0 })
})

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
