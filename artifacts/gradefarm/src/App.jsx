import { useState, useEffect } from 'react'
import { createBrowserRouter, RouterProvider, Routes, Route, Navigate, useNavigate, useLocation, useBlocker } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { getProfile, getStruggleMap, signOut, getQuestions, getSubscriptions } from './lib/db'
import { THEMES } from './lib/theme'
import { getLevelProgress, RANKS, RANK_ICONS } from './lib/engine'
import LandingPage       from './components/LandingPage'
import AuthScreen        from './components/AuthScreen'
import SubjectPicker     from './components/SubjectPicker'
import { QUESTIONS_SUBJECT_BY_ID, ALL_SUBJECTS } from './lib/subjects'
import { getTopicConfig } from './lib/saceTopics'
import { getY7TopicConfig } from './lib/australianCurriculumTopics'
import HomeScreen        from './components/HomeScreen'
import QuizScreen        from './components/QuizScreen'
import LearnScreen       from './components/LearnScreen'
import LeaderboardScreen from './components/LeaderboardScreen'
import ProfileScreen     from './components/ProfileScreen'
import AccountScreen from './components/AccountScreen'
import HistoryScreen     from './components/HistoryScreen'
import StudyPlanScreen   from './components/StudyPlanScreen'
import OnboardingScreen  from './components/OnboardingScreen'
import GetAccessScreen   from './components/GetAccessScreen'
import TermsScreen       from './components/TermsScreen'
import PrivacyScreen     from './components/PrivacyScreen'
import AdminRoute        from './components/AdminRoute'
import AdminScreen       from './components/AdminScreen'
import TutorRoute        from './components/TutorRoute'
import TutorScreen       from './components/TutorScreen'

const GOLD   = '#f1be43'
const GOLDL  = '#f9d87a'
const FONT_D = "'Sifonn Pro', sans-serif"
const FONT_B = "'Plus Jakarta Sans', sans-serif"

const NAV_ITEMS = [
  { icon: 'home',        label: 'Question Bank', id: 'home',        path: '/question-bank' },
  { icon: 'learn',       label: 'Learn',         id: 'learn',       path: '/learn'         },
  { icon: 'profile',     label: 'My Progress',   id: 'profile',     path: '/my-progress'   },
  { icon: 'leaderboard', label: 'Leaderboard',   id: 'leaderboard', path: '/leaderboard'   },
  { icon: 'study',       label: 'Study Plan',    id: 'study',       path: '/study-plan'    },
  { icon: 'history',     label: 'History',       id: 'history',     path: '/history'       },
]

// Cohesive lucide-style icon family — uniform 18px viewBox, 1.5 stroke, rounded caps/joins.
function NavIcon({ name, size = 18, color = 'currentColor' }) {
  const S = { fill: 'none', stroke: color, strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" style={{ flexShrink: 0, display: 'block' }} aria-hidden="true">
      {name === 'home'        && <><path d="M2.5 8.25 9 3l6.5 5.25V15a1 1 0 0 1-1 1h-3v-4.25h-3V16h-3a1 1 0 0 1-1-1Z" {...S} /></>}
      {name === 'learn'       && <><path d="M3 3.75A1.25 1.25 0 0 1 4.25 2.5H8v12.75H4.25A1.25 1.25 0 0 1 3 14V3.75Z" {...S} /><path d="M10 2.5h3.75A1.25 1.25 0 0 1 15 3.75V14a1.25 1.25 0 0 1-1.25 1.25H10V2.5Z" {...S} /></>}
      {name === 'profile'     && <><path d="M2.5 13.5 6.5 9l3 2.5L15.5 4.5" {...S} /><path d="M11.5 4.5h4v4" {...S} /></>}
      {name === 'leaderboard' && <><rect x="2.5" y="10" width="3.5" height="5.5" rx="0.75" {...S} /><rect x="7.25" y="6" width="3.5" height="9.5" rx="0.75" {...S} /><rect x="12" y="2" width="3.5" height="13.5" rx="0.75" {...S} /></>}
      {name === 'study'       && <><path d="M3 4h7" {...S} /><path d="M3 9h7" {...S} /><path d="M3 14h4.5" {...S} /><path d="M11 12.5 13 14.5 16 11" {...S} /></>}
      {name === 'history'     && <><circle cx="9" cy="9" r="6.5" {...S} /><path d="M9 5.25V9l2.75 1.5" {...S} /></>}
      {name === 'tutor'       && <><circle cx="9" cy="6.25" r="3" {...S} /><path d="M3.25 15.5a5.75 5.75 0 0 1 11.5 0" {...S} /></>}
      {name === 'admin'       && <><path d="M9 2 3.5 4v4.25c0 3.4 2.4 6.4 5.5 7.25 3.1-.85 5.5-3.85 5.5-7.25V4Z" {...S} /><path d="m6.75 9 1.75 1.75L11.5 7.5" {...S} /></>}
    </svg>
  )
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
function SidebarContent({ profile, subject, onChangeSubject, onSignOut, theme, onToggleTheme, onClose }) {
  const navigate  = useNavigate()
  const location  = useLocation()
  const { level, pct, next } = getLevelProgress(profile.xp)
  const rank = RANKS[Math.min(level, RANKS.length - 1)]
  const icon = RANK_ICONS[Math.min(level, RANK_ICONS.length - 1)]

  const go = (path) => { navigate(path); onClose?.() }

  // Single source of truth for nav items (incl. role-gated entries) so the active-state logic stays consistent.
  const navItems = [
    ...NAV_ITEMS,
    ...(profile?.is_tutor ? [{ icon: 'tutor', label: 'Tutor Dashboard', id: 'tutor', path: '/tutor' }] : []),
    ...(profile?.is_admin ? [{ icon: 'admin', label: 'Admin',           id: 'admin', path: '/admin' }] : []),
  ]
  const isActivePath = (p) =>
    location.pathname === p ||
    (p === '/home' && location.pathname === '/') ||
    (p === '/question-bank' && location.pathname === '/quiz') ||
    // Admin uses nested routes (/admin/*); treat any /admin descendant as active.
    (p === '/admin' && location.pathname.startsWith('/admin'))

  return (
    <div className="gf-sidebar" style={{
      display: 'flex', flexDirection: 'column', height: '100%', fontFamily: FONT_B,
      // Layered premium-dark surface: deeper base + radial highlight + top inner highlight + soft outer shadow.
      background: `radial-gradient(120% 60% at 0% 0%, rgba(241,190,67,0.06) 0%, rgba(241,190,67,0) 55%), linear-gradient(180deg, #07091f 0%, #05071a 100%)`,
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), inset -1px 0 0 rgba(255,255,255,0.04), 4px 0 24px rgba(0,0,0,0.35)',
      position: 'relative', overflow: 'hidden',
    }}>
      <style>{`
        .gf-nav-btn { position: relative; isolation: isolate; }
        .gf-nav-btn:focus-visible { outline: none; box-shadow: 0 0 0 2px rgba(241,190,67,0.55), 0 0 0 4px rgba(241,190,67,0.15) !important; }
        .gf-nav-btn[data-active="true"] { background: linear-gradient(135deg, rgba(241,190,67,0.16), rgba(241,190,67,0.06)) !important; border-color: rgba(241,190,67,0.28) !important; box-shadow: inset 0 1px 0 rgba(255,255,255,0.06), 0 1px 0 rgba(0,0,0,0.2) !important; }
        /* Preserve a visible focus ring even when the focused nav item is the active one */
        .gf-nav-btn[data-active="true"]:focus-visible { box-shadow: inset 0 1px 0 rgba(255,255,255,0.06), 0 0 0 2px rgba(241,190,67,0.65), 0 0 0 4px rgba(241,190,67,0.18) !important; }
        .gf-nav-btn[data-active="false"]:hover { background: rgba(255,255,255,0.04) !important; color: #f1f5f9 !important; border-color: rgba(255,255,255,0.06) !important; }
        .gf-nav-btn[data-active="false"]:hover .gf-nav-icon { color: #f1f5f9 !important; }
        .gf-icon-btn:focus-visible { outline: none; box-shadow: 0 0 0 2px rgba(241,190,67,0.5) !important; }
        .gf-footer-btn:focus-visible { outline: none; box-shadow: inset 0 1px 0 rgba(255,255,255,0.06), 0 0 0 2px rgba(241,190,67,0.55), 0 0 0 4px rgba(241,190,67,0.15) !important; }
      `}</style>

      {/* Header — logo + theme toggle, with extra breathing room */}
      <div style={{ padding: '20px 18px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, position: 'relative' }}>
        <div onClick={() => go('/home')} style={{ cursor: 'pointer', lineHeight: 1 }}>
          <span style={{ fontFamily: FONT_D, fontSize: 19, letterSpacing: 1.5 }}>
            <span style={{ color: '#fff' }}>grade</span><span style={{ color: GOLD }}>farm.</span>
          </span>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.32)', fontFamily: FONT_B, letterSpacing: '0.08em', marginTop: 5, textTransform: 'uppercase' }}>by Titanium Tutoring</div>
        </div>
        <button
          className="gf-icon-btn"
          onClick={onToggleTheme}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)', cursor: 'pointer', transition: 'border-color 0.2s, background 0.2s' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(241,190,67,0.35)'; e.currentTarget.style.background = 'rgba(241,190,67,0.06)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
        >
          <span style={{ fontSize: 11 }}>{theme === 'dark' ? '🌙' : '☀️'}</span>
          <div style={{ width: 26, height: 14, borderRadius: 7, background: 'rgba(255,255,255,0.08)', position: 'relative', flexShrink: 0 }}>
            <div style={{ position: 'absolute', top: 2, left: theme === 'dark' ? 2 : 12, width: 10, height: 10, borderRadius: '50%', background: GOLD, transition: 'left 0.25s cubic-bezier(0.34,1.56,0.64,1)', boxShadow: `0 0 6px ${GOLD}80` }} />
          </div>
        </button>
      </div>

      {/* Hairline divider */}
      <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.07) 20%, rgba(255,255,255,0.07) 80%, transparent)', flexShrink: 0 }} />

      {/* Subject context chip */}
      <div style={{ padding: '14px 18px 10px', flexShrink: 0 }}>
        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.30)', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>Studying</div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 10px 5px 8px', borderRadius: 999, background: 'linear-gradient(135deg, rgba(241,190,67,0.12), rgba(241,190,67,0.05))', border: '1px solid rgba(241,190,67,0.22)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)' }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: GOLD, flexShrink: 0, boxShadow: `0 0 6px ${GOLD}` }} />
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.78)', fontWeight: 600, letterSpacing: '0.02em' }}>{subject?.name || 'Chemistry'} · {subject?.stage || 'Stage 1'}</div>
        </div>
      </div>

      {/* Profile / XP card */}
      <div style={{ padding: '0 14px 14px', flexShrink: 0 }}>
        <div
          onClick={() => go('/my-account')}
          style={{ padding: '12px 12px 14px', borderRadius: 14, cursor: 'pointer', transition: 'background 0.15s, border-color 0.15s', background: 'linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.015))', border: '1px solid rgba(255,255,255,0.06)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.025))'; e.currentTarget.style.borderColor = 'rgba(241,190,67,0.18)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.015))'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 12 }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <div style={{ width: 38, height: 38, borderRadius: 12, background: `linear-gradient(135deg,${GOLD},${GOLDL})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 900, color: '#06091f', boxShadow: `0 4px 14px ${GOLD}55, inset 0 1px 0 rgba(255,255,255,0.4)` }}>
                {profile.display_name[0].toUpperCase()}
              </div>
              <div style={{ position: 'absolute', right: -2, bottom: -2, width: 12, height: 12, borderRadius: '50%', background: '#0b1030', border: '2px solid #07091f', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, color: GOLD, fontWeight: 800 }}>{level}</div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '-0.01em' }}>{profile.display_name}</div>
              <div style={{ fontSize: 10, color: GOLD, fontWeight: 700, marginTop: 2, letterSpacing: '0.04em' }}>{icon} {rank}</div>
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.22)', flexShrink: 0 }}>›</div>
          </div>
          <div style={{ position: 'relative', background: 'rgba(255,255,255,0.06)', borderRadius: 999, height: 4, overflow: 'hidden', marginBottom: 6, boxShadow: 'inset 0 1px 0 rgba(0,0,0,0.25)' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: `linear-gradient(90deg,${GOLD},${GOLDL})`, transition: 'width 0.8s ease', borderRadius: 999, boxShadow: `0 0 8px ${GOLD}80` }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.36)', letterSpacing: '0.08em', fontWeight: 700, textTransform: 'uppercase' }}>Level {level}</span>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>{profile.xp.toLocaleString()} XP</span>
          </div>
        </div>
      </div>

      {/* Hairline divider */}
      <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.06) 20%, rgba(255,255,255,0.06) 80%, transparent)', flexShrink: 0 }} />

      {/* Nav items */}
      <div style={{ padding: '14px 14px 6px', flexShrink: 0 }}>
        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.28)', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', paddingLeft: 4 }}>Navigate</div>
      </div>
      <nav style={{ flex: 1, padding: '0 10px 10px', display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' }}>
        {navItems.map(item => {
          const active = isActivePath(item.path)
          return (
            <button
              key={item.id}
              type="button"
              className="gf-nav-btn"
              data-active={active}
              onClick={() => go(item.path)}
              style={{
                display: 'flex', alignItems: 'center', gap: 11,
                padding: '10px 12px', borderRadius: 10,
                border: '1px solid transparent', background: 'transparent',
                color: active ? GOLD : 'rgba(255,255,255,0.62)',
                fontSize: 13.5, fontWeight: active ? 700 : 500,
                cursor: 'pointer', fontFamily: FONT_B, textAlign: 'left', width: '100%',
                transition: 'color 0.18s, background 0.18s, border-color 0.18s, box-shadow 0.18s',
                letterSpacing: active ? '-0.01em' : '0',
              }}
            >
              <span className="gf-nav-icon" style={{ display: 'flex', color: active ? GOLD : 'rgba(255,255,255,0.55)', transition: 'color 0.18s' }}>
                <NavIcon name={item.icon} size={17} color="currentColor" />
              </span>
              <span style={{ flex: 1 }}>{item.label}</span>
              {/* Gold indicator dot for the active item */}
              {active && <span style={{ width: 6, height: 6, borderRadius: '50%', background: GOLD, boxShadow: `0 0 8px ${GOLD}, 0 0 0 2px rgba(241,190,67,0.18)`, flexShrink: 0 }} />}
            </button>
          )
        })}
      </nav>

      {/* Hairline divider */}
      <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.06) 20%, rgba(255,255,255,0.06) 80%, transparent)', flexShrink: 0 }} />

      {/* Footer actions */}
      <div style={{ padding: '12px 14px 16px', display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
        <button
          className="gf-footer-btn"
          onClick={onChangeSubject}
          style={{ width: '100%', height: 36, padding: '0 12px', borderRadius: 10, border: '1px solid rgba(241,190,67,0.28)', background: 'linear-gradient(135deg, rgba(241,190,67,0.12), rgba(241,190,67,0.05))', color: GOLD, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B, transition: 'background 0.15s, border-color 0.15s, box-shadow 0.15s', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, letterSpacing: '0.01em' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(241,190,67,0.20), rgba(241,190,67,0.08))'; e.currentTarget.style.borderColor = 'rgba(241,190,67,0.45)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(241,190,67,0.12), rgba(241,190,67,0.05))'; e.currentTarget.style.borderColor = 'rgba(241,190,67,0.28)' }}
        >⇄ Change Subject</button>
        <button
          className="gf-footer-btn"
          onClick={onSignOut}
          style={{ width: '100%', height: 32, padding: '0 12px', borderRadius: 10, border: '1px solid transparent', background: 'transparent', color: 'rgba(255,255,255,0.32)', fontSize: 11.5, cursor: 'pointer', fontFamily: FONT_B, transition: 'color 0.15s, background 0.15s, border-color 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.7)'; e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.32)'; e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent' }}
        >Sign out</button>
      </div>
    </div>
  )
}


// ── Locked Subject Screen ─────────────────────────────────────────────────────
function LockedSubjectScreen({ subject, onChangeSubject, theme }) {
  const t = THEMES[theme]
  return (
    <div style={{ minHeight: '100vh', background: t.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, padding: 24, fontFamily: "'Plus Jakarta Sans', sans-serif", textAlign: 'center' }}>
      <div style={{ fontSize: 52 }}>🔒</div>
      <h2 style={{ fontSize: 22, fontWeight: 800, color: t.text, margin: 0 }}>Subject Not in Your Plan</h2>
      <p style={{ fontSize: 14, color: t.textMuted, maxWidth: 360, lineHeight: 1.6, margin: 0 }}>
        <strong style={{ color: t.text }}>{subject?.name} {subject?.stage}</strong> is not included in your current subscription. Contact Titanium Tutoring to add it.
      </p>
      <a href="mailto:hello@titaniumtutoring.com.au" style={{ padding: '12px 24px', borderRadius: 12, background: GOLD, color: '#0c1037', fontSize: 14, fontWeight: 800, textDecoration: 'none', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
        Contact us to upgrade →
      </a>
      <button onClick={onChangeSubject} style={{ padding: '10px 20px', borderRadius: 10, border: `1px solid ${t.border}`, background: 'transparent', color: t.textMuted, fontSize: 13, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
        ← Back to subject picker
      </button>
    </div>
  )
}

// ── AppShell ──────────────────────────────────────────────────────────────────
function AppShell({ children, profile, subject, onChangeSubject, onSignOut, theme, onToggleTheme }) {
  const t = THEMES[theme]
  const [menuOpen, setMenuOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 860)
  const navigate = useNavigate()

  useEffect(() => {
    const h = () => { setIsMobile(window.innerWidth < 860); if (window.innerWidth >= 860) setMenuOpen(false) }
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])

  const sProps = { profile, subject, onChangeSubject, onSignOut, theme, onToggleTheme }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', height: isMobile ? 'auto' : '100vh', overflow: isMobile ? 'visible' : 'hidden', background: t.bg }}>
      <style>{`@font-face{font-family:'Sifonn Pro';src:url('/SIFONN_PRO.otf') format('opentype');font-display:swap;}@keyframes slideIn{from{transform:translateX(-100%)}to{transform:translateX(0)}}@media(max-width:860px){.qs-right-col{height:auto!important;overflow:visible!important}}`}</style>

      {!isMobile && (
        <div style={{ width: 252, flexShrink: 0, position: 'sticky', top: 0, height: '100vh', borderRight: '1px solid rgba(255,255,255,0.07)', zIndex: 10 }}>
          <SidebarContent {...sProps} />
        </div>
      )}

      {isMobile && menuOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 999 }}>
          <div onClick={() => setMenuOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }} />
          <div style={{ position: 'absolute', top: 0, left: 0, width: 272, height: '100vh', animation: 'slideIn 0.25s ease', zIndex: 1000, borderRight: '1px solid rgba(255,255,255,0.07)' }}>
            <SidebarContent {...sProps} onClose={() => setMenuOpen(false)} />
          </div>
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: isMobile ? '100vh' : 0, overflow: isMobile ? 'visible' : 'hidden' }}>
        {isMobile && (
          <div style={{ position: 'sticky', top: 0, zIndex: 100, background: '#080d28', borderBottom: '1px solid rgba(255,255,255,0.07)', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <button onClick={() => setMenuOpen(true)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ width: 20, height: 2, background: '#fff', borderRadius: 2 }} />
              <div style={{ width: 14, height: 2, background: '#fff', borderRadius: 2 }} />
              <div style={{ width: 20, height: 2, background: '#fff', borderRadius: 2 }} />
            </button>
            <span onClick={() => navigate('/home')} style={{ fontFamily: FONT_D, fontSize: 17, letterSpacing: 1, cursor: 'pointer' }}>
              <span style={{ color: '#fff' }}>grade</span><span style={{ color: GOLD }}>farm.</span>
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={onToggleTheme} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 15 }}>{theme === 'dark' ? '🌙' : '☀️'}</button>
              <div style={{ width: 30, height: 30, borderRadius: '50%', background: `linear-gradient(135deg,${GOLD},${GOLDL})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: '#080d28' }}>
                {profile.display_name[0].toUpperCase()}
              </div>
            </div>
          </div>
        )}
        <div style={{ flex: isMobile ? '0 0 auto' : 1, minHeight: isMobile ? 'auto' : 0, overflow: isMobile ? 'visible' : 'hidden', display: 'flex', flexDirection: 'column' }}>{children}</div>
      </div>
    </div>
  )
}

// ── Main App ──────────────────────────────────────────────────────────────────
// ── AppShellScreens — all screens always mounted, toggled via display:none ───
// This prevents unmount/remount on tab switch — no reload flashes, state preserved
function AppShellScreens({
  profile, questions, struggleMap, setStruggleMap, subject,
  onStartSession, onChangeSubject, onSignOut, theme, onToggleTheme, quizSubtopics, setQuizSubtopics,
  assignmentsVersion, lastSessionAt, onOpenLearn,
  // learn state
  phase, setPhase, topic, setTopic, messages, setMessages,
  interests, setInterests, docContext, setDocContext, docName, setDocName,
  questionContext, setQuestionContext, onConsolidate,
}) {
  const navigate   = useNavigate()
  const location   = useLocation()
  const screen     = location.pathname.replace('/', '') // e.g. 'question-bank'
  const commonProps = { theme, onToggleTheme }
  const learnState  = { phase, setPhase, topic, setTopic, messages, setMessages, interests, setInterests, docContext, setDocContext, docName, setDocName, questionContext, setQuestionContext, onConsolidate }
  const shellProps  = { ...commonProps, profile, subject, onChangeSubject, onSignOut }
  const GOLD = '#f1be43'
  const FONT_B = "'Plus Jakarta Sans', sans-serif"

  const show = (s) => screen === s ? { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'visible' } : { display: 'none' }

  return (
    <AppShell {...shellProps}>
      <div style={show('question-bank')}>
        <HomeScreen {...commonProps}
          profile={profile} struggleMap={struggleMap}
          questions={questions} subject={subject}
          assignmentsVersion={assignmentsVersion}
          onStartSession={onStartSession} />
      </div>
      <div style={show('learn')}>
        <LearnScreen {...commonProps} {...learnState}
          profile={profile} struggleMap={struggleMap}
          questions={questions} subject={subject}
          onBack={() => navigate('/question-bank')} />
      </div>
      <div style={show('leaderboard')}>
        <LeaderboardScreen {...commonProps} profile={profile} embedded />
      </div>
      <div style={show('my-progress')}>
        <ProfileScreen {...commonProps}
          profile={profile} questions={questions} subject={subject}
          struggleMap={struggleMap} embedded
          onStartSession={onStartSession}
          onOpenLearn={(nextTopic) => {
            if (nextTopic) setTopic(nextTopic)
            setPhase('setup')
            navigate('/learn')
          }} />
      </div>
      <div style={show('study-plan')}>
        <StudyPlanScreen
          profile={profile} questions={questions} struggleMap={struggleMap}
          theme={theme} onStartSession={onStartSession} subject={subject}
          lastSessionAt={lastSessionAt} onOpenLearn={onOpenLearn} />
      </div>
      <div style={show('history')}>
        <HistoryScreen {...commonProps} profile={profile} embedded />
      </div>
      <div style={show('my-account')}>
        <AccountScreen {...commonProps} profile={profile} onSignOut={onSignOut} onChangeSubject={onChangeSubject} />
      </div>
    </AppShell>
  )
}

function NavBlockerModal({ blocker, theme }) {
  const t = THEMES[theme]
  if (blocker.state !== 'blocked') return null
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, backdropFilter: 'blur(8px)' }}>
      <div style={{ background: t?.bgCard || '#0c1037', border: `1px solid rgba(241,190,67,0.3)`, borderRadius: 20, padding: '36px 32px', maxWidth: 360, width: '90%', textAlign: 'center', fontFamily: FONT_B }}>
        <div style={{ fontSize: 36, marginBottom: 14 }}>⚠️</div>
        <div style={{ fontFamily: FONT_D, fontSize: 20, color: t?.text || '#f1f5f9', marginBottom: 8, letterSpacing: 0.5 }}>LEAVE QUIZ?</div>
        <div style={{ fontSize: 14, color: t?.textMuted || '#94a3b8', marginBottom: 28, lineHeight: 1.65 }}>
          Your session progress will be lost if you navigate away now.
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => blocker.reset()}
            style={{ flex: 1, padding: '13px', borderRadius: 11, border: `1px solid rgba(255,255,255,0.1)`, background: 'rgba(255,255,255,0.05)', color: t?.textMuted || '#94a3b8', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: FONT_B }}
          >
            Stay in Quiz
          </button>
          <button
            onClick={() => blocker.proceed()}
            style={{ flex: 1, padding: '13px', borderRadius: 11, border: 'none', background: 'linear-gradient(135deg,#ef4444,#dc2626)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B }}
          >
            Leave Anyway
          </button>
        </div>
      </div>
    </div>
  )
}

function AppInner() {
  const navigate = useNavigate()
  const location = useLocation()
  const [user, setUser]                       = useState(null)
  const [profile, setProfile]                 = useState(null)
  const [questions, setQuestions]             = useState([])
  const [struggleMap, setStruggleMap]         = useState({})
  const [loading, setLoading]                 = useState(true)
  const [bootstrapped, setBootstrapped]       = useState(false)
  const [selectedSubject, setSelectedSubject] = useState(() => {
    try { return JSON.parse(localStorage.getItem('gf-subject')) || null } catch { return null }
  })
  const [showAuth, setShowAuth]               = useState(false)
  const [theme, setTheme]                     = useState(() => localStorage.getItem('gf-theme') || 'dark')
  const [subscriptions, setSubscriptions]     = useState([])
  const [subscriptionsLoaded, setSubscriptionsLoaded] = useState(false)

  const refreshSubscriptions = async () => {
    try {
      const subs = await getSubscriptions(user.id)
      setSubscriptions(subs)
      setSubscriptionsLoaded(true)
    } catch {}
  }

  // Lifted Learn state — survives route changes
  const [learnPhase,      setLearnPhase]      = useState('setup')
  const [learnTopic,      setLearnTopic]      = useState('')
  const [learnMessages,   setLearnMessages]   = useState([])
  const [learnInterests,  setLearnInterests]  = useState(null)
  const [learnDocContext, setLearnDocContext]  = useState('')
  const [learnDocName,    setLearnDocName]    = useState('')

  // Titan AI bridge state
  const [questionContext,     setQuestionContext]     = useState(null)  // set from QuizScreen, consumed by LearnScreen
  const [consolidateSubtopic, setConsolidateSubtopic] = useState(null)  // set from LearnScreen, consumed by QuizScreen

  // Lifted Quiz state — persists across tab switches
  const [quizQ,           setQuizQ]           = useState(null)
  const [quizSelected,    setQuizSelected]    = useState(null)
  const [quizShowAns,     setQuizShowAns]     = useState(false)
  const [quizCorrect,     setQuizCorrect]     = useState(null)
  const [quizEarnedXP,    setQuizEarnedXP]    = useState(0)
  const [quizStreak,      setQuizStreak]      = useState(0)
  const [quizSessionXP,   setQuizSessionXP]   = useState(0)
  const [quizResults,     setQuizResults]     = useState([])
  const [quizAnswered,    setQuizAnswered]     = useState([])
  const [quizQNumber,     setQuizQNumber]     = useState(1)
  const [quizAiTip,       setQuizAiTip]       = useState('')
  const [quizLoadingTip,  setQuizLoadingTip]  = useState(false)
  const [quizMode,        setQuizMode]        = useState('new')
  const [quizSubtopics,   setQuizSubtopics]   = useState([])
  const [quizRemediationMode,      setQuizRemediationMode]      = useState(false)
  const [quizRemediationStreak,    setQuizRemediationStreak]    = useState(0)
  const [quizRemediationTarget,    setQuizRemediationTarget]    = useState(3)
  const [quizRemediationQueue,     setQuizRemediationQueue]     = useState([])
  const [quizRemediationStatus,    setQuizRemediationStatus]    = useState('idle')
  const [quizRemediationSource,    setQuizRemediationSource]    = useState('prebuilt')
  const [quizRemediationConcept,   setQuizRemediationConcept]   = useState(null)
  const [quizRemediationParentId,  setQuizRemediationParentId]  = useState(null)
  const [quizRemediationOriginalQ, setQuizRemediationOriginalQ] = useState(null)
  const [quizRemediationUsedIds,   setQuizRemediationUsedIds]   = useState([])
  const [quizRemediationWrongCount, setQuizRemediationWrongCount] = useState(0)
  const [activeAssignmentId, setActiveAssignmentId] = useState(null)
  const [quizFinished, setQuizFinished] = useState(false)
  const [quizSessionTip, setQuizSessionTip] = useState('')
  const [quizSessionTipLoading, setQuizSessionTipLoading] = useState(false)
  const [lastSessionAt, setLastSessionAt] = useState(null)
  const [assignmentsVersion, setAssignmentsVersion] = useState(0)

  const toggleTheme = () => {
    setTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark'
      localStorage.setItem('gf-theme', next)
      return next
    })
  }

  const t = THEMES[theme]

  useEffect(() => {
    document.body.style.background = t.bg
    document.body.style.margin = '0'
    document.body.style.padding = '0'
  }, [t.bg])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (!session?.user) { setLoading(false); setBootstrapped(true) }
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (!session?.user) { setProfile(null); setLoading(false); setBootstrapped(true) }
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!user) return
    setLoading(true)
    Promise.all([getProfile(user.id), getStruggleMap(user.id)])
      .then(([prof, map]) => {
        setProfile(prof)
        setStruggleMap(map)
        setLoading(false)
        setBootstrapped(true)
        if (prof) getSubscriptions(user.id).then(subs => {
          setSubscriptions(subs)
          setSubscriptionsLoaded(true)
          // Migrate legacy Year 10 Maths variants → unified maths_y10 tile,
          // then evict a persisted subject the user is no longer subscribed to.
          let stored = (() => { try { return JSON.parse(localStorage.getItem('gf-subject')) } catch { return null } })()
          if (stored && (stored.id === 'vic_maths_y10' || stored.id === 'vic_maths_y10a' || (stored.stage === 'Year 10' && stored.name === 'Mathematics (10A)'))) {
            const unified = ALL_SUBJECTS.find(s => s.id === 'maths_y10')
            if (unified) {
              stored = unified
              localStorage.setItem('gf-subject', JSON.stringify(unified))
              setSelectedSubject(unified)
            }
          }
          if (stored && subs.length > 0 && !subs.some(s => s.subject_name === stored.name && s.stage === stored.stage)) {
            localStorage.removeItem('gf-subject')
            setSelectedSubject(null)
          }
        }).catch(() => { setSubscriptionsLoaded(true) })
      })
      .catch(() => { setLoading(false); setBootstrapped(true) })
  }, [user])

  // Reload questions if subject was persisted but questions are empty
  useEffect(() => {
    if (!selectedSubject || questions.length > 0) return
    getQuestions(QUESTIONS_SUBJECT_BY_ID[selectedSubject.id] || selectedSubject.name)
      .then(qs => setQuestions(qs))
      .catch(() => {})
  }, [selectedSubject])

  const handleSelectSubject = async (subject) => {
    setSelectedSubject(subject)
    localStorage.setItem('gf-subject', JSON.stringify(subject))
    const qs = await getQuestions(QUESTIONS_SUBJECT_BY_ID[subject.id] || subject.name)
    setQuestions(qs)
    navigate('/home')
  }

  const handleSignOut = async () => {
    await signOut()
    setSelectedSubject(null)
    localStorage.removeItem('gf-subject')
    setQuestions([])
    setLearnPhase('setup')
    setLearnMessages([])
    setLearnTopic('')
    setQuestionContext(null)
    setConsolidateSubtopic(null)
    setQuizQ(null)
    setQuizResults([])
    setQuizAnswered([])
    setQuizQNumber(1)
    setQuizSessionXP(0)
    setQuizMode('new')
    setQuizFinished(false)
    setQuizSessionTip('')
    setQuizSessionTipLoading(false)
    setQuizSubtopics([])
    setQuizRemediationMode(false)
    setQuizRemediationStreak(0)
    setQuizRemediationTarget(3)
    setQuizRemediationQueue([])
    setQuizRemediationStatus('idle')
    setQuizRemediationSource('prebuilt')
    setQuizRemediationConcept(null)
    setQuizRemediationParentId(null)
    setQuizRemediationOriginalQ(null)
    setQuizRemediationUsedIds([])
    setQuizRemediationWrongCount(0)
    navigate('/home')
  }

  const handleChangeSubject = () => {
    setSelectedSubject(null)
    localStorage.removeItem('gf-subject')
    setQuestions([])
    setQuizQ(null)
    setQuizSelected(null)
    setQuizShowAns(false)
    setQuizCorrect(null)
    setQuizEarnedXP(0)
    setQuizResults([])
    setQuizAnswered([])
    setQuizQNumber(1)
    setQuizSessionXP(0)
    setQuizMode('new')
    setQuizFinished(false)
    setQuizSessionTip('')
    setQuizSessionTipLoading(false)
    setQuizSubtopics([])
    setQuizRemediationMode(false)
    setQuizRemediationStreak(0)
    setQuizRemediationTarget(3)
    setQuizRemediationQueue([])
    setQuizRemediationStatus('idle')
    setQuizRemediationSource('prebuilt')
    setQuizRemediationConcept(null)
    setQuizRemediationParentId(null)
    setQuizRemediationOriginalQ(null)
    setQuizRemediationUsedIds([])
    setQuizRemediationWrongCount(0)
    setSubscriptionsLoaded(false)
    navigate('/home')
  }

  const commonProps  = { theme, onToggleTheme: toggleTheme }
  const quizState = {
    currentQ: quizQ,           setCurrentQ: setQuizQ,
    selected: quizSelected,    setSelected: setQuizSelected,
    showAns: quizShowAns,      setShowAns: setQuizShowAns,
    correct: quizCorrect,      setCorrect: setQuizCorrect,
    earnedXP: quizEarnedXP,    setEarnedXP: setQuizEarnedXP,
    streak: quizStreak,        setStreak: setQuizStreak,
    sessionXP: quizSessionXP,  setSessionXP: setQuizSessionXP,
    sessionResults: quizResults, setSessionResults: setQuizResults,
    sessionAnswered: quizAnswered, setSessionAnswered: setQuizAnswered,
    qNumber: quizQNumber,      setQNumber: setQuizQNumber,
    quizMode,                  setQuizMode,
    quizSubtopics,             setQuizSubtopics,
    aiTip: quizAiTip,          setAiTip: setQuizAiTip,
    loadingTip: quizLoadingTip, setLoadingTip: setQuizLoadingTip,
    remediationMode: quizRemediationMode,           setRemediationMode: setQuizRemediationMode,
    remediationStreak: quizRemediationStreak,       setRemediationStreak: setQuizRemediationStreak,
    remediationTarget: quizRemediationTarget,       setRemediationTarget: setQuizRemediationTarget,
    remediationQueue: quizRemediationQueue,         setRemediationQueue: setQuizRemediationQueue,
    remediationStatus: quizRemediationStatus,       setRemediationStatus: setQuizRemediationStatus,
    remediationSource: quizRemediationSource,       setRemediationSource: setQuizRemediationSource,
    remediationConcept: quizRemediationConcept,     setRemediationConcept: setQuizRemediationConcept,
    remediationParentId: quizRemediationParentId,   setRemediationParentId: setQuizRemediationParentId,
    remediationOriginalQ: quizRemediationOriginalQ, setRemediationOriginalQ: setQuizRemediationOriginalQ,
    remediationUsedIds: quizRemediationUsedIds,     setRemediationUsedIds: setQuizRemediationUsedIds,
    remediationWrongCount: quizRemediationWrongCount, setRemediationWrongCount: setQuizRemediationWrongCount,
    finished: quizFinished, setFinished: setQuizFinished,
    sessionTip: quizSessionTip, setSessionTip: setQuizSessionTip,
    sessionTipLoading: quizSessionTipLoading, setSessionTipLoading: setQuizSessionTipLoading,
  }

  const quizIsActive = location.pathname === '/quiz' && quizAnswered.length > 0 && !quizFinished
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      quizIsActive &&
      currentLocation.pathname === '/quiz' &&
      nextLocation.pathname !== '/quiz'
  )

  useEffect(() => {
    if (quizFinished && quizAnswered.length > 0) setLastSessionAt(Date.now())
  }, [quizFinished, quizAnswered.length])

  const learnState   = {
    phase: learnPhase,       setPhase: setLearnPhase,
    topic: learnTopic,       setTopic: setLearnTopic,
    messages: learnMessages, setMessages: setLearnMessages,
    interests: learnInterests, setInterests: setLearnInterests,
    docContext: learnDocContext, setDocContext: setLearnDocContext,
    docName: learnDocName,   setDocName: setLearnDocName,
    questionContext, setQuestionContext,
    onConsolidate: (subtopic) => {
      setConsolidateSubtopic(subtopic)
      // Reset quiz session so the filtered practice starts fresh in 'all' mode
      setQuizQ(null)
      setQuizSelected(null)
      setQuizShowAns(false)
      setQuizCorrect(null)
      setQuizEarnedXP(0)
      setQuizStreak(0)
      setQuizSessionXP(0)
      setQuizResults([])
      setQuizAnswered([])
      setQuizQNumber(1)
      setQuizAiTip('')
      setQuizLoadingTip(false)
      setQuizMode('all')    // 'all' ensures subtopic questions are always available
      setQuizSubtopics([])  // consolidation uses its own state, not quizSubtopics
      setQuizRemediationMode(false)
      setQuizRemediationStreak(0)
      setQuizRemediationTarget(3)
      setQuizRemediationQueue([])
      setQuizRemediationStatus('idle')
      setQuizRemediationSource('prebuilt')
      setQuizRemediationConcept(null)
      setQuizRemediationParentId(null)
      setQuizRemediationOriginalQ(null)
      setQuizRemediationUsedIds([])
      setQuizRemediationWrongCount(0)
      navigate('/quiz')
    },
  }

  if (!bootstrapped && loading) return (
    <div style={{ minHeight: '100vh', background: t.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <style>{`@keyframes gf-bootspin { to { transform: rotate(360deg); } }`}</style>
      <div
        role="status"
        aria-label="Loading"
        style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          border: '2px solid rgba(241,190,67,0.18)',
          borderTopColor: GOLD,
          animation: 'gf-bootspin 0.8s linear infinite',
        }}
      />
    </div>
  )

  const shellProps = {
    ...commonProps,
    profile,
    subject: selectedSubject,
    onChangeSubject: handleChangeSubject,
    onSignOut: handleSignOut,
  }

  return (
    <>
    <NavBlockerModal blocker={blocker} theme={theme} />
    <Routes>
      {/* Root → landing if not logged in, dashboard if logged in */}
      <Route path="/" element={<Navigate to="/home" replace />} />
      <Route path="/terms"   element={<TermsScreen />} />
      <Route path="/privacy" element={<PrivacyScreen />} />

      {/* Landing page — public */}
      <Route path="/home" element={
        (user && profile)
          ? <Navigate to={profile.is_tutor ? '/tutor' : '/question-bank'} replace />
          : <LandingPage onGetStarted={() => navigate('/auth')} onSignIn={() => navigate('/auth')} />
      } />

      {/* Auth — public */}
      <Route path="/auth" element={
        (user && profile)
          ? <Navigate to={profile.is_tutor ? '/tutor' : '/question-bank'} replace />
          : <AuthScreen {...commonProps} onAuth={(isNewUser) => navigate(isNewUser ? '/onboarding' : '/home', { replace: true })} onBack={() => navigate('/home')} />
      } />

      {/* Onboarding — new users only */}
      <Route path="/onboarding" element={
        !(user && profile)
          ? <Navigate to="/home" replace />
          : profile.onboarding_completed
            ? <Navigate to="/subject-picker" replace />
            : <OnboardingScreen profile={profile} userEmail={user?.email} onDone={async () => {
                try {
                  const subs = await getSubscriptions(profile.id)
                  setSubscriptions(subs)
                  setSubscriptionsLoaded(true)
                } catch {}
                setProfile(prev => ({ ...prev, onboarding_completed: true }))
                navigate('/subject-picker', { replace: true })
              }} />
      } />

      {/* Subject picker — logged in only */}
      <Route path="/subject-picker" element={
        !(user && profile)
          ? <Navigate to="/home" replace />
          : <SubjectPicker {...commonProps} profile={profile} subscriptions={subscriptions} onSelect={handleSelectSubject} onGetAccess={subj => navigate('/get-access', { state: { subject: subj } })} />
      } />

      {/* Get access / purchase page */}
      <Route path="/get-access" element={
        !(user && profile)
          ? <Navigate to="/home" replace />
          : <GetAccessScreen profile={profile} onAccessGranted={refreshSubscriptions} />
      } />

      {/* Quiz — wrapped in AppShell so the shared sidebar appears */}
      <Route path="/quiz" element={
        !(user && profile)
          ? <Navigate to="/home" replace />
          : <AppShell {...shellProps}>
              <QuizScreen {...commonProps} {...quizState}
              profile={profile} setProfile={setProfile}
              questions={questions} struggleMap={struggleMap} setStruggleMap={setStruggleMap}
              onHome={() => navigate('/question-bank')}
              onOpenLearn={(topic, ctx) => {
                if (topic) setLearnTopic(topic)
                if (ctx) setQuestionContext(ctx)
                setLearnPhase('setup')
                setLearnMessages([])
                navigate('/learn')
              }}
              consolidateSubtopic={consolidateSubtopic}
              onClearConsolidate={() => setConsolidateSubtopic(null)}
              activeAssignmentId={activeAssignmentId}
              onAssignmentComplete={() => {
                setActiveAssignmentId(null)
                setAssignmentsVersion(v => v + 1)
              }}
              onBankQuestionsAdded={(newQs) => {
                if (!Array.isArray(newQs) || newQs.length === 0) return
                setQuestions(prev => {
                  const existingIds = new Set(prev.map(q => q.id))
                  const existingTexts = new Set(prev.map(q => (q.question || '').trim().toLowerCase()))
                  const fresh = newQs.filter(q =>
                    !existingIds.has(q.id) &&
                    !existingTexts.has((q.question || '').trim().toLowerCase())
                  )
                  return fresh.length ? [...prev, ...fresh] : prev
                })
              }}
              onGoToStudyPlan={() => navigate('/study-plan')} />
            </AppShell>
      } />

      {/* Admin — is_admin only */}
      <Route path="/admin/*" element={
        !(user && profile)
          ? <Navigate to="/home" replace />
          : <AdminRoute profile={profile}>
              <AdminScreen profile={profile} />
            </AdminRoute>
      } />

      {/* Tutor — is_tutor only. Wrapped in AppShell so the redesigned sidebar (incl. active Tutor Dashboard state) is present here too. */}
      <Route path="/tutor" element={
        !(user && profile)
          ? <Navigate to="/home" replace />
          : <TutorRoute profile={profile}>
              <AppShell {...shellProps}>
                <TutorScreen profile={profile} theme={theme} />
              </AppShell>
            </TutorRoute>
      } />

      {/* Single shell route — AppShellScreens stays mounted across ALL tab switches */}
      <Route path="/*" element={
        !(user && profile) ? <Navigate to="/home" replace /> :
        !profile.onboarding_completed ? <Navigate to="/onboarding" replace /> :
        !selectedSubject ? <Navigate to="/subject-picker" replace /> :
        (subscriptionsLoaded && subscriptions.length > 0 && !subscriptions.some(s => s.subject_name === selectedSubject?.name && s.stage === selectedSubject?.stage)) ? <LockedSubjectScreen subject={selectedSubject} onChangeSubject={shellProps.onChangeSubject} theme={theme} /> :
        <AppShellScreens {...shellProps} {...learnState}
          profile={profile} questions={questions} struggleMap={struggleMap}
          setStruggleMap={setStruggleMap} subject={selectedSubject}
          assignmentsVersion={assignmentsVersion}
          lastSessionAt={lastSessionAt}
          onOpenLearn={(nextTopic) => {
            if (nextTopic) setLearnTopic(nextTopic)
            setLearnPhase('setup')
            navigate('/learn')
          }}
          onStartSession={async (opts) => {
            const nextMode = opts?.mode || 'new'
            const nextSubtopics = Array.isArray(opts?.subtopics) ? opts.subtopics : []
            setActiveAssignmentId(opts?.assignmentId ?? null)

            // If assignment specifies a subject, switch to it and load the right question bank
            let activeQuestions = questions
            let activeSubject = selectedSubject
            if (opts?.assignmentSubject) {
              const matchingSubject = ALL_SUBJECTS.find(
                s => `${s.name} ${s.stage}` === opts.assignmentSubject
              )
              if (matchingSubject && matchingSubject.id !== selectedSubject?.id) {
                setSelectedSubject(matchingSubject)
                localStorage.setItem('gf-subject', JSON.stringify(matchingSubject))
                const qs = await getQuestions(QUESTIONS_SUBJECT_BY_ID[matchingSubject.id] || matchingSubject.name)
                setQuestions(qs)
                activeQuestions = qs
                activeSubject = matchingSubject
              }
            }

            // Assignment entries may be topic names OR subtopic names. Expand topic
            // names to their matching subtopics; keep direct subtopic matches as-is.
            let expandedSubtopics = nextSubtopics
            if (opts?.assignmentId && nextSubtopics.length > 0) {
              const { normFn } = getY7TopicConfig(activeSubject?.id) ?? getTopicConfig(activeSubject?.stage)
              const allSubtopicsLower = new Map()
              activeQuestions.forEach(q => {
                if (q.subtopic) allSubtopicsLower.set(q.subtopic.toLowerCase(), q.subtopic)
              })
              const wantedTopicsLower = new Set()
              const directSubtopics = new Set()
              nextSubtopics.forEach(entry => {
                const lower = entry.toLowerCase()
                if (allSubtopicsLower.has(lower)) {
                  directSubtopics.add(allSubtopicsLower.get(lower))
                } else {
                  wantedTopicsLower.add((normFn?.(entry) || entry).toLowerCase())
                }
              })
              const expanded = new Set(directSubtopics)
              activeQuestions.forEach(q => {
                const tNorm = (normFn?.(q.topic) || q.topic || '').toLowerCase()
                if (wantedTopicsLower.has(tNorm) && q.subtopic) expanded.add(q.subtopic)
              })
              if (expanded.size > 0) expandedSubtopics = Array.from(expanded)
            }

            setQuizMode(nextMode)
            setQuizSubtopics(expandedSubtopics)
            setQuizQ(null)
            setQuizSelected(null)
            setQuizShowAns(false)
            setQuizCorrect(null)
            setQuizEarnedXP(0)
            setQuizStreak(profile?.streak || 0)
            setQuizSessionXP(0)
            setQuizResults([])
            setQuizAnswered([])
            setQuizQNumber(1)
            setQuizAiTip('')
            setQuizLoadingTip(false)
            setQuizRemediationMode(false)
            setQuizRemediationStreak(0)
            setQuizRemediationTarget(3)
            setQuizRemediationQueue([])
            setQuizRemediationStatus('idle')
            setQuizRemediationSource('prebuilt')
            setQuizRemediationConcept(null)
            setQuizRemediationParentId(null)
            setQuizRemediationOriginalQ(null)
            setQuizRemediationUsedIds([])
            setQuizRemediationWrongCount(0)
            setConsolidateSubtopic(null)
            setQuizFinished(false)
            setQuizSessionTip('')
            setQuizSessionTipLoading(false)
            navigate('/quiz')
          }} quizSubtopics={quizSubtopics} setQuizSubtopics={setQuizSubtopics} />
      } />
    </Routes>
    </>
  )
}

const router = createBrowserRouter([{ path: '*', element: <AppInner /> }])

export default function App() {
  return <RouterProvider router={router} />
}
