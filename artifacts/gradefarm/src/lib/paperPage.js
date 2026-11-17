// The page for one loaded exam paper (Admin → a subject → Exam papers →
// a paper; components/AdminPaperPage.jsx): its address, the question the
// preview shows while it's being edited, and the order papers are listed in.

/** The paper page's address. */
export function paperPath(curriculumId, label) {
  return `/admin/subjects/${curriculumId}/papers/${encodeURIComponent(label)}`
}

/** The paper label in the last part of the address, or null if it can't be read. */
export function paperLabelFromPath(segment) {
  try { return decodeURIComponent(segment) } catch { return null }
}

/** The question's number on the original paper ("Q12" → "12"). Stable, for ExamPaper's meta.numberOf. */
export const originalNumber = (q) => String(q?.source_question || '').replace(/^q(uestion)?\s*/i, '').trim() || '?'

/**
 * The question as an editor's unsaved draft would make it, for the preview
 * and the checks. MCQ drafts are { question, options, answerIndex, solution,
 * difficulty?, image_url? }; multi-part drafts { question, parts, image_url? }.
 * A draft without image_url leaves the saved figure.
 */
export function draftQuestion(q, draft) {
  if (!q || !draft) return q
  const image = 'image_url' in draft ? { image_url: draft.image_url } : {}
  if (Array.isArray(draft.parts)) {
    return { ...q, ...image, question: draft.question, parts: draft.parts, total_marks: draft.parts.reduce((s, p) => s + (Number(p.marks) || 0), 0) }
  }
  return {
    ...q, ...image, question: draft.question, options: draft.options, answer_index: draft.answerIndex, solution: draft.solution,
    ...(draft.difficulty != null ? { difficulty: draft.difficulty } : {}),
  }
}

/** Where an edit changed a figure: '' for the question's own, or a part's label. */
export function changedFigures(q, draft) {
  if (!q || !draft) return []
  const out = []
  if ('image_url' in draft && (draft.image_url || null) !== (q.image_url || null)) out.push('')
  const before = new Map((q.parts || []).map(p => [p.label || '', p.image_url || null]))
  for (const p of draft.parts || []) {
    const where = p.label || ''
    if ((p.image_url || null) !== (before.get(where) ?? null) && !out.includes(where)) out.push(where)
  }
  return out
}

/**
 * The address an unsaved image is previewed from. The printed paper sizes an
 * image whose address has /exam-papers/ in it at 3 px per point (as the ingest
 * crops), so a crop's preview address carries it too and previews at the size
 * it will print; an uploaded image prints at its own size.
 */
export const previewSrc = (blobUrl, kind) => (kind === 'crop' ? `${blobUrl}#/exam-papers/` : blobUrl)

/** An image chosen in the editor that hasn't been uploaded yet. */
export const isPendingImage = (url) => typeof url === 'string' && url.startsWith('blob:')

const ORDER = { partway: 0, unchecked: 1, checked: 2 }

/** Papers to list: those not finished first (part way, then not checked), then checked; filter 'all' or a state. */
export function orderPapers(papers, filter = 'all') {
  return (papers || [])
    .filter(p => filter === 'all' || p.status?.state === filter)
    .map((p, i) => ({ p, i }))
    .sort((a, b) => (ORDER[a.p.status?.state] ?? 1) - (ORDER[b.p.status?.state] ?? 1) || a.i - b.i)
    .map(x => x.p)
}
