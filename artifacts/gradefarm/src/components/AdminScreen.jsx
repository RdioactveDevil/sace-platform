import { useState, useEffect, useCallback } from 'react'
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ADMIN_NAV, ADMIN_LEGACY, reportPortalBadges } from '../lib/portalNav'
import './TutorDashboard.css'
import AdminOverviewTab          from './AdminOverviewTab'
import AdminPeopleTab            from './AdminPeopleTab'
import AdminQuestionsScreen      from './AdminQuestionsScreen'
import AdminReportsScreen        from './AdminReportsScreen'
import AdminAssignmentsTab       from './AdminAssignmentsTab'
import AdminCurriculaTab         from './AdminCurriculaTab'
import AdminCurriculumDetail     from './AdminCurriculumDetail'
import AdminCohortTab            from './AdminCohortTab'
import AdminSettingsTab          from './AdminSettingsTab'
import { adminListTutorApplications } from '../lib/db'
import { getDraftQuestions, fetchQuestionReports, isOpenReport } from '../lib/adminDb'

const FONT_B = "'Plus Jakarta Sans', sans-serif"

function SubjectsRouter() {
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
// /admin/<section>; some have tabs (?tab=). This screen shows the section's
// title, its tabs and its content.
const NAV_ITEMS = ADMIN_NAV.flatMap(g => g.items)

const TABS = {
  questions: [['bank', 'Bank'], ['add', 'Add questions'], ['review', 'Review queue'], ['preview', 'Preview']],
  insights:  [['topics', 'Topics'], ['assignments', 'Assignments']],
}

export default function AdminScreen({ profile, theme = 'dark' }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [pendingApps, setPendingApps] = useState(0)
  const [reviewCount, setReviewCount] = useState(0)
  const [openReports, setOpenReports] = useState(0)

  const loadBadges = useCallback(async () => {
    adminListTutorApplications().then(apps => setPendingApps(apps.length)).catch(() => {})
    Promise.all([
      getDraftQuestions({ status: 'pending' }).catch(() => []),
      getDraftQuestions({ status: 'needs_review' }).catch(() => []),
    ]).then(([pending, needs]) => setReviewCount(pending.length + needs.length))
    fetchQuestionReports('all').then(rs => setOpenReports(rs.filter(isOpenReport).length)).catch(() => {})
  }, [])

  useEffect(() => {
    loadBadges()
    const id = setInterval(loadBadges, 60_000)
    const onFocus = () => loadBadges()
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(id); window.removeEventListener('focus', onFocus) }
  }, [loadBadges])

  const section = location.pathname.replace(/^\/admin\/?/, '').split('/')[0] || 'overview'
  const params = new URLSearchParams(location.search)

  // Old section URLs (/admin/students, /admin/generate, …) open where that page lives now.
  useEffect(() => {
    if (ADMIN_LEGACY[section]) navigate(`/admin/${ADMIN_LEGACY[section]}`, { replace: true })
  }, [section]) // eslint-disable-line react-hooks/exhaustive-deps

  const meta = NAV_ITEMS.find(i => i.id === section) || NAV_ITEMS[0]
  const tabs = TABS[section]
  const tab = tabs ? (tabs.some(([id]) => id === params.get('tab')) ? params.get('tab') : tabs[0][0]) : null
  const setTab = (id) => navigate(`/admin/${section}${id === tabs[0][0] ? '' : `?tab=${id}`}`)

  // Waiting on an admin: shown as badges in the app sidebar.
  useEffect(() => {
    reportPortalBadges('admin', { people: pendingApps, questions: reviewCount, reports: openReports })
  }, [pendingApps, reviewCount, openReports])

  const context = {
    overview: new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' }),
    questions: reviewCount ? `${reviewCount} waiting for review` : meta.sub,
    reports: openReports ? `${openReports} open` : 'Nothing open',
  }[section] ?? meta.sub

  return (
    <div className="td-root" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--t-bg)', fontFamily: FONT_B, color: 'var(--t-text)', colorScheme: theme === 'dark' ? 'dark' : 'light' }}>
      <header className="td-header" style={{ padding: tabs ? '18px 28px 0' : '18px 28px', borderBottom: '1px solid var(--t-border)', flexShrink: 0 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--t-text)', lineHeight: 1.2 }}>{meta.label}</h1>
        <div style={{ fontSize: 12.5, color: 'var(--t-textMuted)', marginTop: 2 }}>{context}</div>
        {tabs && (
          <div role="tablist" aria-label={`${meta.label} views`} className="gf-tabs" style={{ display: 'flex', gap: 4, marginTop: 12, overflowX: 'auto' }}>
            {tabs.map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
                style={{ padding: '8px 12px', border: 'none', borderBottom: `2px solid ${tab === id ? 'var(--t-text)' : 'transparent'}`, background: 'none', fontFamily: FONT_B, fontSize: 13, fontWeight: tab === id ? 700 : 500, color: tab === id ? 'var(--t-text)' : 'var(--t-textMuted)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                {label}
                {id === 'review' && reviewCount > 0 && <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--t-textMuted)' }}>{reviewCount}</span>}
              </button>
            ))}
          </div>
        )}
      </header>

      {/* Section content */}
      <div className="td-content" style={{ flex: 1, overflowY: 'auto', padding: '24px 28px 56px' }}>
        <div key={`${section}-${tab || ''}`} className="td-content-enter" style={{ maxWidth: 1320, width: '100%', margin: '0 auto' }}>
          <Routes>
            <Route index element={<Navigate to="overview" replace />} />
            <Route path="overview"  element={<AdminOverviewTab />} />
            <Route path="people"    element={<AdminPeopleTab profile={profile} pendingApps={pendingApps} onApplicationsChange={loadBadges} />} />
            <Route path="subjects"  element={<SubjectsRouter />} />
            <Route path="questions" element={<AdminQuestionsScreen profile={profile} tab={tab} onReviewChange={loadBadges} />} />
            <Route path="reports"   element={<AdminReportsScreen onChange={loadBadges} />} />
            <Route path="insights"  element={tab === 'assignments' ? <AdminAssignmentsTab /> : <AdminCohortTab />} />
            <Route path="settings"  element={<AdminSettingsTab />} />
            <Route path="*"         element={null} />
          </Routes>
        </div>
      </div>
    </div>
  )
}
