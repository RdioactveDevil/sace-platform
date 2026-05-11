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

    assert.match(source, /height:\s*'100dvh'/)
    assert.match(source, /maxHeight:\s*'100dvh'/)
    assert.match(source, /overflow:\s*'hidden'/)
    assert.match(source, /\.lk-video-conference\s*\{/)
    assert.match(source, /min-height:\s*0\s*!important;/)
  })

  test(`${file} gives LiveKit toolbar buttons contrast from the toolbar`, () => {
    const source = readComponent(file)

    assert.match(source, /\.lk-control-bar\s+\.lk-button\s*\{/)
    assert.match(source, /background:\s*#23233a\s*!important;/)
    assert.match(source, /border:\s*1px solid #3a3a58\s*!important;/)
    assert.match(source, /\.lk-control-bar\s+\.lk-button:hover\s*\{/)
    assert.match(source, /\.lk-control-bar\s+\.lk-button\[aria-pressed="true"\]/)
  })
}
