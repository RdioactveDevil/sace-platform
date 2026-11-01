// Page tips: each page explains itself the first time someone opens it.
// A tip points at an element marked data-tutorial-target="<target>". Steps
// whose element isn't on the page (a feature this subject doesn't have, an
// empty list, a sidebar link on a phone) are left out.
//
// Seen pages are kept on the profile (profiles.tours_seen, migration
// 20261101000000_tours_seen.sql) and in this browser, so a page's tips show
// once per person, not once per device.

import { updateProfile } from './db'

export const PAGE_TIPS = {
  practice: {
    path: (p) => p === '/question-bank',
    steps: [
      { target: 'subject-chip', sidebar: true, title: 'Your subject', body: 'Everything in the sidebar is for the subject shown here. Tap it to switch subject.' },
      { target: 'practice-session', title: 'Your session', body: 'New questions, ones you got wrong, or a mix of both. Then choose which topics to include.' },
      { target: 'practice-start', title: 'Start', body: "Start when you're ready. You can end a session at any time and see how you went." },
    ],
  },
  quiz: {
    path: (p) => p === '/quiz',
    steps: [
      { target: 'quiz-answer', title: 'Answering', body: 'Pick an answer, then Check answer. On a keyboard, 1 to 4 picks and Enter checks. You can change your mind before you check.' },
      { target: 'quiz-bar', title: 'Tools and finishing', body: 'Tools like the calculator sit up here when your subject has them. End session finishes early and shows how you went.' },
    ],
  },
  // Shown at the first wrong answer (QuizScreen sends a gf-page-tip event).
  'quiz-wrong': {
    steps: [
      { target: 'quiz-extra-practice', title: 'Extra practice', body: "Got one wrong? Practise a few like it straight away. Get them right in a row and you're back to your session." },
    ],
  },
  learn: {
    path: (p) => p === '/learn',
    steps: [
      { target: 'learn-composer', title: 'Ask Titan', body: 'Type a question, paste a problem, or add a photo of your working or your class notes. Titan explains it step by step.' },
      { target: 'learn-lessons', title: 'Guided lessons', body: 'About 10 minutes each: the key ideas, a worked example and check questions.' },
    ],
  },
  progress: {
    path: (p) => p === '/my-progress',
    steps: [
      { target: 'progress-week', title: 'This week', body: "How much you've practised and how well, compared with last week. Your rank grows with XP and accuracy; All ranks shows them all." },
      { target: 'progress-plan', title: "This week's plan", body: 'What to work on this week. It fills in as you practise.' },
      { target: 'tabs-progress', title: 'History and Leaderboard', body: 'Your past sessions and the class leaderboard are in the other tabs.' },
    ],
  },
  portal: {
    path: (p) => p === '/portal',
    steps: [
      { target: 'portal-next-lesson', title: 'Your next lesson', body: 'When your next lesson is. A Join button appears here 15 minutes before it starts.' },
      { target: 'portal-work', title: 'Work from your tutor', body: 'What your tutor has set you, with when it\'s due. Start or Continue goes straight into it.' },
      { target: 'tabs-portal', title: 'Everything else', body: 'Messages, Lessons (with recordings and files) and your tutor and class, along the top.' },
    ],
  },
  tutor: {
    path: (p) => p === '/tutor' || p === '/tutor/overview',
    steps: [
      { target: 'subject-chip', sidebar: true, title: 'Switching', body: 'Move between Studying and the Tutor Portal here.' },
      { target: 'tutor-needs', title: 'Needs you', body: 'Overdue work, finished assignments, messages and quiet students, in one list. Open one to deal with it.' },
      { target: 'nav-tutor-students', sidebar: true, title: 'Students', body: "Everyone you tutor and how they're going. Open one to see their work and set assignments." },
    ],
  },
}

/** The page whose tips belong to this path, if any. */
export function tipPageFor(pathname) {
  return Object.keys(PAGE_TIPS).find(id => PAGE_TIPS[id].path?.(pathname)) || null
}

const localKey = (uid) => `gf-tips-seen-${uid}`

/** Pages whose tips this person has seen: { page: when }. */
export function seenTips(profile) {
  let local = {}
  try { local = JSON.parse(localStorage.getItem(localKey(profile?.id)) || '{}') || {} } catch {}
  return { ...(profile?.tours_seen || {}), ...local }
}

/** Record a page's tips as seen, here and on the profile. Returns the new map. */
export async function markTipsSeen(profile, page) {
  const next = { ...seenTips(profile), [page]: new Date().toISOString() }
  try { localStorage.setItem(localKey(profile.id), JSON.stringify(next)) } catch {}
  try { await updateProfile(profile.id, { tours_seen: next }) } catch (e) {
    // Before the migration runs there's no column; this browser still remembers.
    console.warn('[page tips] not saved to profile:', e?.message || e)
  }
  return next
}

/** Show every page's tips again (Account › Show page tips again). */
export async function resetTips(profile) {
  try { localStorage.removeItem(localKey(profile.id)) } catch {}
  try { await updateProfile(profile.id, { tours_seen: {} }) } catch (e) {
    console.warn('[page tips] not reset on profile:', e?.message || e)
  }
}
