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
    assert.doesNotMatch(
      source,
      /\.gf-whiteboard-surface\s+\.tlui-layout[\s\S]*?z-index:\s*30\s*!important/
    )
  })

  test(`${file} keeps the Tldraw canvas mounted through room updates`, () => {
    const source = readComponent(file)

    assert.match(source, /const WHITEBOARD_OPTIONS = Object\.freeze/)
    assert.match(source, /maxFontsToLoadBeforeRender:\s*0/)
    assert.match(source, /function WhiteboardSurface\(\)/)
    assert.match(source, /<Tldraw options=\{WHITEBOARD_OPTIONS\}/)
    assert.match(source, /\.gf-whiteboard-surface\s+\.tl-container\s*\{/)
    assert.match(source, /position:\s*absolute\s*!important;/)
    assert.match(source, /inset:\s*0\s*!important;/)
  })

  test(`${file} keeps the call stage visible during LiveKit signal reconnect`, () => {
    const source = readComponent(file)
    assert.match(source, /ConnectionState\.SignalReconnecting/)
  })
}
