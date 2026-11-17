import { createRoot } from 'react-dom/client'
import ExamPaper from '../src/components/ExamPaper'
import { A, B } from './fixtures'

// ?board=vce|sace&mode=full|preview&maths=1
const q = new URLSearchParams(location.search)
const board = q.get('board') || 'vce'
const preview = q.get('mode') === 'preview'
const isMaths = q.get('maths') === '1'
const exam = { A, B }
const totals = { aCount: A.length, aMarks: A.length, bCount: B.length, bMarks: 20, total: A.length + 20 }
const meta = {
  board, subjectTitle: 'Chemistry', paperTitle: 'Examination', paperNumber: '', headerTitle: 'GradeFarm Practice Chemistry Examination',
  materials: ['One scientific calculator'], readingMinutes: 15, writingMinutes: 150, isMaths,
  showSources: false, answerSheet: board === 'vce', solutions: false, totals,
  // For the comparison the preview numbers questions as the built exam does (VCE by
  // section, SACE straight through); the admin page numbers them as on the paper.
  ...(preview ? { preview: true, numberOf: (q2, section, i) => (board === 'sace' && section === 'B' ? A.length + i + 1 : i + 1) } : {}),
}
document.body.style.margin = '0'
createRoot(document.getElementById('root')).render(<ExamPaper exam={exam} meta={meta} />)
// Signal when images have loaded and layout has settled.
const settle = () => Promise.all([...document.images].map(i => (i.complete ? null : new Promise(r => { i.onload = i.onerror = r })))).then(() => new Promise(r => setTimeout(r, 800)))
window.__ready = document.fonts.ready.then(() => new Promise(r => setTimeout(r, 300))).then(settle).then(settle)
