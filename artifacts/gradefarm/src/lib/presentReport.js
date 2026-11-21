// What the Present view shows of a finished diagnostic: the score, strengths,
// topics and subtopics, difficulty split and each question with its answers.
// Deliberately leaves out solution notes, the tutor's feedback text, pain
// points, patterns, recommendations and questionnaire answers.

const STRONG = 75
const WORK_ON = 60

// A multiple-choice answer is stored as a letter; show the option text.
function optionText(options, answer) {
  const letter = String(answer ?? '').trim().toUpperCase()
  if (!/^[A-Z]$/.test(letter)) return String(answer ?? '')
  const opt = options[letter.charCodeAt(0) - 65]
  if (opt == null) return String(answer ?? '')
  return /^[A-Z]\.\s/.test(opt) ? opt : `${letter}. ${opt}`
}

// How a question's marks read: full marks, some marks, or none.
export function resultLabel(marks, possible) {
  if (possible > 0 && marks >= possible) return { label: 'Correct', tone: 'success' }
  if (marks > 0) return { label: 'Partly right', tone: 'gold' }
  return { label: 'Incorrect', tone: 'danger' }
}

export function presentModel(assessment, report) {
  const a = assessment || {}
  const r = report || {}
  const byPct = [...(r.topic_breakdown || [])].sort((x, y) => x.percentage - y.percentage)
  const subs = r.subtopic_breakdown || []

  const difficulty = [
    { label: 'Easy', score: r.easy_score, max: r.easy_max },
    { label: 'Core', score: r.moderate_score, max: r.moderate_max },
    { label: 'Exam-style', score: r.exam_score, max: r.exam_max },
  ].filter(d => d.max > 0).map(d => ({ label: d.label, score: d.score || 0, max: d.max }))

  const results = new Map((r.question_results || []).map(qr => [String(qr.id), qr]))
  const questions = (a.questions || []).map(q => {
    const qr = results.get(String(q.id))
    const mc = q.type === 'multiple_choice' && Array.isArray(q.options) && q.options.length > 0
    const student = qr?.student_answer || a.student_answers?.[String(q.id)] || ''
    const correctRaw = q.correct_answer ?? qr?.correct_answer ?? ''
    const out = {
      id: q.id,
      question: q.question,
      type: q.type,
      studentAnswer: mc && student ? optionText(q.options, student) : student,
      correctAnswer: mc ? optionText(q.options, correctRaw) : String(correctRaw),
      correct: !!qr && qr.marks_possible > 0 && qr.marks_awarded === qr.marks_possible,
      marks: qr?.marks_awarded ?? 0,
      marksPossible: qr?.marks_possible ?? 0,
      result: resultLabel(qr?.marks_awarded ?? 0, qr?.marks_possible ?? 0),
    }
    if (mc) out.options = q.options
    return out
  })

  return {
    name: a.submitted_by_name || a.student_name || 'Student',
    subject: (a.subjects || []).map(s => s.name).join(', '),
    percentage: r.percentage,
    band: r.performance_band,
    strong: byPct.filter(t => t.percentage >= STRONG).reverse().map(t => t.topic),
    workOn: byPct.filter(t => t.percentage < WORK_ON).map(t => t.topic),
    topics: (r.topic_breakdown || []).map(t => ({
      topic: t.topic,
      percentage: t.percentage,
      subtopics: subs.filter(s => s.topic === t.topic).map(s => ({ subtopic: s.subtopic, percentage: s.percentage })),
    })),
    difficulty,
    questions,
  }
}
