import { useState, useEffect } from 'react'
import { getLevelProgress, RANKS, RANK_ICONS } from '../lib/engine'

const FONT_D = "'Sifonn Pro', sans-serif"
const FONT_B = "'Plus Jakarta Sans', sans-serif"
const GOLD   = '#f1be43'
const GOLDL  = '#f9d87a'
const NAV_BG = '#0c1037'
const NAV_BORDER = 'rgba(255,255,255,0.07)'

const NAV_ITEMS = [
  { icon: '⚡', label: 'Question Bank', id: 'home' },
  { icon: '🎓', label: 'Learn',         id: 'learn' },
  { icon: '📊', label: 'My Progress',   id: 'profile' },
  { icon: '🏆', label: 'Leaderboard',   id: 'leaderboard' },
  { icon: '📚', label: 'Study Plan',    id: 'study' },
  { icon: '🕐', label: 'History',       id: 'history' },
]

export default function AppLayout({ children, profile, subject, activeScreen, onNav, onChangeSubject, onSignOut, theme, onToggleTheme }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768)

  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])

  const { level, pct, next } = getLevelProgress(profile.xp)
  const rank = RANKS[Math.min(level, RANKS.length - 1)]
  const icon = RANK_ICONS[Math.min(level, RANK_ICONS.length - 1)]
  const NAV_MUTED = '#3d5080'

  const handleNav = (id) => {
    setMobileMenuOpen(false)
    onNav(id)
  }

  const ThemeToggle = () => (
    <button onClick={onToggleTheme} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderRadius: 20, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', cursor: 'pointer', flexShrink: 0 }}>
      <span style={{ fontSize: 11 }}>{theme === 'dark' ? '🌙' : '☀️'}</span>
      <div style={{ width: 28, height: 15, borderRadius: 8, background: 'rgba(255,255,255,0.1)', position: 'relative' }}>
        <div style={{ position: 'absolute', top: 2, left: theme === 'dark' ? 2 : 13, width: 11, height: 11, borderRadius: '50%', background: GOLD, transition: 'left 0.25s ease' }} />
      </div>
    </button>
  )

  const SidebarContent = () => (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: NAV_BG, fontFamily: FONT_B }}>
      {/* Logo */}
      <div style={{ padding: '18px 16px 14px', borderBottom: `1px solid ${NAV_BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontFamily: FONT_D, fontSize: 17, letterSpacing: 1, color: '#fff' }}>
          grade<span style={{ color: GOLD }}>farm.</span>
        </div>
        <ThemeToggle />
      </div>

      {/* Subject */}
      <div style={{ padding: '8px 16px', borderBottom: `1px solid ${NAV_BORDER}` }}>
        <div style={{ fontSize: 10, color: NAV_MUTED }}>{subject?.name || 'Chemistry'} · {subject?.stage || 'Stage 1'}</div>
      </div>

      {/* Profile */}
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${NAV_BORDER}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: `linear-gradient(135deg,${GOLD},${GOLDL})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: '#0c1037', flexShrink: 0 }}>
            {profile.display_name[0].toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile.display_name}</div>
            <div style={{ fontSize: 10, color: GOLD, fontWeight: 600 }}>{icon} {rank}</div>
          </div>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 4, height: 4, overflow: 'hidden', marginBottom: 3 }}>
          <div style={{ width: `${pct}%`, height: '100%', background: `linear-gradient(90deg,${GOLD},${GOLDL})`, transition: 'width 0.8s' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 9, color: NAV_MUTED }}>Level {level}</span>
          <span style={{ fontSize: 9, color: NAV_MUTED }}>{profile.xp}/{next} XP</span>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {NAV_ITEMS.map(item => (
          <button key={item.id} onClick={() => handleNav(item.id)} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '9px 12px', borderRadius: 8, border: 'none',
            background: activeScreen === item.id ? 'rgba(241,190,67,0.1)' : 'transparent',
            borderLeft: `2px solid ${activeScreen === item.id ? GOLD : 'transparent'}`,
            color: activeScreen === item.id ? GOLD : NAV_MUTED,
            fontSize: 13, fontWeight: activeScreen === item.id ? 700 : 500,
            cursor: 'pointer', fontFamily: FONT_B,
            textAlign: 'left', width: '100%', transition: 'all 0.15s',
          }}>
            <span style={{ fontSize: 14 }}>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      {/* Bottom */}
      <div style={{ padding: '10px 12px', borderTop: `1px solid ${NAV_BORDER}`, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <button onClick={onChangeSubject} style={{ width: '100%', padding: '8px', borderRadius: 8, border: '1px solid rgba(241,190,67,0.25)', background: 'transparent', color: GOLD, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: FONT_B }}>
          ⇄ Change Subject
        </button>
        <button onClick={onSignOut} style={{ width: '100%', padding: '8px', borderRadius: 8, border: `1px solid ${NAV_BORDER}`, background: 'transparent', color: NAV_MUTED, fontSize: 12, cursor: 'pointer', fontFamily: FONT_B }}>
          Sign out
        </button>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', display: 'flex', fontFamily: FONT_B }}>
      <style>{`
        @font-face { font-family: 'Sifonn Pro'; src: url('/SIFONN_PRO.otf') format('opentype'); font-display: swap; }
        @keyframes slideIn { from{transform:translateX(-100%)} to{transform:translateX(0)} }
        *, *::before, *::after { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; }
      `}</style>

      {/* Desktop sidebar */}
      {!isMobile && (
        <div style={{ width: 220, flexShrink: 0, position: 'fixed', top: 0, left: 0, height: '100vh', zIndex: 50 }}>
          <SidebarContent />
        </div>
      )}

      {/* Mobile sidebar overlay */}
      {isMobile && mobileMenuOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200 }}>
          <div onClick={() => setMobileMenuOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }} />
          <div style={{ position: 'absolute', top: 0, left: 0, width: 260, height: '100vh', animation: 'slideIn 0.25s ease', zIndex: 201 }}>
            <SidebarContent />
          </div>
        </div>
      )}

      {/* Mobile topbar */}
      {isMobile && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, background: NAV_BG, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button onClick={() => setMobileMenuOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {[20, 14, 20].map((w, i) => <div key={i} style={{ width: w, height: 2, background: '#fff', borderRadius: 2 }} />)}
            </div>
            <span style={{ fontFamily: FONT_D, fontSize: 16, color: '#fff', marginLeft: 6, letterSpacing: 1 }}>grade<span style={{ color: GOLD }}>farm.</span></span>
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ThemeToggle />
            <span style={{ fontSize: 12, color: GOLD, fontWeight: 700 }}>{profile.xp} XP</span>
          </div>
        </div>
      )}

      {/* Main content area */}
      <div style={{ marginLeft: isMobile ? 0 : 220, paddingTop: isMobile ? 56 : 0, flex: 1, minWidth: 0 }}>
        {children}
      </div>
    </div>
  )
}
