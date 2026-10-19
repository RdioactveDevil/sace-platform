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

export const DEFAULT_EXAM_QUESTIONS = 20
const DEFAULT_SECONDS_PER_QUESTION = 90

/**
 * A practice exam for one subject, drawn from that subject's question bank.
 * Questions are picked round-robin across topics so the paper covers the
 * course rather than whichever topic has the most questions. A reading
 * passage's questions are kept together, so the paper can run slightly over
 * the requested size to finish a passage. Size and time
 * come from the subject's feature settings (exam_questions / exam_minutes).
 *
 * @param {{ id?: string, name?: string, features?: object }} subject
 * Questions the student has already answered (`isSeen`) are only used when
 * there aren't enough new ones to fill the paper.
 *
 * @param {object[]} pool  the subject's bank questions
 * @param {(q: object) => boolean} [isSeen]  whether the student has answered q
 * @returns {{ id: string, title: string, sections: object[] }}
 */
export function buildSubjectExam(subject, pool = [], isSeen = () => false) {
  const features = subject?.features || {}
  const wanted = Math.max(1, Math.round(Number(features.exam_questions) || DEFAULT_EXAM_QUESTIONS))

  // A reading passage's questions travel together as one block; everything
  // else is a block of one.
  const blocks = []
  const passageBlocks = new Map()
  for (const q of pool) {
    if (q.passage_id) {
      if (!passageBlocks.has(q.passage_id)) {
        const block = { topic: q.topic || '', questions: [] }
        passageBlocks.set(q.passage_id, block)
        blocks.push(block)
      }
      passageBlocks.get(q.passage_id).questions.push(q)
    } else {
      blocks.push({ topic: q.topic || '', questions: [q] })
    }
  }

  const picked = []
  const pickRoundRobin = (candidates) => {
    const byTopic = new Map()
    for (const block of candidates) {
      if (!byTopic.has(block.topic)) byTopic.set(block.topic, [])
      byTopic.get(block.topic).push(block)
    }
    const queues = shuffle([...byTopic.values()].map(shuffle))
    while (picked.length < wanted && queues.some(q => q.length)) {
      for (const queue of queues) {
        if (picked.length >= wanted) break
        if (queue.length) picked.push(...queue.shift().questions)
      }
    }
  }
  const isFresh = (block) => !block.questions.some(isSeen)
  pickRoundRobin(blocks.filter(isFresh))
  pickRoundRobin(blocks.filter(b => !isFresh(b)))

  const minutes = Number(features.exam_minutes)
  const durationSec = minutes > 0
    ? Math.round(minutes * 60)
    : picked.length * DEFAULT_SECONDS_PER_QUESTION

  return {
    id: `subject-${subject?.id || 'unknown'}`,
    title: `${subject?.name || 'Subject'} practice exam`,
    sections: [{
      id: 'paper',
      name: subject?.name || 'Paper',
      durationSec,
      instructions: 'Answer every question. Flag any you want to revisit — marks and solutions appear only when you submit.',
      questions: picked,
    }],
  }
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
/**
 * One record per question on a finished paper, for the student's answer
 * history, so exam questions count as answered and aren't served again in
 * practice. A question left blank counts as attempted and wrong: the student
 * has seen it. `selected` is the chosen option index for MCQs, else null.
 */
export function examAnswerRecords(paper, answers = {}) {
  const records = []
  for (const sec of paper?.sections || []) {
    for (const q of sec.questions || []) {
      if (!q?.id) continue
      const resp = answers[q.id]
      const answered = resp !== undefined && resp !== null && !(Array.isArray(resp) && resp.length === 0)
      records.push({
        questionId: q.id,
        correct: answered && gradeResponse(q, resp),
        selected: Number.isInteger(resp) ? resp : null,
      })
    }
  }
  return records
}

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
