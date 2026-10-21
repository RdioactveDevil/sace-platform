import { useState, useEffect, useCallback, useRef } from 'react'
import { Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, GraduationCap, UserCog, Inbox, UsersRound, BookOpen, Sparkles, ImageUp,
  Upload, ListChecks, Eye, ChartColumn, ClipboardList, Settings,
} from 'lucide-react'
import './TutorDashboard.css'
import AdminOverviewTab          from './AdminOverviewTab'
import AdminUploadScreen         from './AdminUploadScreen'
import AdminGenerateScreen       from './AdminGenerateScreen'
import AdminVisionScreen         from './AdminVisionScreen'
import AdminReviewScreen         from './AdminReviewScreen'
import AdminUsersTab             from './AdminUsersTab'
import AdminStudentsTab          from './AdminStudentsTab'
import AdminTutorsTab            from './AdminTutorsTab'
import AdminAssignmentsTab       from './AdminAssignmentsTab'
import AdminTutorApplicationsTab from './AdminTutorApplicationsTab'
import AdminCurriculaTab         from './AdminCurriculaTab'
import AdminCurriculumDetail     from './AdminCurriculumDetail'
import AdminCohortTab            from './AdminCohortTab'
import AdminSettingsTab          from './AdminSettingsTab'
import AdminQuestionPreviewTab   from './AdminQuestionPreviewTab'
import { adminListTutorApplications } from '../lib/db'
import { getDraftQuestions } from '../lib/adminDb'

const FONT_B = "'Plus Jakarta Sans', sans-serif"
const FONT_D = "'Sifonn Pro', sans-serif"
const GOLD   = '#f1be43'
const GOLDL  = '#f9d87a'

function CurriculaRouter() {
  const [selectedId, setSelectedId] = useState(null)

  if (selectedId) {
    return (
      <AdminCurriculumDetail
        curriculumId={selectedId}
        onBack={() => setSelectedId(null)}
        onGoLive={() => {}}
      />
    )
  }
  return <AdminCurriculaTab onSelectCurriculum={setSelectedId} />
}

// ── Navigation model ──────────────────────────────────────────────────────────
// Laid out like the Tutor Portal (TutorScreen): a portal sidebar beside the app
// sidebar, a title bar per section, and a tab strip on phones. The admin tabs
// are styled for dark, so this portal stays dark in both themes.
const NAV_GROUPS = [
  { label: 'Main', items: [
    { path: 'overview',     label: 'Overview',           icon: LayoutDashboard, sub: 'Platform health and what needs attention.' },
  ]},
  { label: 'People', items: [
    { path: 'students',     label: 'Students',           icon: GraduationCap,   sub: 'Every student, their progress and subject access.' },
    { path: 'tutors',       label: 'Tutors',             icon: UserCog,         sub: 'Tutors, their rosters and the work they set.' },
    { path: 'applications', label: 'Tutor Applications', icon: Inbox,           sub: 'Approve or decline people applying to tutor.' },
    { path: 'users',        label: 'All Users',          icon: UsersRound,      sub: 'Every account, with roles and status.' },
  ]},
  { label: 'Content', items: [
    { path: 'curricula',    label: 'Curricula',          icon: BookOpen,        sub: 'Subjects, topics and what students can see.' },
    { path: 'generate',     label: 'Generate',           icon: Sparkles,        sub: 'Create questions with AI.' },
    { path: 'vision',       label: 'From Image',         icon: ImageUp,         sub: 'Turn photos of questions into bank questions.' },
    { path: 'upload',       label: 'Upload PDF',         icon: Upload,          sub: 'Extract questions from a document.' },
    { path: 'review',       label: 'Review Queue',       icon: ListChecks,      sub: 'Check drafted questions before they go live.' },
    { path: 'preview',      label: 'Preview Question',   icon: Eye,             sub: 'See a question exactly as students will.' },
  ]},
  { label: 'Insights', items: [
    { path: 'cohort',       label: 'Cohort Analytics',   icon: ChartColumn,     sub: 'How students are doing across the platform.' },
    { path: 'assignments',  label: 'Assignments',        icon: ClipboardList,   sub: 'Work set by every tutor, and how it’s going.' },
  ]},
  { label: 'Platform', items: [
    { path: 'settings',     label: 'Settings',           icon: Settings,        sub: 'Student access and pricing.' },
  ]},
]
const NAV_ITEMS = NAV_GROUPS.flatMap(g => g.items)

// Dark portal palette — the same values TutorScreen uses in dark theme.
const C = {
  bg:        '#06071a',
  sidebarBdr:'rgba(255,255,255,0.07)',
  headerBg:  'rgba(6,7,26,0.92)',
  groupLbl:  'rgba(255,255,255,0.22)',
  item:      'rgba(255,255,255,0.52)',
  text:      '#f0f4ff',
  textMuted: 'rgba(255,255,255,0.5)',
}

// Count badges: neutral for totals, red for things waiting on an admin.
function NavBadge({ value, attention = false, compact = false }) {
  if (value == null || (attention && !value)) return null
  return (
    <span style={{
      fontSize: 10, fontWeight: compact ? 800 : 700, borderRadius: 20, lineHeight: compact ? '17px' : undefined,
      minWidth: compact ? 17 : undefined, height: compact ? 17 : undefined, textAlign: 'center',
      padding: compact ? '0 5px' : '2px 7px',
      background: attention ? 'rgba(248,113,113,0.18)' : 'rgba(255,255,255,0.08)',
      color: attention ? '#f87171' : 'rgba(255,255,255,0.7)',
      border: compact ? 'none' : `1px solid ${attention ? 'rgba(248,113,113,0.30)' : 'rgba(255,255,255,0.10)'}`,
    }}>
      {value}
    </span>
  )
}

export default function AdminScreen({ profile }) {
  const location = useLocation()
  const [studentCount, setStudentCount] = useState(null)
  const [pendingApps, setPendingApps]   = useState(0)
  const [reviewCount, setReviewCount]   = useState(0)
  const [collapsed, setCollapsed]       = useState(false)
  const activeMobileTab = useRef(null)

  const loadBadges = useCallback(async () => {
    try {
      const apps = await adminListTutorApplications()
      setPendingApps(apps.length)
    } catch {}
    try {
      const [pending, needs] = await Promise.all([
        getDraftQuestions({ status: 'pending' }).catch(() => []),
        getDraftQuestions({ status: 'needs_review' }).catch(() => []),
      ])
      setReviewCount(pending.length + needs.length)
    } catch {}
  }, [])

  useEffect(() => {
    loadBadges()
    const id = setInterval(loadBadges, 60_000)
    const onFocus = () => loadBadges()
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(id); window.removeEventListener('focus', onFocus) }
  }, [loadBadges])

  const section = location.pathname.replace(/^\/admin\/?/, '').split('/')[0] || 'overview'
  const meta = NAV_ITEMS.find(i => i.path === section) || NAV_ITEMS[0]
  const badgeFor = (path) => (
    path === 'students'     ? { value: studentCount } :
    path === 'applications' ? { value: pendingApps, attention: true } :
    path === 'review'       ? { value: reviewCount, attention: true } :
    null
  )

  // Phones: keep the selected tab visible in the swipeable tab strip.
  useEffect(() => {
    activeMobileTab.current?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [section])

  const SIDEBAR_W = collapsed ? 74 : 224

  const sidebar = (
    <aside style={{
      width: SIDEBAR_W, flexShrink: 0,
      background: 'linear-gradient(180deg, #08091f 0%, #070918 100%)',
      borderRight: `1px solid ${C.sidebarBdr}`,
      display: 'flex', flexDirection: 'column', height: '100%', transition: 'width 0.18s',
      boxShadow: '4px 0 24px rgba(0,0,0,0.28)',
    }}>
      {/* Portal label. The app sidebar beside this one already shows the logo. */}
      <div style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start', padding: collapsed ? '0 12px' : '0 20px', borderBottom: `1px solid ${C.sidebarBdr}` }}>
        <div title={collapsed ? 'Admin Portal' : undefined} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(241,190,67,0.12)', border: '1px solid rgba(241,190,67,0.28)', borderRadius: 30, padding: collapsed ? '6px' : '6px 14px' }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: GOLD, boxShadow: '0 0 8px rgba(241,190,67,0.9)', flexShrink: 0 }} />
          {!collapsed && <span style={{ fontFamily: FONT_D, fontSize: 10, letterSpacing: '0.18em', color: GOLD, whiteSpace: 'nowrap' }}>ADMIN PORTAL</span>}
        </div>
      </div>

      <nav aria-label="Admin portal sections" style={{ flex: 1, overflowY: 'auto', padding: '10px 10px' }}>
        {NAV_GROUPS.map(group => (
          <div key={group.label} style={{ marginTop: 14 }}>
            {!collapsed && (
              <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.groupLbl, padding: '4px 12px 6px' }}>{group.label}</div>
            )}
            {group.items.map(item => {
              const active = section === item.path
              const badge = badgeFor(item.path)
              return (
                <NavLink key={item.path} to={`/admin/${item.path}`} title={collapsed ? item.label : undefined}
                  className={`td-nav-item${active ? ' active' : ''}`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 11, width: '100%', boxSizing: 'border-box',
                    padding: collapsed ? '11px 0' : '10px 14px',
                    justifyContent: collapsed ? 'center' : undefined,
                    margin: '1px 0', textDecoration: 'none',
                    fontFamily: FONT_B, fontSize: 13, fontWeight: active ? 700 : 500, whiteSpace: 'nowrap',
                    color: active ? GOLD : C.item,
                  }}
                >
                  <span style={{ display: 'flex', flexShrink: 0, opacity: active ? 1 : 0.75 }}><item.icon size={17} aria-hidden="true" /></span>
                  {!collapsed && <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>}
                  {!collapsed && badge && <NavBadge {...badge} />}
                </NavLink>
              )
            })}
          </div>
        ))}
      </nav>

      {/* User profile footer */}
      <div style={{ padding: '10px 10px 12px', borderTop: `1px solid ${C.sidebarBdr}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{
            width: 34, height: 34, borderRadius: '50%',
            background: `linear-gradient(135deg,${GOLD},${GOLDL})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, color: '#0c1037', flexShrink: 0, fontSize: 14,
            boxShadow: '0 0 14px rgba(241,190,67,0.35)',
          }}>
            {(profile?.display_name || '?')[0].toUpperCase()}
          </div>
          {!collapsed && (
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.92)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile?.display_name || 'Admin'}</div>
              <div style={{ fontSize: 11, color: GOLD, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Admin</div>
            </div>
          )}
        </div>
      </div>
    </aside>
  )

  return (
    <div
      className="td-root"
      style={{
        flex: 1, display: 'flex', minHeight: 0,
        background: C.bg,
        backgroundImage: 'radial-gradient(ellipse 900px 700px at 85% -8%, rgba(241,190,67,0.055) 0%, transparent 55%), radial-gradient(ellipse 700px 600px at -5% 95%, rgba(99,102,241,0.05) 0%, transparent 60%)',
        fontFamily: FONT_B, color: '#fff',
      }}
    >
      {/* Desktop sidebar */}
      <div className="tutor-desktop-sidebar" style={{ display: 'flex', height: '100vh', position: 'sticky', top: 0 }}>{sidebar}</div>

      {/* Main column. On phones the sidebar is replaced by a tab strip in the header. */}
      <div className="td-main" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', height: '100vh' }}>
        <header className="td-header" style={{
          position: 'sticky', top: 0, zIndex: 20, display: 'flex', alignItems: 'center', gap: 14,
          padding: '0 24px', background: C.headerBg, backdropFilter: 'blur(16px)',
          borderBottom: `1px solid ${C.sidebarBdr}`, minHeight: 64, height: 64,
        }}>
          <span className="td-header-sep" />
          <button className="td-collapse-btn" onClick={() => setCollapsed(v => !v)} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid rgba(255,255,255,0.10)', background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 14, flexShrink: 0, transition: 'background 0.12s' }}>☰</button>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 18, fontFamily: FONT_D, fontWeight: 400, letterSpacing: '0.04em', color: C.text, lineHeight: 1.1 }}>{meta.label}</div>
            <div className="td-header-sub" style={{ fontSize: 11, color: C.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 3, letterSpacing: '0.02em' }}>{meta.sub}</div>
          </div>
          {/* Phones: every section as a swipeable strip of tabs */}
          <nav className="tutor-mobile-only td-mobile-tabs" aria-label="Admin portal sections">
            {NAV_ITEMS.map(item => {
              const active = section === item.path
              const badge = badgeFor(item.path)
              return (
                <NavLink key={item.path} to={`/admin/${item.path}`} ref={active ? activeMobileTab : undefined} aria-current={active ? 'page' : undefined}
                  style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px', borderRadius: 999, textDecoration: 'none', fontFamily: FONT_B, fontSize: 12.5, fontWeight: active ? 800 : 600, whiteSpace: 'nowrap',
                    border: `1px solid ${active ? 'rgba(241,190,67,0.55)' : 'rgba(255,255,255,0.10)'}`,
                    background: active ? 'rgba(241,190,67,0.16)' : 'transparent',
                    color: active ? GOLD : C.item }}>
                  <item.icon size={14} aria-hidden="true" />
                  {item.label}
                  {badge && <NavBadge {...badge} compact />}
                </NavLink>
              )
            })}
          </nav>
        </header>

        {/* Section content */}
        <div className="td-content" style={{ flex: 1, overflowY: 'auto', padding: '28px 28px 56px' }}>
          <div key={section} className="td-content-enter" style={{ maxWidth: 1320, width: '100%', margin: '0 auto' }}>
            <Routes>
              <Route index element={<Navigate to="overview" replace />} />
              <Route path="overview"     element={<AdminOverviewTab />} />
              <Route path="students"     element={<AdminStudentsTab profile={profile} onCountLoad={setStudentCount} />} />
              <Route path="cohort"       element={<AdminCohortTab />} />
              <Route path="tutors"       element={<AdminTutorsTab />} />
              <Route path="assignments"  element={<AdminAssignmentsTab />} />
              <Route path="curricula"    element={<CurriculaRouter />} />
              <Route path="users"        element={<AdminUsersTab profile={profile} />} />
              <Route path="applications" element={<AdminTutorApplicationsTab />} />
              <Route path="upload"       element={<AdminUploadScreen />} />
              <Route path="generate"     element={<AdminGenerateScreen />} />
              <Route path="vision"       element={<AdminVisionScreen />} />
              <Route path="review"       element={<AdminReviewScreen profile={profile} />} />
              <Route path="preview"      element={<AdminQuestionPreviewTab />} />
              <Route path="settings"     element={<AdminSettingsTab />} />
            </Routes>
          </div>
        </div>
      </div>
    </div>
  )
}
