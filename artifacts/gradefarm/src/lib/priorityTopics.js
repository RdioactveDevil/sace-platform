// Home's "Priority Topics": the weakest topics, once each, ranked by the
// student's accuracy across every answer they've given in that topic.
//
// `topicStats` maps topic -> { correct, wrong } (answer counts). A topic needs
// a few answers before it's ranked, so one unlucky question doesn't put a
// topic at the top, and topics the student is already doing well in are left
// out.
export const PRIORITY_MIN_ANSWERS = 3
export const PRIORITY_MAX_ACCURACY = 0.7
export const PRIORITY_LIMIT = 5

export function priorityTopics(topicStats, {
  minAnswers = PRIORITY_MIN_ANSWERS,
  maxAccuracy = PRIORITY_MAX_ACCURACY,
  limit = PRIORITY_LIMIT,
} = {}) {
  return Object.entries(topicStats || {})
    .map(([topic, s]) => {
      const correct = s?.correct || 0
      const answers = correct + (s?.wrong || 0)
      return { topic, answers, correct, accuracy: answers > 0 ? correct / answers : 0 }
    })
    .filter(x => x.answers >= minAnswers && x.accuracy < maxAccuracy)
    .sort((a, b) => a.accuracy - b.accuracy || b.answers - a.answers || a.topic.localeCompare(b.topic))
    .slice(0, limit)
}
