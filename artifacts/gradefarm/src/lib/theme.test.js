import { test } from 'node:test'
import assert from 'node:assert/strict'
import { THEMES, PALETTES, paletteById, modeOf, paletteUnlocked, setActivePalette, activePalette } from './theme.js'

test('the eight palettes, each on a light or dark base', () => {
  assert.deepEqual(PALETTES.map(p => p.id), ['light', 'dark', 'midnight', 'paper', 'ocean', 'forest', 'earth', 'gold'])
  assert.equal(modeOf('midnight'), 'dark')
  assert.equal(modeOf('paper'), 'light')
  assert.equal(modeOf('nonsense'), 'light')
  assert.equal(paletteById('nope'), null)
})

test('THEMES answers with the active palette for its own mode only', () => {
  setActivePalette('light')
  const baseDarkBg = THEMES.dark.bg, baseLightBg = THEMES.light.bg
  setActivePalette('midnight')
  assert.equal(activePalette().id, 'midnight')
  assert.equal(THEMES.dark.bg, '#080b1a')
  assert.equal(THEMES.dark.danger, THEMES.dark.danger) // base keys still there
  assert.ok(THEMES.dark.danger)
  assert.equal(THEMES.light.bg, baseLightBg)
  setActivePalette('paper')
  assert.equal(THEMES.light.bg, '#f5efe3')
  assert.equal(THEMES.dark.bg, baseDarkBg)
  setActivePalette('unknown')
  assert.equal(activePalette(), null)
  assert.equal(THEMES.light.bg, baseLightBg)
})

test('every palette defines the same keys as its base', () => {
  setActivePalette(null)
  for (const p of PALETTES) {
    setActivePalette(p.id)
    const keys = Object.keys(THEMES[p.mode])
    for (const k of Object.keys(p.tokens || {})) assert.ok(keys.includes(k), `${p.id}.${k}`)
  }
  setActivePalette(null)
})

test('Gold opens at Silver rank, and always for staff', () => {
  const gold = paletteById('gold')
  assert.equal(paletteUnlocked(gold, { level: 2 }), false)
  assert.equal(paletteUnlocked(gold, { level: 3 }), true)
  assert.equal(paletteUnlocked(gold, { level: 0, staff: true }), true)
  assert.equal(paletteUnlocked(paletteById('ocean')), true)
})
