// The Tutor Portal and Admin sections. The app sidebar shows these when you're
// in that workspace (the portals have no sidebar of their own), and each
// portal uses the same list for its page titles. A section lives at
// /tutor/<id> or /admin/<id>.
import {
  LayoutDashboard, Users, School, ClipboardList, Video, MessageSquare, Folder, FlaskConical,
  GraduationCap, UserCog, Inbox, UsersRound, BookOpen, Sparkles, ImageUp, Upload, ListChecks, Eye,
  ChartColumn, Settings,
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
    { id: 'overview',     label: 'Overview',           icon: LayoutDashboard, sub: 'Platform health and what needs attention.' },
  ]},
  { label: 'People', items: [
    { id: 'students',     label: 'Students',           icon: GraduationCap,   sub: 'Every student, their progress and subject access.' },
    { id: 'tutors',       label: 'Tutors',             icon: UserCog,         sub: 'Tutors, their rosters and the work they set.' },
    { id: 'applications', label: 'Tutor applications', icon: Inbox,           sub: 'Approve or decline people applying to tutor.' },
    { id: 'users',        label: 'All users',          icon: UsersRound,      sub: 'Every account, with roles and status.' },
  ]},
  { label: 'Content', items: [
    { id: 'curricula',    label: 'Curricula',          icon: BookOpen,        sub: 'Subjects, topics and what students can see.' },
    { id: 'generate',     label: 'Generate',           icon: Sparkles,        sub: 'Create questions with AI.' },
    { id: 'vision',       label: 'From image',         icon: ImageUp,         sub: 'Turn photos of questions into bank questions.' },
    { id: 'upload',       label: 'Upload PDF',         icon: Upload,          sub: 'Extract questions from a document.' },
    { id: 'review',       label: 'Review queue',       icon: ListChecks,      sub: 'Check drafted questions before they go live.' },
    { id: 'preview',      label: 'Preview question',   icon: Eye,             sub: 'See a question exactly as students will.' },
  ]},
  { label: 'Insights', items: [
    { id: 'cohort',       label: 'Cohort analytics',   icon: ChartColumn,     sub: 'How students are doing across the platform.' },
    { id: 'assignments',  label: 'Assignments',        icon: ClipboardList,   sub: 'Work set by every tutor, and how it’s going.' },
  ]},
  { label: 'Platform', items: [
    { id: 'settings',     label: 'Settings',           icon: Settings,        sub: 'Student access and pricing.' },
  ]},
]

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
