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

  test(`${file} shows participant video tiles beside the whiteboard`, () => {
    const source = readComponent(file)

    assert.match(source, /CarouselLayout/)
    assert.match(source, /<CarouselLayout tracks=\{tracks\}/)
    assert.match(source, /className="gf-whiteboard-split"/)
    assert.match(source, /className="gf-video-rail"/)
    assert.match(source, /\.gf-whiteboard-split\s*\{/)
    assert.match(source, /\.gf-video-rail\s*\{/)
  })

  test(`${file} publishes tutor whiteboard to the room via LiveKit screen share`, () => {
    const source = readComponent(file)

    assert.match(source, /useWhiteboardScreenShare\(/)
    assert.match(source, /whiteboardCaptureRef/)
    assert.match(source, /captureRootRef:\s*whiteboardCaptureRef/)
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
}

test('../hooks/useWhiteboardScreenShare.js captures Excalidraw canvas as LiveKit screen share', () => {
  const hookPath = resolve(import.meta.dirname, '../hooks/useWhiteboardScreenShare.js')
  const source = readFileSync(hookPath, 'utf8')
  assert.match(source, /captureStream/)
  assert.match(source, /Track\.Source\.ScreenShare/)
  assert.match(source, /WHITEBOARD_SCREEN_SHARE_NAME/)
  assert.match(source, /shouldPublish/)
})

test('../hooks/useLiveKitJoinOverlay.js latches after in-room LiveKit states', () => {
  const hookPath = resolve(import.meta.dirname, '../hooks/useLiveKitJoinOverlay.js')
  const source = readFileSync(hookPath, 'utf8')
  assert.match(source, /ConnectionState\.SignalReconnecting/)
  assert.match(source, /setHandshakeObserved/)
})
