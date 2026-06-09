// Exam simulator engine — pure helpers for running a timed, sectioned paper.
//
// A "paper" is: { title, sections: [{ id, name, durationSec, instructions,
// questions: [...] }] }. Grading reuses the multi-format question engine, so a
// section can mix MCQ, numeric, ordering, hotspot, etc.

import { gradeResponse } from './questionTypes.js'

/** Format seconds as M:SS, or H:MM:SS past an hour. */
export function formatClock(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`
}

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * Build a runnable paper from a track definition and a pool of bank questions.
 * Each section spec may carry `questions` directly (demo papers) or a `pick`
 * descriptor { count, filter? } that samples from the pool.
 */
export function buildPaper(track, pool = []) {
  const sections = (track.sections || []).map((sec) => {
    let questions = sec.questions
    if (!questions) {
      const matching = sec.pick?.filter ? pool.filter(sec.pick.filter) : pool
      questions = shuffle(matching).slice(0, sec.pick?.count ?? 10)
    }
    return {
      id: sec.id,
      name: sec.name,
      durationSec: sec.durationSec,
      instructions: sec.instructions || '',
      questions,
    }
  })
  return { title: track.title, sections }
}

/** Total question count across all sections. */
export function countQuestions(paper) {
  return (paper.sections || []).reduce((n, s) => n + (s.questions?.length || 0), 0)
}

/**
 * Grade a finished paper. `answers` maps question id → the student's response.
 * Unanswered questions count as incorrect. Returns an overall + per-section
 * breakdown plus the time spent (if `timeSpent` map of sectionId→sec given).
 */
export function gradePaper(paper, answers = {}, timeSpent = {}) {
  let totalCorrect = 0
  let totalQuestions = 0

  const perSection = (paper.sections || []).map((sec) => {
    let correct = 0
    const total = sec.questions?.length || 0
    for (const q of sec.questions || []) {
      const resp = answers[q.id]
      const answered = resp !== undefined && resp !== null && !(Array.isArray(resp) && resp.length === 0)
      if (answered && gradeResponse(q, resp)) correct++
    }
    totalCorrect += correct
    totalQuestions += total
    return {
      id: sec.id,
      name: sec.name,
      correct,
      total,
      percent: total > 0 ? Math.round((correct / total) * 100) : 0,
      timeSec: timeSpent[sec.id] ?? null,
    }
  })

  return {
    totalCorrect,
    totalQuestions,
    percent: totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0,
    perSection,
  }
}
