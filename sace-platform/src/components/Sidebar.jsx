import { getLevelProgress, RANKS, RANK_ICONS } from '../lib/engine'

const FONT_D = "'Sifonn Pro', sans-serif"
const FONT_B = "'Plus Jakarta Sans', sans-serif"
const GOLD   = '#f1be43'
const GOLDL  = '#f9d87a'
const NAVY   = '#0c1037'

const NAV_ITEMS = [
  { icon: '⚡', label: 'Question Bank', id: 'home' },
  { icon: '🎓', label: 'Learn',         id: 'learn' },
  { icon: '📊', label: 'My Progress',   id: 'profile' },
  { icon: '🏆', label: 'Leaderboard',   id: 'leaderboard' },
  { icon: '📚', label: 'Study Plan',    id: 'study' },
  { icon: '🕐', label: 'History',       id: 'history' },
]

export default function Sidebar({ profile, subject, activeScreen, onNav, onChangeSubject, onSignOut, theme, onToggleTheme }) {
  const { level, pct, next } = getLevelProgress(profile.xp)
  const rank = RANKS[Math.min(level, RANKS.length - 1)]
  const icon = RANK_ICONS[Math.min(level, RANK_ICONS.length - 1)]

  return (
    <div style={{
      width: 220,
      height: '100vh',
      position: 'fixed',
      top: 0,
      left: 0,
      background: NAVY,
      display: 'flex',
      flexDirection: 'column',
      fontFamily: FONT_B,
      zIndex: 100,
      borderRight: '1px solid rgba(255,255,255,0.07)',
    }}>
      <style>{`
        @font-face { font-family: 'Sifonn Pro'; src: url('/SIFONN_PRO.otf') format('opentype'); font-display: swap; }
        .gf-nav-btn { transition: background 0.15s; }
        .gf-nav-btn:hover { background: rgba(255,255,255,0.05) !important; }
      `}</style>

      {/* Logo + theme toggle */}
      <div style={{ padding: '18px 16px 14px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ fontFamily: FONT_D, fontSize: 17, letterSpacing: 1, color: '#fff' }}>
          grade<span style={{ color: GOLD }}>farm.</span>
        </div>
        <button onClick={onToggleTheme} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 7px', borderRadius: 20, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', cursor: 'pointer', flexShrink: 0 }}>
          <span style={{ fontSize: 10 }}>{theme === 'dark' ? '🌙' : '☀️'}</span>
          <div style={{ width: 24, height: 13, borderRadius: 7, background: 'rgba(255,255,255,0.1)', position: 'relative' }}>
            <div style={{ position: 'absolute', top: 1, left: theme === 'dark' ? 1 : 11, width: 11, height: 11, borderRadius: '50%', background: GOLD, transition: 'left 0.25s ease' }} />
          </div>
        </button>
      </div>

      {/* Subject label */}
      <div style={{ padding: '7px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>{subject?.name || 'Chemistry'} · {subject?.stage || 'Stage 1'}</div>
      </div>

      {/* Profile */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: `linear-gradient(135deg,${GOLD},${GOLDL})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: NAVY, flexShrink: 0 }}>
            {profile.display_name[0].toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile.display_name}</div>
            <div style={{ fontSize: 10, color: GOLD, fontWeight: 600 }}>{icon} {rank}</div>
          </div>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 4, height: 4, overflow: 'hidden', marginBottom: 3 }}>
          <div style={{ width: `${pct}%`, height: '100%', background: `linear-gradient(90deg,${GOLD},${GOLDL})`, transition: 'width 0.8s' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)' }}>Level {level}</span>
          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)' }}>{profile.xp}/{next} XP</span>
        </div>
      </div>

      {/* Nav items */}
      <nav style={{ flex: 1, padding: '8px 8px', display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' }}>
        {NAV_ITEMS.map(item => {
          const isActive = activeScreen === item.id
          return (
            <button
              key={item.id}
              className="gf-nav-btn"
              onClick={() => onNav(item.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 12px', borderRadius: 8, border: 'none',
                background: isActive ? 'rgba(241,190,67,0.12)' : 'transparent',
                borderLeft: `2px solid ${isActive ? GOLD : 'transparent'}`,
                color: isActive ? GOLD : 'rgba(255,255,255,0.75)',
                fontSize: 13, fontWeight: isActive ? 700 : 500,
                cursor: 'pointer', fontFamily: FONT_B,
                textAlign: 'left', width: '100%',
              }}
            >
              <span style={{ fontSize: 15, opacity: isActive ? 1 : 0.7 }}>{item.icon}</span>
              {item.label}
            </button>
          )
        })}
      </nav>

      {/* Bottom actions */}
      <div style={{ padding: '10px 12px', borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
        <button onClick={onChangeSubject} style={{ width: '100%', padding: '8px', borderRadius: 8, border: '1px solid rgba(241,190,67,0.3)', background: 'transparent', color: GOLD, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: FONT_B }}>
          ⇄ Change Subject
        </button>
        <button onClick={onSignOut} style={{ width: '100%', padding: '8px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.07)', background: 'transparent', color: 'rgba(255,255,255,0.3)', fontSize: 12, cursor: 'pointer', fontFamily: FONT_B }}>
          Sign out
        </button>
      </div>
    </div>
  )
}
