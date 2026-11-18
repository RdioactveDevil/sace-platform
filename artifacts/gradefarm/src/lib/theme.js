export const FONTS = {
  display: "'Sifonn Pro', sans-serif",
  body:    "'Plus Jakarta Sans', 'Segoe UI', sans-serif",
  mono:    "'JetBrains Mono', monospace",
}

// The two base themes. Every palette below is one of these with its own colours.
const BASE = {
  dark: {
    // Graphite: neutral greys with no blue in them. Each layer is a step
    // lighter (window, page, card); depth comes from that, not shadows.
    bg:           '#18181b',
    bgCard:       '#1f1f23',
    bgNav:        '#111113',
    bgInput:      '#1f1f23',
    bgHover:      '#2a2a30',
    bgSubtle:     '#1c1c20',
    bgElevated:   '#26262b',

    // Borders
    border:       '#2a2a30',
    borderMid:    '#36363d',
    borderStrong: '#45454d',
    borderAccent: 'rgba(226,181,76,0.28)',
    borderNav:    'rgba(255,255,255,0.06)',

    // Text — off-white, never pure white
    text:         '#ececef',
    textSub:      '#d4d4d8',
    textMuted:    '#a1a1aa',
    textFaint:    '#71717a',

    // Gold accent, a touch softer than the light theme's so it doesn't glow
    accent:       '#e2b54c',
    accentLight:  '#ecc96e',
    accentBlue:   '#e2b54c',
    accentGlow:   'rgba(226,181,76,0.12)',
    accentGlow2:  'rgba(226,181,76,0.07)',

    // XP & gamification
    xp:           '#e2b54c',
    // Gold for text and small labels (readable on this theme's background)
    goldText:     '#e2b54c',

    // Status colours, turned down so lists of scores don't light up
    danger:       '#e5736f',
    dangerBg:     'rgba(229,115,111,0.10)',
    success:      '#5bb98c',
    successBg:    'rgba(91,185,140,0.10)',
    purple:       '#a89ad9',
    purpleBg:     'rgba(168,154,217,0.10)',
    blue:         '#7fa7d9',
    blueBg:       'rgba(127,167,217,0.10)',

    // Shadows: cards have none in dark mode; only floating things get one
    shadowCard:   'none',
    shadowGold:   '0 4px 20px rgba(241,190,67,0.30)',
    shadowModal:  '0 32px 80px rgba(0,0,0,0.65)',
  },
  light: {
    // Light mode — navy sidebar, clean white content
    bg:           '#f8f9ff',
    bgCard:       '#ffffff',
    bgNav:        '#080d28',
    bgInput:      '#f8f9ff',
    bgHover:      '#f0f2ff',
    bgSubtle:     '#f0f2ff',
    bgElevated:   '#ffffff',

    // Borders
    border:       '#e2e6f0',
    borderMid:    '#c8cee0',
    borderStrong: '#b0b8d0',
    borderAccent: 'rgba(241,190,67,0.40)',
    borderNav:    'rgba(255,255,255,0.08)',

    // Text
    text:         '#0c1037',
    textSub:      '#1e2a5e',
    textMuted:    '#64748b',
    textFaint:    '#94a3b8',

    // Gold (same in light, sidebar stays dark)
    accent:       '#f1be43',
    accentLight:  '#f9d87a',
    accentBlue:   '#0c1037',
    accentGlow:   'rgba(241,190,67,0.12)',
    accentGlow2:  'rgba(241,190,67,0.06)',

    // XP slightly deeper in light mode for contrast
    xp:           '#c9970f',
    // Gold for text and small labels: brand gold is too pale to read on white
    goldText:     '#a16207',

    // Status colours — slightly deeper for contrast on white
    danger:       '#dc2626',
    dangerBg:     'rgba(220,38,38,0.08)',
    success:      '#059669',
    successBg:    'rgba(5,150,105,0.08)',
    purple:       '#6d28d9',
    purpleBg:     'rgba(109,40,217,0.08)',
    blue:         '#2563eb',
    blueBg:       'rgba(37,99,235,0.08)',

    // Shadows — navy-tinted
    shadowCard:   '0 2px 12px rgba(12,16,55,0.08)',
    shadowGold:   '0 4px 20px rgba(241,190,67,0.30)',
    shadowModal:  '0 32px 80px rgba(12,16,55,0.25)',

    // Light mode extras
    contentText:  '#0c1037',
  }
}

// ── Palettes ──────────────────────────────────────────────────────────────────
// What a student picks in "Make gradefarm yours" (components/ThemeCard.jsx) or
// Account → Appearance. Each is a light or dark base (`mode`) with its own
// colours over it, and its own sidebar (`shell`, see shellColors in App.jsx).
// The app still asks `theme === 'dark'` in places, so `theme` stays the base
// mode; THEMES.dark / THEMES.light return the active palette's colours when it
// is that mode (setActivePalette, called by App as the palette changes).
// `locked`: the rank (RANK_TIERS index) that unlocks it.
export const PALETTES = [
  { id: 'light', name: 'Light', mode: 'light' },
  { id: 'dark', name: 'Dark', mode: 'dark' },
  { id: 'midnight', name: 'Midnight', mode: 'dark',
    tokens: {
      bg: '#080b1a', bgCard: '#10152b', bgNav: '#050713', bgInput: '#10152b', bgHover: '#1a2140', bgSubtle: '#0d1124', bgElevated: '#161c36',
      border: '#1d2442', borderMid: '#283058', borderStrong: '#353e6c', borderAccent: 'rgba(241,190,67,0.30)',
      text: '#eef1fa', textSub: '#d3d8ec', textMuted: '#a2a9c4', textFaint: '#737b9c',
      accent: '#f1be43', accentLight: '#f9d87a', accentBlue: '#f1be43', accentGlow: 'rgba(241,190,67,0.12)', accentGlow2: 'rgba(241,190,67,0.07)',
      xp: '#f1be43', goldText: '#f1be43', success: '#6fd3a0', successBg: 'rgba(111,211,160,0.12)',
    },
    shell: { bg: '#050713', raise: '#10152b', hover: 'rgba(255,255,255,0.04)', line: '#1d2442', fg: '#eef1fa', sub: '#a2a9c4', dim: '#8189a9', icon: '#f1be43', menuShadow: '0 12px 32px rgba(0,0,0,0.6)' } },
  { id: 'paper', name: 'Paper', mode: 'light',
    tokens: {
      bg: '#f5efe3', bgCard: '#fffcf5', bgInput: '#fffaf0', bgHover: '#efe6d4', bgSubtle: '#f1e9d8', bgElevated: '#fffcf5',
      border: '#e3d8c2', borderMid: '#d4c6aa', borderStrong: '#c2b291', borderAccent: 'rgba(211,155,42,0.40)',
      text: '#2b2418', textSub: '#3e3423', textMuted: '#6b604f', textFaint: '#9a8d78', contentText: '#2b2418',
      accent: '#e0a93a', accentLight: '#f0c871', accentBlue: '#2b2418', xp: '#a87412', goldText: '#8a5a0a',
      shadowCard: '0 2px 12px rgba(60,40,10,0.08)', shadowModal: '0 32px 80px rgba(60,40,10,0.22)',
    },
    shell: { bg: '#ece3d1', raise: '#fffcf5', hover: '#e4d9c3', line: '#e3d8c2', fg: '#2b2418', sub: '#5a4f3e', dim: '#7a6d58', icon: '#8a5a0a', menuShadow: '0 12px 32px rgba(60,40,10,0.14)' } },
  { id: 'ocean', name: 'Ocean', mode: 'light',
    tokens: {
      bg: '#eef5f8', bgCard: '#ffffff', bgInput: '#f4f9fb', bgHover: '#e3f0f5', bgSubtle: '#e8f2f6', bgElevated: '#ffffff',
      border: '#cfe2ea', borderMid: '#b4d0dc', borderStrong: '#97bccb', borderAccent: 'rgba(79,179,214,0.45)',
      text: '#0b2b3a', textSub: '#15394a', textMuted: '#46636f', textFaint: '#7d97a2', contentText: '#0b2b3a',
      accent: '#4fb3d6', accentLight: '#86cde6', accentBlue: '#0b2b3a', accentGlow: 'rgba(79,179,214,0.14)', accentGlow2: 'rgba(79,179,214,0.07)',
      xp: '#0e7fa5', goldText: '#0e6a8a', shadowCard: '0 2px 12px rgba(11,43,58,0.08)', shadowModal: '0 32px 80px rgba(11,43,58,0.22)',
    },
    shell: { bg: '#dcebf1', raise: '#ffffff', hover: '#d0e4ec', line: '#cfe2ea', fg: '#0b2b3a', sub: '#3d5a66', dim: '#5e7883', icon: '#0e6a8a', menuShadow: '0 12px 32px rgba(11,43,58,0.14)' } },
  { id: 'forest', name: 'Forest', mode: 'dark',
    tokens: {
      bg: '#10241a', bgCard: '#173224', bgNav: '#0a1912', bgInput: '#173224', bgHover: '#21402f', bgSubtle: '#132b1f', bgElevated: '#1d3b2b',
      border: '#24473a', borderMid: '#2e5646', borderStrong: '#3b6a57', borderAccent: 'rgba(124,201,140,0.30)',
      text: '#e9f3eb', textSub: '#d0e3d5', textMuted: '#a3c0aa', textFaint: '#76927d',
      accent: '#7cc98c', accentLight: '#a3dbaf', accentBlue: '#7cc98c', accentGlow: 'rgba(124,201,140,0.12)', accentGlow2: 'rgba(124,201,140,0.07)',
      success: '#8fd89e', successBg: 'rgba(143,216,158,0.12)',
    },
    shell: { bg: '#0a1912', raise: '#173224', hover: 'rgba(255,255,255,0.04)', line: '#24473a', fg: '#e9f3eb', sub: '#a3c0aa', dim: '#86a38d', icon: '#7cc98c', menuShadow: '0 12px 32px rgba(0,0,0,0.5)' } },
  { id: 'earth', name: 'Earth', mode: 'dark',
    tokens: {
      bg: '#251a13', bgCard: '#32241a', bgNav: '#1a120d', bgInput: '#32241a', bgHover: '#3f2e22', bgSubtle: '#2b1f17', bgElevated: '#3d2c20',
      border: '#4a3627', borderMid: '#5a4331', borderStrong: '#6c523e', borderAccent: 'rgba(217,137,74,0.32)',
      text: '#f4e9dd', textSub: '#e4d4c3', textMuted: '#c4ae99', textFaint: '#957e69',
      accent: '#d9894a', accentLight: '#e8a873', accentBlue: '#d9894a', accentGlow: 'rgba(217,137,74,0.14)', accentGlow2: 'rgba(217,137,74,0.07)',
      goldText: '#e8b25c', success: '#a9d38f', successBg: 'rgba(169,211,143,0.12)',
    },
    shell: { bg: '#1a120d', raise: '#32241a', hover: 'rgba(255,255,255,0.04)', line: '#4a3627', fg: '#f4e9dd', sub: '#c4ae99', dim: '#a48d78', icon: '#d9894a', menuShadow: '0 12px 32px rgba(0,0,0,0.5)' } },
  { id: 'gold', name: 'Gold', mode: 'light', locked: 3,
    tokens: {
      bg: '#fbf6e8', bgCard: '#fffdf6', bgNav: '#0c1037', bgInput: '#fffaf0', bgHover: '#f5ecd2', bgSubtle: '#f7efd6', bgElevated: '#fffdf6',
      border: '#ecdfb8', borderMid: '#dccb94', borderStrong: '#c9b46f', borderAccent: 'rgba(224,169,26,0.45)',
      text: '#241c05', textSub: '#3a2e0b', textMuted: '#6b5a2a', textFaint: '#9c8a55', contentText: '#241c05',
      accent: '#e0a91a', accentLight: '#f0c654', xp: '#a87700', goldText: '#8a6200',
      shadowCard: '0 2px 12px rgba(90,70,10,0.10)', shadowModal: '0 32px 80px rgba(90,70,10,0.25)',
    },
    shell: { bg: '#0c1037', raise: '#161c4a', hover: 'rgba(255,255,255,0.05)', line: '#232a63', fg: '#f7e7b6', sub: '#d4c48e', dim: '#b5a676', icon: '#f1be43', menuShadow: '0 12px 32px rgba(0,0,0,0.35)' } },
]

const PALETTE_BY_ID = Object.fromEntries(PALETTES.map(p => [p.id, p]))

/** A palette by id (unknown ids: null). */
export const paletteById = (id) => PALETTE_BY_ID[id] || null

/** The base mode ('dark' | 'light') a palette sits on; unknown ids count as light. */
export const modeOf = (id) => PALETTE_BY_ID[id]?.mode || 'light'

/**
 * Whether a palette is open to this student: one with a rank lock needs that
 * rank (`level`, a RANK_TIERS index); staff see everything.
 */
export const paletteUnlocked = (p, { level = 0, staff = false } = {}) => !p?.locked || staff || level >= p.locked

let activeId = null
const merged = new Map()

/** Make `id` the palette THEMES.dark / THEMES.light answer with. */
export function setActivePalette(id) { activeId = PALETTE_BY_ID[id] ? id : null }

/** The palette in use (null before App sets one). */
export const activePalette = () => (activeId ? PALETTE_BY_ID[activeId] : null)

function tokensFor(mode) {
  const p = activePalette()
  if (!p?.tokens || p.mode !== mode) return BASE[mode]
  if (!merged.has(p.id)) merged.set(p.id, { ...BASE[p.mode], ...p.tokens })
  return merged.get(p.id)
}

// The sidebar's window colours for each base mode (App.jsx shellColors);
// a palette with a `shell` brings its own.
const SHELL = {
  dark: { bg: '#111113', raise: '#1f1f23', hover: 'rgba(255,255,255,0.04)', line: '#2a2a30', fg: '#ececef', sub: '#a1a1aa', dim: '#8a8a94', icon: '#e2b54c', menuShadow: '0 12px 32px rgba(0,0,0,0.5)' },
  light: { bg: '#eef0f7', raise: '#ffffff', hover: '#e5e8f2', line: '#e2e6f0', fg: '#0c1037', sub: '#4d5578', dim: '#6b7393', icon: '#b07d0c', menuShadow: '0 12px 32px rgba(12,16,55,0.12)' },
}

/** A palette's full colours, whichever palette is active (for previews). */
export function paletteColors(id) {
  const p = PALETTE_BY_ID[id] || PALETTE_BY_ID.light
  return { ...BASE[p.mode], ...(p.tokens || {}) }
}

/** A palette's sidebar colours. */
export function paletteShell(id) {
  const p = PALETTE_BY_ID[id] || PALETTE_BY_ID.light
  return p.shell || SHELL[p.mode]
}

/** The sidebar colours in use for a base mode: the active palette's when it is that mode. */
export function shellFor(mode) {
  const p = activePalette()
  return p && p.mode === mode ? paletteShell(p.id) : SHELL[mode === 'dark' ? 'dark' : 'light']
}

/** Colour tokens for each base mode: the active palette's when it is that mode. */
export const THEMES = {
  get dark() { return tokensFor('dark') },
  get light() { return tokensFor('light') },
}
