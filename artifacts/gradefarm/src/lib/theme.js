export const FONTS = {
  display: "'Sifonn Pro', sans-serif",
  body:    "'Plus Jakarta Sans', 'Segoe UI', sans-serif",
  mono:    "'JetBrains Mono', monospace",
}

export const THEMES = {
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
