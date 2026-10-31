import { useState, useEffect, useCallback } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { ADMIN_NAV, reportPortalBadges } from '../lib/portalNav'
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

// The sections are in the app sidebar (lib/portalNav ADMIN_NAV) and live at
// /admin/<section>; this screen shows the section's title and content.
const NAV_ITEMS = ADMIN_NAV.flatMap(g => g.items)

// Portal colours: the theme's own tokens, the same ones TutorScreen uses.
const C = {
  bg:        'var(--t-bg)',
  sidebarBdr:'var(--t-border)',
  headerBg:  'var(--t-bg)',
  groupLbl:  'var(--t-textFaint)',
  item:      'var(--t-textMuted)',
  text:      'var(--t-text)',
  textMuted: 'var(--t-textMuted)',
}

export default function AdminScreen({ profile, theme = 'dark' }) {
  const location = useLocation()
  const [studentCount, setStudentCount] = useState(null)
  const [pendingApps, setPendingApps]   = useState(0)
  const [reviewCount, setReviewCount]   = useState(0)

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
  const meta = NAV_ITEMS.find(i => i.id === section) || NAV_ITEMS[0]

  // Waiting on an admin: shown as badges in the app sidebar.
  useEffect(() => { reportPortalBadges('admin', { applications: pendingApps, review: reviewCount }) }, [pendingApps, reviewCount])

  return (
    <div className="td-root" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: C.bg, fontFamily: FONT_B, color: C.text, colorScheme: theme === 'dark' ? 'dark' : 'light' }}>
      <header className="td-header" style={{ padding: '18px 28px', borderBottom: `1px solid ${C.sidebarBdr}`, flexShrink: 0 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', color: C.text, lineHeight: 1.2 }}>{meta.label}</h1>
        <div style={{ fontSize: 12.5, color: C.textMuted, marginTop: 2 }}>
          {section === 'students' && studentCount != null ? `${studentCount} students` : meta.sub}
        </div>
      </header>

      {/* Section content */}
      <div className="td-content" style={{ flex: 1, overflowY: 'auto', padding: '24px 28px 56px' }}>
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
  )
}
