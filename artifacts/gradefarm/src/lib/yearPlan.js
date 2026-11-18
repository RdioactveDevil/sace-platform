// Set up your year: where a student's class is up to, their tests, and the
// week's plan built from them (components/YearSetupScreen.jsx, YearPlanCard.jsx;
// tables in migration 20261118000007_year_setup.sql). Pure functions: no I/O.
//
// The plan is worked out each time from what's saved, so it can't go stale:
//   keep    the subtopic their class is on now
//   test    the next test (within four weeks), its subtopics; more time as it nears
//   exam    or the external exam in its last two months, everything covered
//   review  otherwise a mix of the subtopics covered before this one
//   fix     the weakest covered subtopic (at least 3 answers, under 70%)
//   refresh otherwise the earliest covered subtopic, to keep it fresh

/** The subject's subtopics in course order: [{ id, name, topicId, topicName, topicNum }]. */
export function courseOrder(topics) {
  const byOrder = (a, b) => (Number(a.order_index) || 0) - (Number(b.order_index) || 0)
  const out = []
  ;[...(topics || [])].sort(byOrder).forEach((t, ti) => {
    ;[...(t.subtopics || [])].sort(byOrder).forEach(s => {
      out.push({ id: s.id, name: s.name, topicId: t.id, topicName: t.name, topicNum: ti + 1 })
    })
  })
  return out
}

/** id → 'done' | 'current' | 'upcoming' | 'skipped'. */
export function subtopicStatuses(flat, currentId, skippedIds = []) {
  const skipped = new Set(skippedIds || [])
  const at = flat.findIndex(s => s.id === currentId)
  return new Map(flat.map((s, i) => [s.id,
    at < 0 ? 'upcoming' : i === at ? 'current' : i > at ? 'upcoming' : skipped.has(s.id) ? 'skipped' : 'done']))
}

/** The subtopics their class has covered, the current one included, in order. */
export function coveredSubtopics(flat, currentId, skippedIds = []) {
  const st = subtopicStatuses(flat, currentId, skippedIds)
  return flat.filter(s => st.get(s.id) === 'done' || st.get(s.id) === 'current')
}

/** The subtopic after the current one (for "Moved on"), or null at the end. */
export function nextSubtopic(flat, currentId) {
  const at = flat.findIndex(s => s.id === currentId)
  return at >= 0 && at + 1 < flat.length ? flat[at + 1] : null
}

const dayOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const parseDay = (s) => {
  const [y, m, d] = String(s || '').split('-').map(Number)
  return y && m && d ? new Date(y, m - 1, d) : null
}

/** Whole days from today to a 'YYYY-MM-DD' date (negative once it's past). */
export function daysUntil(dateStr, today = new Date()) {
  const d = parseDay(dateStr)
  return d ? Math.round((d - dayOf(today)) / 86400000) : null
}

/** The soonest test today or later, or null. */
export function nextTest(tests, today = new Date()) {
  return (tests || [])
    .map(t => ({ ...t, days: daysUntil(t.test_date, today) }))
    .filter(t => t.days != null && t.days >= 0)
    .sort((a, b) => a.days - b.days)[0] || null
}

/** subtopic name → { attempts, wrong, accuracy } from the questions answered so far. */
export function accuracyBySubtopic(questions, struggleMap) {
  const out = new Map()
  for (const q of questions || []) {
    const s = struggleMap?.[q.id]
    if (!s?.attempts || !q.subtopic) continue
    const a = out.get(q.subtopic) || { attempts: 0, wrong: 0, accuracy: 0 }
    a.attempts += s.attempts
    a.wrong += s.wrong || 0
    a.accuracy = (a.attempts - a.wrong) / a.attempts
    out.set(q.subtopic, a)
  }
  return out
}

/** About how many questions fit in some minutes (with working, checking and reading). */
const questionsIn = (minutes) => Math.max(5, Math.round(minutes / 2.5))

/**
 * The week's plan: up to three rows, sharing the student's study hours.
 * → { rows: [{ kind, label, subtopics: [names], minutes, questions, days?, accuracy? }], next }
 */
export function weekPlan({ flat, currentId, skipped = [], tests = [], examDate = null, examName = 'Exam', accuracy = new Map(), hours = 3, today = new Date() }) {
  const covered = coveredSubtopics(flat, currentId, skipped)
  const current = flat.find(s => s.id === currentId)
  if (!current) return { rows: [], next: null }
  const earlier = covered.filter(s => s.id !== currentId)
  const nameOf = new Map(flat.map(s => [s.id, s.name]))
  const rows = []

  rows.push({ kind: 'keep', label: 'Keep up with class', subtopics: [current.name] })

  const next = nextTest(tests, today)
  const examDays = daysUntil(examDate, today)
  if (next && next.days <= 28) {
    const names = (next.subtopic_ids || []).map(id => nameOf.get(id)).filter(Boolean)
    rows.push({ kind: 'test', label: `${next.name} · ${next.days === 0 ? 'today' : next.days === 1 ? 'tomorrow' : `in ${next.days} days`}`,
      subtopics: names.length ? names : covered.map(s => s.name), days: next.days, testId: next.id })
  } else if (examDays != null && examDays >= 0 && examDays <= 60) {
    rows.push({ kind: 'exam', label: `${examName} · in ${examDays} days`, subtopics: covered.map(s => s.name), days: examDays })
  } else if (earlier.length) {
    rows.push({ kind: 'review', label: 'Mixed revision', subtopics: earlier.map(s => s.name) })
  }

  const weakest = covered
    .map(s => ({ s, a: accuracy.get(s.name) }))
    .filter(x => x.a && x.a.attempts >= 3 && x.a.accuracy < 0.7)
    .sort((x, y) => x.a.accuracy - y.a.accuracy)[0]
  if (weakest) rows.push({ kind: 'fix', label: 'Fix a weak spot', subtopics: [weakest.s.name], accuracy: weakest.a.accuracy })
  else if (earlier.length) rows.push({ kind: 'refresh', label: 'Keep earlier topics fresh', subtopics: [earlier[0].name] })

  // Time: a test or exam within two weeks takes half the week, within four, about 40%.
  const soon = rows[1] && (rows[1].kind === 'test' || rows[1].kind === 'exam') ? rows[1].days : null
  const shares = { keep: 0.45, test: 0.35, exam: 0.35, review: 0.35, fix: 0.2, refresh: 0.2 }
  if (soon != null && soon <= 14) Object.assign(shares, { keep: 0.3, test: 0.5, exam: 0.5 })
  else if (soon != null && soon <= 28) Object.assign(shares, { keep: 0.4, test: 0.4, exam: 0.4 })
  const total = Math.max(1, Number(hours) || 3) * 60
  const sum = rows.reduce((s, r) => s + shares[r.kind], 0)
  let left = total
  rows.forEach((r, i) => {
    r.minutes = i === rows.length - 1 ? left : Math.round((total * shares[r.kind]) / sum / 5) * 5
    left -= r.minutes
    r.questions = questionsIn(r.minutes)
  })
  return { rows, next }
}

/** Monday of this week (local time). */
export function weekStart(today = new Date()) {
  const d = dayOf(today)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d
}

/** "Still on …?" is due once a new week has started since they set up or last answered. */
export function checkInDue(setup, today = new Date()) {
  if (!setup) return false
  const last = new Date(setup.checked_in_at || setup.created_at)
  return !Number.isNaN(last.getTime()) && last < weekStart(today)
}
