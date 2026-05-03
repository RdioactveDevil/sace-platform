import { useState } from 'react'
import { Routes, Route, NavLink, Navigate, useNavigate } from 'react-router-dom'
import AdminUploadScreen         from './AdminUploadScreen'
import AdminGenerateScreen       from './AdminGenerateScreen'
import AdminReviewScreen         from './AdminReviewScreen'
import AdminUsersTab             from './AdminUsersTab'
import AdminStudentsTab          from './AdminStudentsTab'
import AdminTutorApplicationsTab from './AdminTutorApplicationsTab'

const FONT_B = "'Plus Jakarta Sans', sans-serif"
const GOLD   = '#f1be43'

export default function AdminScreen({ profile }) {
  const navigate = useNavigate()
  const [studentCount, setStudentCount] = useState(null)

  const tabs = [
    { label: 'Students',           badge: studentCount, path: '/admin/students' },
    { label: 'All Users',          path: '/admin/users' },
    { label: 'Tutor Applications', path: '/admin/applications' },
    { label: 'Upload PDF',         path: '/admin/upload' },
    { label: 'Generate',           path: '/admin/generate' },
    { label: 'Review Queue',       path: '/admin/review' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: '#080d28', fontFamily: FONT_B, color: '#fff' }}>
      {/* Header */}
      <div style={{
        padding: '14px 24px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
      }}>
        <button
          onClick={() => navigate('/question-bank')}
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 13, fontFamily: FONT_B }}
        >
          ← Back to app
        </button>
        <span style={{ color: GOLD, fontWeight: 800, fontSize: 16 }}>Content Admin</span>
      </div>

      {/* Tab nav */}
      <div style={{
        display: 'flex',
        gap: 4,
        padding: '12px 24px 0',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        overflowX: 'auto',
      }}>
        {tabs.map(tab => (
          <NavLink
            key={tab.path}
            to={tab.path}
            style={({ isActive }) => ({
              padding: '8px 14px',
              borderRadius: '8px 8px 0 0',
              fontSize: 13,
              fontWeight: 700,
              textDecoration: 'none',
              color: isActive ? GOLD : 'rgba(255,255,255,0.5)',
              background: isActive ? 'rgba(241,190,67,0.08)' : 'transparent',
              borderBottom: isActive ? `2px solid ${GOLD}` : '2px solid transparent',
              fontFamily: FONT_B,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              whiteSpace: 'nowrap',
              flexShrink: 0,
            })}
          >
            {tab.label}
            {tab.badge != null && (
              <span style={{
                fontSize: 10, fontWeight: 800,
                background: `${GOLD}22`, color: GOLD,
                border: `1px solid ${GOLD}44`,
                borderRadius: 5, padding: '1px 5px', lineHeight: 1.4,
              }}>
                {tab.badge}
              </span>
            )}
          </NavLink>
        ))}
      </div>

      {/* Sub-route content */}
      <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
        <Routes>
          <Route index element={<Navigate to="students" replace />} />
          <Route path="students"     element={<AdminStudentsTab profile={profile} onCountLoad={setStudentCount} />} />
          <Route path="users"        element={<AdminUsersTab profile={profile} />} />
          <Route path="applications" element={<AdminTutorApplicationsTab />} />
          <Route path="upload"       element={<AdminUploadScreen />} />
          <Route path="generate"     element={<AdminGenerateScreen />} />
          <Route path="review"       element={<AdminReviewScreen profile={profile} />} />
        </Routes>
      </div>
    </div>
  )
}
