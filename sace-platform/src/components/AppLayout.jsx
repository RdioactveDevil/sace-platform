import { useState, useEffect } from 'react'
import { getLevelProgress, RANKS, RANK_ICONS } from '../lib/engine'

const FONT_D = "'Sifonn Pro', sans-serif"
const FONT_B = "'Plus Jakarta Sans', sans-serif"
const GOLD   = '#f1be43'
const GOLDL  = '#f9d87a'
const NAV_BG = '#0c1037'
const NAV_W  = 220

const NAV_ITEMS = [
  { icon: '⚡', label: 'Question Bank', id: 'home' },
  { icon: '🎓', label: 'Learn',         id: 'learn' },
  { icon: '📊', label: 'My Progress',   id: 'profile' },
  { icon: '🏆', label: 'Leaderboard',   id: 'leaderboard' },
  { icon: '📚', label: 'Study Plan',    id: 'study' },
  { icon: '🕐', label: 'History',       id: 'history' },
]

export default function AppLayout({ children, profile, subject, activeScreen, onNav, onChangeSubject, onSignOut, theme, onToggleTheme }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  // Start as desktop (true = show sidebar), update after mount
  const [showSidebar, setShowSidebar] = useState(true)

  useEffect(() => {
    const check = () => setShowSidebar(window.innerWidth > 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const { level, pct, next } = getLevelProgress(profile.xp)
  const rank = RANKS[Math.min(level, RANKS.length - 1)]
  const icon = RANK_ICONS[Math.min(level, RANK_ICONS.length - 1)]

  const ThemeToggle = () => (
    <button onClick={onToggleTheme} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderRadius: 20, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', cursor: 'pointer', flexShrink: 0 }}>
      <span style={{ fontSize: 11 }}>{theme === 'dark' ? '🌙' : '☀️'}</span>
      <div style={{ width: 28, height: 15, borderRadius: 8, background: 'rgba(255,255,255,0.1)', position: 'relative' }}>
        <div style={{ position: 'absolute', top: 2, left: theme === 'dark' ? 2 : 13, width: 11, height: 11, borderRadius: '50%', background: GOLD, transition: 'left 0.25s ease' }} />
      </div>
    </button>
  )

  const NavContent = ({ onClose }) => (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: NAV_BG, fontFamily: FONT_B }}>
      <div style={{ padding: '18px 16px 14px', borderBottom: 'rgba(255,255,255,0.07) 1px solid', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontFamily: FONT_D, fontSize: 17, letterSpacing: 1, color: '#fff' }}>
          grade<span style={{ color: GOLD }}>farm.</span>
        </div>
        <ThemeToggle />
      </div>
      <div style={{ padding: '8px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div style={{ fontSize: 10, color: '#3d5080' }}>{subject?.name || 'Chemistry'} · {subject?.stage || 'Stage 1'}</div>
      </div>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
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
          <span style={{ fontSize: 9, color: '#3d5080' }}>Level {level}</span>
          <span style={{ fontSize: 9, color: '#3d5080' }}>{profile.xp}/{next} XP</span>
        </div>
      </div>
      <nav style={{ flex: 1, padding: '8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {NAV_ITEMS.map(item => (
          <button key={item.id} onClick={() => { onNav(item.id); onClose && onClose() }} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '9px 12px', borderRadius: 8, border: 'none',
            background: activeScreen === item.id ? 'rgba(241,190,67,0.1)' : 'transparent',
            borderLeft: `2px solid ${activeScreen === item.id ? GOLD : 'transparent'}`,
            color: activeScreen === item.id ? GOLD : '#3d5080',
            fontSize: 13, fontWeight: activeScreen === item.id ? 700 : 500,
            cursor: 'pointer', fontFamily: FONT_B,
            textAlign: 'left', width: '100%', transition: 'all 0.15s',
          }}>
            <span style={{ fontSize: 14 }}>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>
      <div style={{ padding: '10px 12px', borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <button onClick={onChangeSubject} style={{ width: '100%', padding: '8px', borderRadius: 8, border: '1px solid rgba(241,190,67,0.25)', background: 'transparent', color: GOLD, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: FONT_B }}>
          ⇄ Change Subject
        </button>
        <button onClick={onSignOut} style={{ width: '100%', padding: '8px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.07)', background: 'transparent', color: '#3d5080', fontSize: 12, cursor: 'pointer', fontFamily: FONT_B }}>
          Sign out
        </button>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', fontFamily: FONT_B }}>
      <style>{`
        @font-face { font-family: 'Sifonn Pro'; src: url('/SIFONN_PRO.otf') format('opentype'); font-display: swap; }
        @keyframes slideIn { from{transform:translateX(-100%)} to{transform:translateX(0)} }
        *, *::before, *::after { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; }
      `}</style>

      {/* Desktop sidebar — always in DOM, visibility via showSidebar */}
      {showSidebar && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: NAV_W, height: '100vh', zIndex: 50 }}>
          <NavContent />
        </div>
      )}

      {/* Mobile overlay */}
      {!showSidebar && mobileOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200 }}>
          <div onClick={() => setMobileOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)' }} />
          <div style={{ position: 'absolute', top: 0, left: 0, width: 260, height: '100vh', animation: 'slideIn 0.25s ease', zIndex: 201 }}>
            <NavContent onClose={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      {/* Mobile topbar */}
      {!showSidebar && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, background: NAV_BG, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button onClick={() => setMobileOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
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

      {/* Content */}
      <div style={{ marginLeft: showSidebar ? NAV_W : 0, paddingTop: showSidebar ? 0 : 56 }}>
        {children}
      </div>
    </div>
  )
}