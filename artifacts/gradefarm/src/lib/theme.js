export const FONTS = {
  display: "'Sifonn Pro', sans-serif",
  body:    "'Plus Jakarta Sans', 'Segoe UI', sans-serif",
  mono:    "'JetBrains Mono', monospace",
}

export const THEMES = {
  dark: {
    // Background layers — deeper for more contrast
    bg:           '#0e0f18',
    bgCard:       '#13141e',
    bgNav:        '#080d28',
    bgInput:      '#13141e',
    bgHover:      '#1a1b27',
    bgSubtle:     '#101119',
    bgElevated:   '#1c1d2a',

    // Borders — tiered opacity for depth
    border:       'rgba(255,255,255,0.07)',
    borderMid:    'rgba(255,255,255,0.12)',
    borderStrong: 'rgba(255,255,255,0.18)',
    borderAccent: 'rgba(241,190,67,0.22)',
    borderNav:    'rgba(241,190,67,0.10)',

    // Text — clear hierarchy
    text:         '#f1f5f9',
    textSub:      '#cbd5e1',
    textMuted:    '#94a3b8',
    textFaint:    '#475569',

    // Gold accent
    accent:       '#f1be43',
    accentLight:  '#f9d87a',
    accentBlue:   '#f1be43',
    accentGlow:   'rgba(241,190,67,0.14)',
    accentGlow2:  'rgba(241,190,67,0.08)',

    // XP & gamification
    xp:           '#f1be43',

    // Status colours
    danger:       '#f87171',
    dangerBg:     'rgba(248,113,113,0.10)',
    success:      '#34d399',
    successBg:    'rgba(52,211,153,0.10)',
    purple:       '#a78bfa',
    purpleBg:     'rgba(167,139,250,0.10)',
    blue:         '#60a5fa',
    blueBg:       'rgba(96,165,250,0.10)',

    // Shadows
    shadowCard:   '0 2px 16px rgba(0,0,0,0.35)',
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
