// The Tutor Portal and Admin sections. The app sidebar shows these when you're
// in that workspace (the portals have no sidebar of their own), and each
// portal uses the same list for its page titles. A section lives at
// /tutor/<id> or /admin/<id>.
import {
  LayoutDashboard, Users, School, ClipboardList, Video, MessageSquare, Folder, FlaskConical,
  BookOpen, ListChecks, Flag, ChartColumn, Settings, FileStack,
} from 'lucide-react'

export const TUTOR_NAV = [
  { items: [
    { id: 'overview',    label: 'Today',       icon: LayoutDashboard },
    { id: 'students',    label: 'Students',    icon: Users },
    { id: 'classes',     label: 'Classes',     icon: School },
    { id: 'assignments', label: 'Assignments', icon: ClipboardList },
    { id: 'sessions',    label: 'Lessons',     icon: Video },
    { id: 'messages',    label: 'Messages',    icon: MessageSquare },
  ]},
  { label: 'Teaching tools', items: [
    { id: 'resources',   label: 'Resources',   icon: Folder },
    { id: 'diagnostic',  label: 'Diagnostics', icon: FlaskConical },
  ]},
]

export const ADMIN_NAV = [
  { items: [
    { id: 'overview',  label: 'Overview',  icon: LayoutDashboard, sub: 'What needs you, and how the platform did this week.' },
    { id: 'people',    label: 'People',    icon: Users,           sub: 'Every account: students, tutors and admins.' },
  ]},
  // A subject's questions, exam papers, review queue and reports are inside
  // the subject (Subjects → a subject). "All questions" is for finding a
  // question across every subject.
  { label: 'Content', items: [
    { id: 'subjects',  label: 'Subjects',  icon: BookOpen,        sub: 'Everything about each subject: topics, questions, exam papers, the review queue and reports.' },
    { id: 'questions', label: 'All questions', icon: ListChecks,  sub: 'Find a question in any subject, add questions and the review queue across subjects.' },
  ]},
  { label: 'Platform', items: [
    { id: 'insights',  label: 'Insights',  icon: ChartColumn,     sub: 'How students do by topic, and the work tutors set.' },
    { id: 'settings',  label: 'Settings',  icon: Settings,        sub: 'Student access and pricing.' },
  ]},
]

// Cross-subject pages the admin Overview links to, no longer in the sidebar
// (each subject has its own). Their titles for the page header.
export const ADMIN_UNLISTED = [
  { id: 'exam-papers', label: 'Exam papers', icon: FileStack, sub: 'Past and trial exam papers across every subject. Each subject has its own under Sources.' },
  { id: 'reports',   label: 'Reports',   icon: Flag,            sub: 'Reported questions across every subject. Each subject has its own under Quality.' },
]

// Old admin section URLs, and where each one lives now.
export const ADMIN_LEGACY = {
  students: 'people?role=students',
  tutors: 'people?role=tutors',
  users: 'people',
  applications: 'people?role=applications',
  curricula: 'subjects',
  generate: 'questions?tab=add&method=generate',
  vision: 'questions?tab=add&method=photo',
  upload: 'questions?tab=add&method=pdf',
  review: 'questions?tab=review',
  preview: 'questions?tab=preview',
  cohort: 'insights',
  assignments: 'insights?tab=assignments',
}

/** Which workspace a path belongs to. */
export function workspaceForPath(pathname) {
  if (pathname.startsWith('/tutor')) return 'tutor'
  if (pathname.startsWith('/admin')) return 'admin'
  return 'study'
}

/** The section id in /tutor/<id> or /admin/<id> ('overview' when there's none). */
export function sectionForPortalPath(pathname) {
  return pathname.split('/')[2] || 'overview'
}

// Badges the portals report for their sections (unread, overdue, waiting on
// review), so the app sidebar can show them: { tutor: { assignments: 2 }, admin: { … } }.
export const PORTAL_BADGES_EVENT = 'gf-portal-badges'
export function reportPortalBadges(workspace, badges) {
  window.dispatchEvent(new CustomEvent(PORTAL_BADGES_EVENT, { detail: { workspace, badges } }))
}
