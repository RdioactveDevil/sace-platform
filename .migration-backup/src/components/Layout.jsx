import { useState, useEffect } from 'react'
import { THEMES, FONTS } from '../lib/theme'
import { getLevelProgress, RANKS, RANK_ICONS } from '../lib/engine'

const GOLD  = '#f1be43'
const GOLDL = '#f9d87a'
const FONT_D = "'Sifonn Pro', sans-serif"
const FONT_B = "'Plus Jakarta Sans', sans-serif"

const NAV_ITEMS = [
  { icon: '⚡', label: 'Question Bank', id: 'home'        },
  { icon: '🎓', label: 'Learn',         id: 'learn'       },
  { icon: '📊', label: 'My Progress',   id: 'profile'     },
  { icon: '🏆', label: 'Leaderboard',   id: 'leaderboard' },
  { icon: '📚', label: 'Study Plan',    id: 'study'       },
  { icon: '🕐', label: 'History',       id: 'history'     },
]

export default function Layout({
  profile, subject, theme, onToggleTheme,
  activeScreen, onNav, onChangeSubject, onSignOut,
  children
}) {
  const t = THEMES[theme]
  const [open, setOpen]     = useState(false)
  const [mobile, setMobile] = useState(window.innerWidth < 900)

  useEffect(() => {
    const h = () => { setMobile(window.innerWidth < 900); if (window.innerWidth >= 900) setOpen(false) }
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])

  // Close menu when nav item selected on mobile
  const handleNav = (id) => {
    onNav(id)
    if (mobile) setOpen(false)
  }

  const { level, pct, next } = getLevelProgress(profile.xp)
  const rank = RANKS[Math.min(level, RANKS.length - 1)]
  const icon = RANK_ICONS[Math.min(level, RANK_ICONS.length - 1)]

  const SidebarInner = () => (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: t.bgNav }}>

      {/* Logo + theme toggle */}
      <div style={{ padding: '18px 20px 14px', borderBottom: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <span style={{ fontFamily: FONT_D, fontSize: 18, letterSpacing: 1 }}>
          <span style={{ color: '#fff' }}>grade</span><span style={{ color: GOLD }}>farm.</span>
        </span>
        {/* Theme toggle */}
        <button onClick={onToggleTheme} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 8px', borderRadius: 20, border: `1px solid ${t.border}`, background: 'transparent', cursor: 'pointer' }}>
          <span style={{ fontSize: 11 }}>{theme === 'dark' ? '🌙' : '☀️'}</span>
          <div style={{ width: 28, height: 15, borderRadius: 8, background: theme === 'dark' ? '#1e293b' : '#cbd5e1', position: 'relative' }}>
            <div style={{ position: 'absolute', top: 2, left: theme === 'dark' ? 2 : 14, width: 11, height: 11, borderRadius: '50%', background: GOLD, transition: 'left 0.2s' }} />
          </div>
        </button>
      </div>

      {/* Subject badge */}
      <div style={{ padding: '10px 20px', borderBottom: `1px solid ${t.border}`, flexShrink: 0 }}>
        <div style={{ fontSize: 11, color: t.textMuted }}>{subject?.name || 'Chemistry'} · {subject?.stage || 'Stage 1'}</div>
      </div>

      {/* Profile */}
      <div style={{ padding: '14px 20px', borderBottom: `1px solid ${t.border}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: `linear-gradient(135deg,${GOLD},${GOLDL})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: '#0c1037', flexShrink: 0 }}>
            {profile.display_name[0].toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile.display_name}</div>
            <div style={{ fontSize: 11, color: GOLD, fontWeight: 600 }}>{icon} {rank}</div>
          </div>
        </div>
        <div style={{ background: t.border, borderRadius: 4, height: 4, overflow: 'hidden', marginBottom: 3 }}>
          <div style={{ width: `${pct}%`, height: '100%', background: `linear-gradient(90deg,${GOLD},${GOLDL})`, transition: 'width 0.8s' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 10, color: t.textMuted }}>Level {level}</span>
          <span style={{ fontSize: 10, color: t.textFaint }}>{profile.xp}/{next} XP</span>
        </div>
      </div>

      {/* Nav items */}
      <nav style={{ flex: 1, padding: '10px 10px', display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' }}>
        {NAV_ITEMS.map(item => {
          const active = activeScreen === item.id
          return (
            <button key={item.id} onClick={() => handleNav(item.id)} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px', borderRadius: 9, border: 'none',
              background: active ? `rgba(241,190,67,0.12)` : 'transparent',
              color: active ? GOLD : t.textMuted,
              fontSize: 14, fontWeight: active ? 700 : 500,
              cursor: 'pointer', fontFamily: FONT_B,
              textAlign: 'left', width: '100%',
              borderLeft: active ? `2px solid ${GOLD}` : '2px solid transparent',
              transition: 'all 0.15s',
            }}>
              <span style={{ fontSize: 15 }}>{item.icon}</span>
              {item.label}
            </button>
          )
        })}
      </nav>

      {/* Bottom actions */}
      <div style={{ padding: '12px 14px', borderTop: `1px solid ${t.border}`, display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
        <button onClick={onChangeSubject} style={{ width: '100%', padding: '8px', borderRadius: 8, border: `1px solid rgba(241,190,67,0.3)`, background: 'transparent', color: GOLD, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: FONT_B }}>
          ⇄ Change Subject
        </button>
        <button onClick={onSignOut} style={{ width: '100%', padding: '8px', borderRadius: 8, border: `1px solid ${t.border}`, background: 'transparent', color: t.textFaint, fontSize: 12, cursor: 'pointer', fontFamily: FONT_B }}>
          Sign out
        </button>
      </div>
    </div>
  )

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: t.bg, fontFamily: FONT_B }}>
      <style>{`
        @font-face { font-family: 'Sifonn Pro'; src: url('/SIFONN_PRO.otf') format('opentype'); font-display: swap; }
        @keyframes slideIn { from{transform:translateX(-100%)} to{transform:translateX(0)} }
        @keyframes fadeUp  { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
      `}</style>

      {/* ── DESKTOP SIDEBAR ── */}
      {!mobile && (
        <div style={{ width: 236, flexShrink: 0, position: 'sticky', top: 0, height: '100vh', borderRight: `1px solid ${t.border}`, zIndex: 50 }}>
          <SidebarInner />
        </div>
      )}

      {/* ── MOBILE OVERLAY SIDEBAR ── */}
      {mobile && open && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200 }}>
          <div onClick={() => setOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} />
          <div style={{ position: 'absolute', top: 0, left: 0, width: 270, height: '100vh', animation: 'slideIn 0.25s ease', zIndex: 201, borderRight: `1px solid ${t.border}` }}>
            <SidebarInner />
          </div>
        </div>
      )}

      {/* ── MAIN AREA ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

        {/* Mobile top bar */}
        {mobile && (
          <div style={{ position: 'sticky', top: 0, zIndex: 100, background: t.bgNav, borderBottom: `1px solid ${t.border}`, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            {/* Hamburger */}
            <button onClick={() => setOpen(true)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {[0,1,2].map(i => <div key={i} style={{ width: i === 1 ? 14 : 20, height: 2, background: t.text, borderRadius: 2 }} />)}
            </button>

            <span style={{ fontFamily: FONT_D, fontSize: 17, letterSpacing: 1 }}>
              <span style={{ color: '#fff' }}>grade</span><span style={{ color: GOLD }}>farm.</span>
            </span>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={onToggleTheme} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 16 }}>
                {theme === 'dark' ? '🌙' : '☀️'}
              </button>
              <div style={{ width: 30, height: 30, borderRadius: '50%', background: `linear-gradient(135deg,${GOLD},${GOLDL})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: '#0c1037' }}>
                {profile.display_name[0].toUpperCase()}
              </div>
            </div>
          </div>
        )}

        {/* Page content */}
        <div style={{ flex: 1, animation: 'fadeUp 0.35s ease' }}>
          {children}
        </div>
      </div>
    </div>
  )
}
