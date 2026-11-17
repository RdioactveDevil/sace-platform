// Sitting an exam under timed conditions (Exams → Start this exam). The
// sitting is kept on the attempt (built_exam_attempts.sitting, migration
// 20261117000001_exam_sittings.sql) as timestamps, not a running count, so
// the clock is right after a refresh, a closed tab or on another device:
//
//   { reading_ms, writing_ms,      // the time allowed for each part
//     started_at,                  // ms since 1970 when reading (or writing) began
//     pauses: [{ from, to? }],     // a pause still going has no `to`
//     ended_at?, ended? }          // 'time' (ran out) or 'early' (End exam)
//
// Reading time comes first; writing time follows straight on. SACE exams have
// no reading time. Pausing is allowed and shown with the result.

import { groupSubject } from './homeSubjects.js'
import { writingMinutes } from './examBuilder.js'
import { tally } from './examMarking.js'

const MIN = 60_000

/** 'sace' for SACE subjects, else 'vce': which exam's rules (and paper look) apply. */
export const boardOf = (subject) => (groupSubject({ name: subject?.name, level: subject?.stage }).group === 'sace' ? 'sace' : 'vce')

/** Writing time: VCE 1.5 minutes a mark; SACE papers are 130 minutes for a full paper. */
export const examMinutes = (board, marks) => (board === 'sace' ? (marks >= 90 ? 130 : Math.max(15, Math.round((marks * 1.3) / 5) * 5)) : writingMinutes(marks))

/** The time allowed for an exam: VCE has 15 minutes' reading time, SACE none. */
export function examTimes(board, marks) {
  return { readingMinutes: board === 'sace' ? 0 : 15, writingMinutes: examMinutes(board, marks) }
}

/** The times for an attempt's exam, from its snapshot (as printed on its cover). */
export function timesForSnapshot(snapshot) {
  return examTimes(snapshot?.board === 'sace' ? 'sace' : 'vce', tally(snapshot, {}).available)
}

/** A new sitting starting now. */
export function startSitting({ readingMinutes, writingMinutes: writing }, now = Date.now()) {
  return { reading_ms: Math.max(0, readingMinutes) * MIN, writing_ms: Math.max(1, writing) * MIN, started_at: now, pauses: [] }
}

const pausedFor = (s, now) => (s.pauses || []).reduce((n, p) => n + Math.max(0, (p.to ?? now) - p.from), 0)
const openPause = (s) => (s.pauses || []).some(p => p.to == null)

/**
 * Where a sitting is at `now`:
 *   phase      'reading' | 'writing' | 'done'
 *   paused     a pause is going on
 *   left       ms left in this phase (0 when done)
 *   writingLeft ms of writing time left
 *   used       ms of exam time used (not counting pauses)
 *   pausedMs, pauseCount
 *   ended      'time' | 'early' | null
 */
export function sittingState(s, now = Date.now()) {
  if (!s || !s.started_at) return null
  const end = s.ended_at ?? now
  const used = Math.max(0, end - s.started_at - pausedFor(s, end))
  const reading = s.reading_ms || 0
  const total = reading + s.writing_ms
  const pauseCount = (s.pauses || []).length
  const pausedMs = pausedFor(s, end)
  if (s.ended_at || used >= total) {
    return { phase: 'done', paused: false, left: 0, writingLeft: Math.max(0, total - used), used: Math.min(used, total), pausedMs, pauseCount, ended: s.ended || 'time' }
  }
  const phase = used < reading ? 'reading' : 'writing'
  return {
    phase, paused: openPause(s), used, pausedMs, pauseCount, ended: null,
    left: phase === 'reading' ? reading - used : total - used,
    writingLeft: total - Math.max(used, reading),
  }
}

export function pauseSitting(s, now = Date.now()) {
  const st = sittingState(s, now)
  if (!st || st.phase === 'done' || st.paused) return s
  return { ...s, pauses: [...(s.pauses || []), { from: now }] }
}

export function resumeSitting(s, now = Date.now()) {
  if (!openPause(s)) return s
  return { ...s, pauses: s.pauses.map(p => (p.to == null ? { ...p, to: now } : p)) }
}

/** Finish reading time now; writing time starts in full. */
export function skipReading(s, now = Date.now()) {
  const st = sittingState(s, now)
  if (!st || st.phase !== 'reading') return s
  return { ...s, reading_ms: st.used }
}

/** End the sitting: early (End exam) or because time ran out. */
export function endSitting(s, now = Date.now(), why = 'early') {
  if (s.ended_at) return s
  const closed = resumeSitting(s, now)
  // Time that ran out while nobody was looking ends when it ran out, not now.
  const used = now - s.started_at - pausedFor(closed, now)
  const at = why === 'time' ? now - Math.max(0, used - ((s.reading_ms || 0) + s.writing_ms)) : now
  return { ...closed, ended_at: at, ended: why }
}

/** Has time run out on a sitting that hasn't been ended yet? */
export const timeIsUp = (s, now = Date.now()) => !!s && !s.ended_at && sittingState(s, now)?.phase === 'done'

/** "1:42:10", "42:10" or "0:09": a countdown, rounded up to the second. */
export function formatClock(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), sec = total % 60
  const pad = (n) => String(n).padStart(2, '0')
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`
}

/** "2 h 12 min", "47 min", "under a minute": a length of time in words. */
export function formatSpan(ms) {
  const min = Math.round(ms / MIN)
  if (min < 1) return 'under a minute'
  const h = Math.floor(min / 60), m = min % 60
  return h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`
}

/** Writing-time warnings, in minutes left. */
export const WARNINGS = [30, 10, 5]

/** The warning crossed between two readings of writing time left, or null. */
export function warningCrossed(beforeMs, afterMs) {
  return WARNINGS.find(w => beforeMs > w * MIN && afterMs <= w * MIN) ?? null
}

/**
 * A suggested pace when the paper has two sections: when to move on from
 * Section A, by its share of the marks. Null for a one-section paper.
 */
export function sectionAPace(snapshot, writingMs) {
  const qs = snapshot?.questions || []
  const aMarks = qs.filter(q => q.section === 'A').reduce((n, q) => n + (q.marks || 0), 0)
  const all = qs.reduce((n, q) => n + (q.marks || 0), 0)
  if (!aMarks || aMarks === all) return null
  return { aMarks, bMarks: all - aMarks, ms: Math.round((writingMs * aMarks) / all / MIN) * MIN }
}

/** One line for the result page: how the sitting went, or '' if it wasn't timed. */
export function sittingSummary(s) {
  const st = sittingState(s)
  if (!st || st.phase !== 'done') return ''
  const allowed = (s.reading_ms || 0) + s.writing_ms
  const pauses = st.pauseCount ? ` · paused ${st.pauseCount === 1 ? 'once' : `${st.pauseCount} times`} (${formatSpan(st.pausedMs)})` : ''
  return `Sat under timed conditions: ${formatSpan(st.used)} of ${formatSpan(allowed)}${st.ended === 'early' ? ', finished early' : ''}${pauses}`
}
