import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  adminListStudents,
  adminListTutors,
  adminListTutorApplications,
  adminAnswersBetween,
} from '../lib/db'
import { getDraftQuestions, fetchQuestionReports, fetchQuestionFlags, isOpenReport } from '../lib/adminDb'
import { listCurricula } from '../lib/curriculaDb'
import { supabase } from '../lib/supabase'

const FONT_B = "'Plus Jakarta Sans', sans-serif"
const DAY_MS = 86_400_000

/** Monday 00:00, this week or weeks back. */
function weekStart(offsetWeeks = 0) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - offsetWeeks * 7)
  return d
}
const shortDate = (iso) => new Date(iso).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
const daysAgo = (iso) => Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / DAY_MS))
const pct = (right, n) => (n ? Math.round((right / n) * 100) : null)

/**
 * Admin › Overview: this week in four true numbers, everything waiting on an
 * admin (each with the button that settles it), the most used subjects this
 * week, and how the AI handled students' question reports.
 */
export default function AdminOverviewTab() {
  const navigate = useNavigate()
  const [d, setD] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    const safe = (p, fallback) => p.catch(() => fallback)
    const thisWeek = weekStart(0).toISOString()
    const lastWeek = weekStart(1).toISOString()
    Promise.all([
      safe(adminListStudents().then(j => j.students || []), []),
      safe(adminListTutors(), []),
      safe(adminListTutorApplications(), []),
      safe(Promise.all([getDraftQuestions({ status: 'pending' }), getDraftQuestions({ status: 'needs_review' })]).then(([a, b]) => a.length + b.length), 0),
      safe(fetchQuestionReports('all'), []),
      safe(listCurricula(), []),
      safe(supabase.from('questions').select('id', { count: 'exact', head: true }).then(r => r.count ?? null), null),
      safe(adminAnswersBetween(thisWeek, null, { withSubject: true }), null),
      safe(adminAnswersBetween(lastWeek, thisWeek), null),
      safe(fetchQuestionFlags(), []),
    ]).then(([people, tutors, apps, drafts, reports, curricula, questionCount, week, prevWeek, flags]) => {
      if (cancelled) return
      setD({ people, tutors, apps, drafts, reports, curricula, questionCount, week, prevWeek, flags })
    }).catch(e => { if (!cancelled) setError(e.message || 'Could not load the overview.') })
    return () => { cancelled = true }
  }, [])

  const view = useMemo(() => {
    if (!d) return null
    const activeWeek = d.people.filter(p => p.last_active && Date.now() - Date.parse(p.last_active) <= 7 * DAY_MS).length
    const right = (d.week || []).filter(a => a.correct).length

    // Most used subjects this week: answers and how many students.
    const bySubject = {}
    for (const a of d.week || []) {
      if (!a.subject) continue
      const e = (bySubject[a.subject] = bySubject[a.subject] || { subject: a.subject, answers: 0, right: 0, students: new Set() })
      e.answers++; if (a.correct) e.right++; e.students.add(a.user_id)
    }
    const subjects = Object.values(bySubject).sort((a, b) => b.answers - a.answers).slice(0, 4)

    // Waiting on an admin.
    const needs = []
    const open = d.reports.filter(isOpenReport).sort((a, b) => Date.parse(a.reported_at) - Date.parse(b.reported_at))
    open.slice(0, 3).forEach(r => needs.push({
      key: `r-${r.id}`, kind: 'Report', title: r.questions?.subject || 'Question', what: r.questions?.subtopic || r.questions?.topic || '',
      detail: r.ai_status === 'error' ? 'AI check failed. Needs a person.' : `AI still checking after ${daysAgo(r.reported_at)} day${daysAgo(r.reported_at) === 1 ? '' : 's'}`,
      action: 'Open', to: '/admin/reports',
    }))
    if (open.length > 3) needs.push({ key: 'r-more', kind: 'Report', title: `${open.length - 3} more reports`, what: '', detail: 'Waiting on the AI or a person', action: 'View', to: '/admin/reports' })
    // Questions students say have a typo or are confusing: usually worth editing.
    const needsEdit = d.flags.filter(f => f.questions && (f.counts.Typo || f.counts.Confusing))
    if (needsEdit.length) needs.push({
      key: 'flags', kind: 'Flags', title: `${needsEdit.length} question${needsEdit.length === 1 ? '' : 's'}`, what: 'flagged as a typo or confusing',
      detail: needsEdit.slice(0, 2).map(f => f.questions.subtopic || f.questions.topic).filter(Boolean).join(', '),
      action: 'Review', to: '/admin/reports?view=flags',
    })
    d.apps.forEach(a => needs.push({
      key: `a-${a.id}`, kind: 'Application', title: a.display_name || a.email || 'Someone', what: 'wants to tutor',
      detail: a.applied_at ? `Applied ${shortDate(a.applied_at)}` : '', action: 'Review', to: '/admin/people?role=applications',
    }))
    if (d.drafts > 0) needs.push({ key: 'drafts', kind: 'Review', title: `${d.drafts} new question${d.drafts === 1 ? '' : 's'}`, what: 'waiting for review', detail: 'Students won’t see them until approved', action: 'Review', to: '/admin/questions?tab=review' })
    const overdueTutors = d.tutors.filter(t => t.assignments_overdue > 0)
    const overdue = overdueTutors.reduce((s, t) => s + t.assignments_overdue, 0)
    if (overdue > 0) needs.push({
      key: 'overdue', kind: 'Overdue', title: `${overdue} assignment${overdue === 1 ? '' : 's'}`, what: `across ${overdueTutors.length} tutor${overdueTutors.length === 1 ? '' : 's'}`,
      detail: overdueTutors.map(t => t.display_name || 'Unnamed').join(', '), action: 'View', to: '/admin/insights?tab=assignments',
    })
    const notSetUp = d.people.filter(p => !p.onboarding_completed && !p.is_tutor && !p.is_admin && !p.deactivated_at)
    if (notSetUp.length) needs.push({
      key: 'setup', kind: 'Set-up', title: `${notSetUp.length} student${notSetUp.length === 1 ? '' : 's'}`, what: 'haven’t finished setting up',
      detail: notSetUp.slice(0, 3).map(p => p.display_name || p.email).join(', ') + (notSetUp.length > 3 ? ` and ${notSetUp.length - 3} more` : ''),
      action: 'View', to: '/admin/people?role=students',
    })

    // How reports were settled.
    const outcome = (s) => d.reports.filter(r => r.ai_status === s).length
    return {
      activeWeek,
      answers: d.week?.length ?? null,
      prevAnswers: d.prevWeek?.length ?? null,
      accuracy: pct(right, d.week?.length || 0),
      live: d.curricula.filter(c => c.status === 'live' && !c.archived_at).length,
      subjects, needs,
      handled: [
        ['Question was right', outcome('dismissed')],
        ['Answer key fixed', outcome('fixed_index')],
        ['Question replaced or removed', outcome('regenerated') + outcome('deleted')],
        ['Waiting or failed', open.length],
      ],
    }
  }, [d])

  if (error) return <div style={{ fontFamily: FONT_B, fontSize: 13, color: 'var(--t-danger)' }}>{error}</div>
  if (!view) return <div style={{ fontFamily: FONT_B, fontSize: 13, color: 'var(--t-textMuted)', padding: '24px 0' }}>Loading…</div>

  const card = { background: 'var(--t-bgCard)', border: '1px solid var(--t-border)', borderRadius: 12, padding: '12px 16px' }
  const cardHead = (title, link, to) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
      <span style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--t-text)' }}>{title}</span>
      {link && <button type="button" onClick={() => navigate(to)} style={{ border: 'none', background: 'none', padding: 0, fontFamily: FONT_B, fontSize: 12.5, fontWeight: 700, color: 'var(--t-text)', cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'var(--t-accent)', textDecorationThickness: 2, textUnderlineOffset: 3 }}>{link}</button>}
    </div>
  )
  const row = (first) => ({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderTop: first ? 'none' : '1px solid var(--t-border)' })
  const fact = (value, text) => (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--t-text)', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: 12.5, color: 'var(--t-textMuted)' }}>{text}</div>
    </div>
  )
  const delta = view.answers != null && view.prevAnswers != null ? `answers this week, ${view.answers >= view.prevAnswers ? 'up' : 'down'} from ${view.prevAnswers.toLocaleString()}` : 'answers this week'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, fontFamily: FONT_B, color: 'var(--t-text)' }}>
      <style>{`
        .ao-cols { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr); gap: 16px; align-items: start; }
        @media (max-width: 1000px) { .ao-cols { grid-template-columns: 1fr; } }
      `}</style>

      <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
        {fact(`${view.activeWeek} of ${d.people.length}`, 'accounts active in the last 7 days')}
        {fact(view.answers == null ? '—' : view.answers.toLocaleString(), delta)}
        {fact(view.accuracy == null ? '—' : `${view.accuracy}%`, 'correct this week')}
        {fact(view.live, `live subjects${d.questionCount != null ? ` · ${d.questionCount.toLocaleString()} questions` : ''}`)}
      </div>

      <div className="ao-cols">
        <div style={card}>
          {cardHead('Needs you')}
          {view.needs.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--t-textMuted)', padding: '10px 0 4px' }}>Nothing waiting on you. Reports the AI can’t settle, tutor applications, questions to review and overdue work show up here.</div>
          ) : view.needs.map((n, i) => (
            <div key={n.key} style={row(i === 0)}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-textSub)', padding: '1px 8px', border: '1px solid var(--t-border)', borderRadius: 999, marginRight: 8, whiteSpace: 'nowrap' }}>{n.kind}</span>
                  <b>{n.title}</b>{n.what ? <span style={{ color: 'var(--t-textSub)' }}> · {n.what}</span> : null}
                </div>
                {n.detail && <div style={{ fontSize: 12, color: 'var(--t-textMuted)', marginTop: 2 }}>{n.detail}</div>}
              </div>
              <button type="button" onClick={() => navigate(n.to)} style={{ padding: '7px 13px', borderRadius: 8, fontFamily: FONT_B, fontSize: 12.5, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, border: '1px solid var(--t-border)', background: 'var(--t-bgCard)', color: 'var(--t-text)' }}>{n.action}</button>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={card}>
            {cardHead('Most used subjects this week', 'Insights', '/admin/insights')}
            {view.subjects.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--t-textMuted)', padding: '10px 0 4px' }}>No answers yet this week.</div>
            ) : view.subjects.map((s, i) => (
              <div key={s.subject} style={row(i === 0)}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5 }}>{s.subject}</div>
                  <div style={{ fontSize: 12, color: 'var(--t-textMuted)' }}>{s.students.size} student{s.students.size === 1 ? '' : 's'} · {pct(s.right, s.answers)}% correct</div>
                </div>
                <div style={{ fontSize: 13, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}><b>{s.answers.toLocaleString()}</b> <span style={{ color: 'var(--t-textMuted)' }}>answers</span></div>
              </div>
            ))}
          </div>

          <div style={card}>
            {cardHead('Question reports', 'Reports', '/admin/reports')}
            {d.reports.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--t-textMuted)', padding: '10px 0 4px' }}>No student has reported a question yet.</div>
            ) : view.handled.map(([label, n], i) => (
              <div key={label} style={row(i === 0)}>
                <span style={{ fontSize: 13.5 }}>{label}</span>
                <b style={{ fontSize: 13.5, fontVariantNumeric: 'tabular-nums', color: i === 3 && n > 0 ? 'var(--t-danger)' : 'var(--t-text)' }}>{n}</b>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
