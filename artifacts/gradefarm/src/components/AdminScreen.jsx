import { useState, useEffect, useCallback } from 'react'
import { Routes, Route, NavLink, Navigate, useNavigate } from 'react-router-dom'
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

// ── Nav icons ───────────────────────────────────────────────────────────────
function NavIcon({ name }) {
  const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }
  return (
    <svg width={16} height={16} viewBox="0 0 18 18" style={{ flexShrink: 0, display: 'block' }} aria-hidden="true">
      {name === 'overview' && <><rect x="2.5" y="2.5" width="5.5" height="5.5" rx="1" {...S} /><rect x="10" y="2.5" width="5.5" height="5.5" rx="1" {...S} /><rect x="2.5" y="10" width="5.5" height="5.5" rx="1" {...S} /><rect x="10" y="10" width="5.5" height="5.5" rx="1" {...S} /></>}
      {name === 'students' && <><circle cx="6.5" cy="6" r="2.5" {...S} /><path d="M2.5 14.5a4 4 0 0 1 8 0" {...S} /><path d="M12 4.2a2.3 2.3 0 0 1 0 4.3" {...S} /><path d="M12.5 11.2a4 4 0 0 1 3 3.3" {...S} /></>}
      {name === 'tutors'   && <><circle cx="9" cy="6.25" r="3" {...S} /><path d="M3.25 15.5a5.75 5.75 0 0 1 11.5 0" {...S} /></>}
      {name === 'inbox'    && <><path d="M2.5 9.5 4.5 3.5h9l2 6" {...S} /><path d="M2.5 9.5v4a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-4" {...S} /><path d="M2.5 9.5h3.5l1 1.5h4l1-1.5h3.5" {...S} /></>}
      {name === 'users'    && <><path d="M3 4.5h12" {...S} /><path d="M3 9h12" {...S} /><path d="M3 13.5h12" {...S} /></>}
      {name === 'book'     && <><path d="M3 4.25A1.25 1.25 0 0 1 4.25 3H9v11H4.25A1.25 1.25 0 0 1 3 12.75Z" {...S} /><path d="M9 3h4.75A1.25 1.25 0 0 1 15 4.25v8.5A1.25 1.25 0 0 1 13.75 14H9Z" {...S} /></>}
      {name === 'sparkles' && <><path d="M9 2.5 10.2 6.2 14 7.4l-3.8 1.2L9 12.3 7.8 8.6 4 7.4l3.8-1.2Z" {...S} /></>}
      {name === 'upload'   && <><path d="M9 11.5V3.5" {...S} /><path d="M6 6l3-3 3 3" {...S} /><path d="M3.5 11.5v2a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-2" {...S} /></>}
      {name === 'check'    && <><circle cx="9" cy="9" r="6.5" {...S} /><path d="m6.25 9 1.9 1.9 3.6-3.8" {...S} /></>}
      {name === 'eye'      && <><path d="M1.5 9S4.5 4 9 4s7.5 5 7.5 5-3 5-7.5 5S1.5 9 1.5 9Z" {...S} /><circle cx="9" cy="9" r="2" {...S} /></>}
      {name === 'chart'    && <><rect x="2.5" y="10" width="3" height="5" rx="0.6" {...S} /><rect x="7.5" y="6" width="3" height="9" rx="0.6" {...S} /><rect x="12.5" y="3" width="3" height="12" rx="0.6" {...S} /></>}
      {name === 'clipboard'&& <><rect x="4" y="3.5" width="10" height="12" rx="1.2" {...S} /><path d="M6.75 3.5V2.75A.75.75 0 0 1 7.5 2h3a.75.75 0 0 1 .75.75v.75" {...S} /><path d="M6.5 8h5M6.5 11h3" {...S} /></>}
      {name === 'gear'     && <><circle cx="9" cy="9" r="2.25" {...S} /><path d="M9 2.5v1.6M9 13.9v1.6M2.5 9h1.6M13.9 9h1.6M4.4 4.4l1.1 1.1M12.5 12.5l1.1 1.1M13.6 4.4l-1.1 1.1M5.5 12.5l-1.1 1.1" {...S} /></>}
    </svg>
  )
}

// ── Navigation model ──────────────────────────────────────────────────────────
function buildGroups({ studentCount, pendingApps, reviewCount }) {
  return [
    {
      heading: null,
      items: [
        { label: 'Overview', path: '/admin/overview', icon: 'overview' },
      ],
    },
    {
      heading: 'People',
      items: [
        { label: 'Students',           path: '/admin/students',     icon: 'students', badge: studentCount },
        { label: 'Tutors',             path: '/admin/tutors',       icon: 'tutors' },
        { label: 'Tutor Applications', path: '/admin/applications', icon: 'inbox', attention: pendingApps },
        { label: 'All Users',          path: '/admin/users',        icon: 'users' },
      ],
    },
    {
      heading: 'Content',
      items: [
        { label: 'Curricula',        path: '/admin/curricula', icon: 'book' },
        { label: 'Generate',         path: '/admin/generate',  icon: 'sparkles' },
        { label: 'From Image',       path: '/admin/vision',    icon: 'sparkles' },
        { label: 'Upload PDF',       path: '/admin/upload',    icon: 'upload' },
        { label: 'Review Queue',     path: '/admin/review',    icon: 'check', attention: reviewCount },
        { label: 'Preview Question', path: '/admin/preview',   icon: 'eye' },
      ],
    },
    {
      heading: 'Insights',
      items: [
        { label: 'Cohort Analytics', path: '/admin/cohort',      icon: 'chart' },
        { label: 'Assignments',      path: '/admin/assignments', icon: 'clipboard' },
      ],
    },
    {
      heading: 'Platform',
      items: [
        { label: 'Settings', path: '/admin/settings', icon: 'gear' },
      ],
    },
  ]
}

function CountBadge({ value }) {
  if (value == null) return null
  return (
    <span style={{
      fontSize: 10, fontWeight: 800,
      background: `${GOLD}22`, color: GOLD, border: `1px solid ${GOLD}44`,
      borderRadius: 5, padding: '1px 5px', lineHeight: 1.4,
    }}>
      {value}
    </span>
  )
}

function AttentionBadge({ value }) {
  if (!value) return null
  return (
    <span style={{
      fontSize: 10, fontWeight: 800,
      background: 'rgba(248,113,113,0.18)', color: '#f87171', border: '1px solid rgba(248,113,113,0.45)',
      borderRadius: 999, minWidth: 17, textAlign: 'center', padding: '1px 5px', lineHeight: 1.4,
    }}>
      {value}
    </span>
  )
}

export default function AdminScreen({ profile }) {
  const navigate = useNavigate()
  const [studentCount, setStudentCount] = useState(null)
  const [pendingApps, setPendingApps]   = useState(0)
  const [reviewCount, setReviewCount]   = useState(0)
  const [isMobile, setIsMobile]         = useState(typeof window !== 'undefined' && window.innerWidth < 860)

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 860)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

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

  const groups = buildGroups({ studentCount, pendingApps, reviewCount })
  const flatItems = groups.flatMap(g => g.items)

  const linkInner = (item) => (
    <>
      {!isMobile && (
        <span style={{ display: 'flex', color: 'inherit', opacity: 0.85 }}>
          <NavIcon name={item.icon} />
        </span>
      )}
      <span style={{ flex: isMobile ? '0 0 auto' : 1 }}>{item.label}</span>
      {item.badge != null && <CountBadge value={item.badge} />}
      <AttentionBadge value={item.attention} />
    </>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#080d28', fontFamily: FONT_B, color: '#fff' }}>
      {/* Header */}
      <div style={{
        padding: '14px 24px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        display: 'flex', alignItems: 'center', gap: 16,
      }}>
        <button
          onClick={() => navigate('/question-bank')}
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 13, fontFamily: FONT_B }}
        >
          ← Back to app
        </button>
        <span style={{ fontFamily: FONT_D, fontSize: 17, letterSpacing: 1 }}>
          <span style={{ color: '#fff' }}>grade</span><span style={{ color: GOLD }}>farm.</span>
        </span>
        <span style={{
          fontSize: 10, fontWeight: 800, letterSpacing: 1.5, textTransform: 'uppercase',
          color: GOLD, background: `${GOLD}1a`, border: `1px solid ${GOLD}40`,
          borderRadius: 6, padding: '3px 8px',
        }}>
          Admin
        </span>
      </div>

      {/* Mobile: horizontal scroll tab bar */}
      {isMobile && (
        <div style={{
          display: 'flex', gap: 6, padding: '10px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.08)', overflowX: 'auto',
        }}>
          {flatItems.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 12px', borderRadius: 999, whiteSpace: 'nowrap', flexShrink: 0,
                fontSize: 12.5, fontWeight: 700, textDecoration: 'none', fontFamily: FONT_B,
                color: isActive ? '#0c1037' : 'rgba(255,255,255,0.55)',
                background: isActive ? GOLD : 'rgba(255,255,255,0.04)',
                border: `1px solid ${isActive ? GOLD : 'rgba(255,255,255,0.08)'}`,
              })}
            >
              {item.label}
              {item.badge != null && <CountBadge value={item.badge} />}
              <AttentionBadge value={item.attention} />
            </NavLink>
          ))}
        </div>
      )}

      {/* Body: sidebar (desktop) + content */}
      <div style={{ display: 'flex', alignItems: 'flex-start' }}>
        {!isMobile && (
          <nav style={{
            width: 232, flexShrink: 0, alignSelf: 'stretch',
            borderRight: '1px solid rgba(255,255,255,0.08)',
            padding: '18px 12px', position: 'sticky', top: 0,
            display: 'flex', flexDirection: 'column', gap: 4,
          }}>
            {groups.map((group, gi) => (
              <div key={gi} style={{ marginBottom: group.heading ? 10 : 4 }}>
                {group.heading && (
                  <div style={{
                    fontSize: 9.5, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase',
                    color: 'rgba(255,255,255,0.3)', padding: '8px 10px 6px',
                  }}>
                    {group.heading}
                  </div>
                )}
                {group.items.map(item => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    style={({ isActive }) => ({
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '9px 10px', borderRadius: 9, marginBottom: 2,
                      fontSize: 13, fontWeight: isActive ? 700 : 500, textDecoration: 'none', fontFamily: FONT_B,
                      color: isActive ? GOLD : 'rgba(255,255,255,0.62)',
                      background: isActive ? 'rgba(241,190,67,0.1)' : 'transparent',
                      border: `1px solid ${isActive ? 'rgba(241,190,67,0.22)' : 'transparent'}`,
                      transition: 'background 0.15s, color 0.15s',
                    })}
                  >
                    {linkInner(item)}
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>
        )}

        {/* Sub-route content */}
        <div style={{ flex: 1, minWidth: 0, padding: 24, maxWidth: 1180, margin: '0 auto' }}>
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
  )
}
