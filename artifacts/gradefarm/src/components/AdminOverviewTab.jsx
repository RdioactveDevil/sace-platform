import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  adminListStudents,
  adminListTutors,
  adminListTutorApplications,
} from '../lib/db'
import { getDraftQuestions } from '../lib/adminDb'
import { listCurricula } from '../lib/curriculaDb'

const FONT_B = "'Plus Jakarta Sans', sans-serif"
const GOLD   = '#f1be43'

const DAY_MS = 86_400_000

function isWithin(iso, ms) {
  if (!iso) return false
  return Date.now() - new Date(iso).getTime() <= ms
}

export default function AdminOverviewTab() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [data, setData]       = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    // Each source is awaited independently so one failure doesn't blank the whole dashboard.
    const safe = (p, fallback) => p.then(v => v).catch(() => fallback)
    try {
      const [studentsRes, tutors, apps, pendingDrafts, needsReviewDrafts, curricula] = await Promise.all([
        safe(adminListStudents(), { students: [] }),
        safe(adminListTutors(), []),
        safe(adminListTutorApplications(), []),
        safe(getDraftQuestions({ status: 'pending' }), []),
        safe(getDraftQuestions({ status: 'needs_review' }), []),
        safe(listCurricula(), []),
      ])

      const students = studentsRes.students || []
      const activeToday   = students.filter(s => isWithin(s.last_active, DAY_MS)).length
      const activeWeek    = students.filter(s => isWithin(s.last_active, 7 * DAY_MS)).length
      const onboardingTodo = students.filter(s => !s.onboarding_completed).length

      const overdueAssignments = tutors.reduce((sum, t) => sum + (t.assignments_overdue || 0), 0)
      const pendingAssignments = tutors.reduce((sum, t) => sum + (t.assignments_pending || 0), 0)

      const liveCurricula = curricula.filter(c => c.status === 'live').length
      const generatingCurricula = curricula.filter(c => c.status === 'generating').length

      setData({
        studentCount: students.length,
        activeToday,
        activeWeek,
        onboardingTodo,
        tutorCount: tutors.length,
        pendingApps: apps.length,
        pendingDrafts: pendingDrafts.length,
        needsReviewDrafts: needsReviewDrafts.length,
        curriculaCount: curricula.length,
        liveCurricula,
        generatingCurricula,
        overdueAssignments,
        pendingAssignments,
      })
    } catch (e) {
      setError(e.message || 'Could not load overview.')
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) {
    return <div style={{ color: '#64748b', fontFamily: FONT_B, fontSize: 13, padding: '40px 0' }}>Loading overview…</div>
  }

  if (error || !data) {
    return (
      <div style={{ fontFamily: FONT_B }}>
        <div style={errorBox}>{error || 'No data available.'}</div>
        <button onClick={load} style={ghostBtn}>Retry</button>
      </div>
    )
  }

  const attention = []
  if (data.pendingApps > 0) {
    attention.push({
      key: 'apps',
      color: GOLD,
      label: `${data.pendingApps} tutor application${data.pendingApps !== 1 ? 's' : ''} awaiting review`,
      cta: 'Review applications',
      path: '/admin/applications',
    })
  }
  const reviewTotal = data.pendingDrafts + data.needsReviewDrafts
  if (reviewTotal > 0) {
    attention.push({
      key: 'drafts',
      color: '#38bdf8',
      label: `${reviewTotal} draft question${reviewTotal !== 1 ? 's' : ''} in the review queue`,
      cta: 'Open review queue',
      path: '/admin/review',
    })
  }
  if (data.overdueAssignments > 0) {
    attention.push({
      key: 'overdue',
      color: '#f87171',
      label: `${data.overdueAssignments} assignment${data.overdueAssignments !== 1 ? 's' : ''} overdue across all tutors`,
      cta: 'View assignments',
      path: '/admin/assignments',
    })
  }
  if (data.onboardingTodo > 0) {
    attention.push({
      key: 'onboarding',
      color: '#a78bfa',
      label: `${data.onboardingTodo} student${data.onboardingTodo !== 1 ? 's have' : ' has'} not finished onboarding`,
      cta: 'View students',
      path: '/admin/students',
    })
  }

  const kpis = [
    { label: 'Students',        value: data.studentCount.toLocaleString(), color: GOLD,      sub: `${data.activeWeek} active this week`, path: '/admin/students' },
    { label: 'Active today',    value: data.activeToday.toLocaleString(),  color: '#4ade80', sub: 'studied in last 24h',               path: '/admin/students' },
    { label: 'Tutors',          value: data.tutorCount.toLocaleString(),   color: '#38bdf8', sub: `${data.pendingAssignments} assignments pending`, path: '/admin/tutors' },
    { label: 'Live curricula',  value: data.liveCurricula.toLocaleString(),color: '#c084fc', sub: data.generatingCurricula > 0 ? `${data.generatingCurricula} generating` : `${data.curriculaCount} total`, path: '/admin/curricula' },
  ]

  const quickActions = [
    { label: 'Generate questions', desc: 'Create MCQs with AI',        path: '/admin/generate',  icon: 'sparkles' },
    { label: 'Upload PDF',         desc: 'Extract questions from a doc', path: '/admin/upload',    icon: 'upload'   },
    { label: 'New curriculum',     desc: 'Plan a subject with AI',       path: '/admin/curricula', icon: 'book'     },
    { label: 'Cohort analytics',   desc: 'Class-wide performance',       path: '/admin/cohort',    icon: 'chart'    },
  ]

  return (
    <div style={{ fontFamily: FONT_B, color: '#e2e8f0' }}>
      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: '#fff', marginBottom: 4 }}>Overview</div>
        <div style={{ fontSize: 13, color: '#64748b' }}>A snapshot of your platform and anything that needs your attention.</div>
      </div>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 26 }}>
        {kpis.map(k => (
          <button
            key={k.label}
            onClick={() => navigate(k.path)}
            style={{
              textAlign: 'left', cursor: 'pointer', fontFamily: FONT_B,
              padding: '18px 18px', borderRadius: 14,
              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
              transition: 'background 0.15s, border-color 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.borderColor = 'rgba(241,190,67,0.25)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}
          >
            <div style={{ fontSize: 28, fontWeight: 800, color: k.color, lineHeight: 1.1 }}>{k.value}</div>
            <div style={{ fontSize: 13, color: '#cbd5e1', fontWeight: 700, marginTop: 6 }}>{k.label}</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{k.sub}</div>
          </button>
        ))}
      </div>

      {/* Needs attention */}
      <div style={{ marginBottom: 26 }}>
        <SectionTitle>Needs attention</SectionTitle>
        {attention.length === 0 ? (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '16px 18px', borderRadius: 12,
            background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.2)',
            color: '#4ade80', fontSize: 13, fontWeight: 600,
          }}>
            <span style={{ fontSize: 16 }}>✓</span> You're all caught up — nothing needs review right now.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {attention.map(a => (
              <div key={a.key} style={{
                display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
                padding: '14px 16px', borderRadius: 12,
                background: `${a.color}10`, border: `1px solid ${a.color}33`,
              }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: a.color, flexShrink: 0, boxShadow: `0 0 8px ${a.color}` }} />
                <span style={{ flex: 1, minWidth: 160, fontSize: 13, color: '#f1f5f9', fontWeight: 600 }}>{a.label}</span>
                <button
                  onClick={() => navigate(a.path)}
                  style={{
                    padding: '7px 14px', borderRadius: 8, fontFamily: FONT_B,
                    border: `1px solid ${a.color}66`, background: `${a.color}1f`,
                    color: a.color, fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                  }}
                >
                  {a.cta} →
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div>
        <SectionTitle>Quick actions</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          {quickActions.map(q => (
            <button
              key={q.label}
              onClick={() => navigate(q.path)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', cursor: 'pointer', fontFamily: FONT_B,
                padding: '14px 16px', borderRadius: 12,
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                transition: 'background 0.15s, border-color 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(241,190,67,0.08)'; e.currentTarget.style.borderColor = 'rgba(241,190,67,0.3)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}
            >
              <span style={{
                width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                background: 'rgba(241,190,67,0.12)', border: '1px solid rgba(241,190,67,0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: GOLD,
              }}>
                <ActionIcon name={q.icon} />
              </span>
              <span style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>{q.label}</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>{q.desc}</div>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function SectionTitle({ children }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.8, color: '#64748b', textTransform: 'uppercase', marginBottom: 12 }}>
      {children}
    </div>
  )
}

function ActionIcon({ name }) {
  const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' }
  return (
    <svg width={18} height={18} viewBox="0 0 18 18" aria-hidden="true">
      {name === 'sparkles' && <><path d="M9 2.5 10.2 6.2 14 7.4l-3.8 1.2L9 12.3 7.8 8.6 4 7.4l3.8-1.2Z" {...S} /><path d="M13.5 11.5l.6 1.7 1.7.6-1.7.6-.6 1.7-.6-1.7-1.7-.6 1.7-.6Z" {...S} /></>}
      {name === 'upload'   && <><path d="M9 11.5V3.5" {...S} /><path d="M6 6l3-3 3 3" {...S} /><path d="M3.5 11.5v2a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-2" {...S} /></>}
      {name === 'book'     && <><path d="M3 4.25A1.25 1.25 0 0 1 4.25 3H9v11H4.25A1.25 1.25 0 0 1 3 12.75Z" {...S} /><path d="M9 3h4.75A1.25 1.25 0 0 1 15 4.25v8.5A1.25 1.25 0 0 1 13.75 14H9Z" {...S} /></>}
      {name === 'chart'    && <><rect x="2.5" y="10" width="3" height="5" rx="0.6" {...S} /><rect x="7.5" y="6" width="3" height="9" rx="0.6" {...S} /><rect x="12.5" y="3" width="3" height="12" rx="0.6" {...S} /></>}
    </svg>
  )
}

const errorBox = {
  padding: '10px 14px', background: 'rgba(239,68,68,0.08)',
  border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8,
  fontSize: 13, color: '#f87171', marginBottom: 12,
}
const ghostBtn = {
  padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)',
  background: 'transparent', color: '#e2e8f0', fontSize: 13, fontWeight: 700,
  cursor: 'pointer', fontFamily: FONT_B,
}
