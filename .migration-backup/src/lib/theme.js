export const FONTS = {
  display: "'Sifonn Pro', sans-serif",
  body:    "'Plus Jakarta Sans', 'Segoe UI', sans-serif",
  mono:    "'JetBrains Mono', monospace",
}

export const THEMES = {
  dark: {
    // Dark C — navy sidebar, charcoal content
    bg:           '#13141a',
    bgCard:       '#1c1d25',
    bgNav:        '#0c1037',
    bgInput:      '#1c1d25',
    bgHover:      '#22232e',
    bgSubtle:     '#17181f',
    border:       'rgba(255,255,255,0.07)',
    borderMid:    'rgba(255,255,255,0.12)',
    borderAccent: 'rgba(241,190,67,0.2)',
    borderNav:    'rgba(241,190,67,0.08)',
    text:         '#f1f5f9',
    textSub:      '#94a3b8',
    textMuted:    '#4a5568',
    textFaint:    '#2d3a5e',
    accent:       '#f1be43',
    accentLight:  '#f9d87a',
    accentBlue:   '#f1be43',
    accentGlow:   'rgba(241,190,67,0.12)',
    xp:           '#f1be43',
    danger:       '#ef4444',
    success:      '#10b981',
    purple:       '#a78bfa',
  },
  light: {
    // Option 3 — navy sidebar, white content
    bg:           '#f8f9ff',
    bgCard:       '#ffffff',
    bgNav:        '#0c1037',
    bgInput:      '#f8f9ff',
    bgHover:      '#f0f2ff',
    bgSubtle:     '#f0f2ff',
    border:       '#e2e5f0',
    borderMid:    '#c8ccdf',
    borderAccent: 'rgba(241,190,67,0.4)',
    borderNav:    'rgba(255,255,255,0.08)',
    text:         '#0c1037',
    textSub:      '#1e2a5e',
    textMuted:    '#64748b',
    textFaint:    '#94a3b8',
    // In light mode, sidebar uses dark nav bg so accent stays gold
    accent:       '#f1be43',
    accentLight:  '#f9d87a',
    accentBlue:   '#0c1037',
    accentGlow:   'rgba(241,190,67,0.1)',
    xp:           '#d4a017',
    danger:       '#dc2626',
    success:      '#059669',
    purple:       '#6d28d9',
    // Extra tokens for light mode content area
    contentText:  '#0c1037',
    cardShadow:   '0 2px 12px rgba(12,16,55,0.08)',
  }
}