import { THEMES } from '../../lib/theme'
import { markingScheme, totalMarks } from '../../lib/questionTypes'
import { evidenceRanges } from '../../lib/writtenAnswers'
import MathText from '../MathText'

const FONT_B = "'Plus Jakarta Sans', sans-serif"
export const MAX_ANSWER_CHARS = 4000
const VISUALLY_HIDDEN = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }

/** The answer box for a written-answer ('marked') question. */
export function WrittenAnswerInput({ question, response, onChange, disabled, onSubmit, canSubmit, theme }) {
  const t = THEMES[theme]
  const marks = totalMarks(question)
  const text = typeof response === 'string' ? response : ''
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
        <label htmlFor={`wa-${question.id}`} style={{ fontSize: 12.5, fontWeight: 700, color: t.textSub }}>
          Your answer{marks ? ` · ${marks} mark${marks === 1 ? '' : 's'}` : ''}
        </label>
        <span style={{ fontSize: 11.5, color: t.textFaint }}>Marked by AI against the marking scheme</span>
      </div>
      <textarea
        id={`wa-${question.id}`}
        value={text}
        disabled={disabled}
        maxLength={MAX_ANSWER_CHARS}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && canSubmit) { e.preventDefault(); onSubmit() } }}
        placeholder={'Write it as you would in the exam. Show your working for calculations.\nType formulas plainly, e.g. H2SO4, Cu2+, 2H2 + O2 -> 2H2O'}
        rows={7}
        style={{
          width: '100%', boxSizing: 'border-box', padding: '12px 14px', borderRadius: 11, resize: 'vertical', minHeight: 140,
          fontFamily: FONT_B, fontSize: 14.5, lineHeight: 1.6, border: `1px solid ${t.border}`,
          background: t.bgSubtle, color: t.text, outline: 'none', opacity: disabled ? 0.85 : 1,
        }}
      />
      {text.length > MAX_ANSWER_CHARS - 400 && (
        <div style={{ fontSize: 11.5, color: t.textFaint, marginTop: 4, textAlign: 'right' }}>{text.length.toLocaleString()} / {MAX_ANSWER_CHARS.toLocaleString()}</div>
      )}
    </div>
  )
}

/** Mark-by-mark feedback: the answer with the credited parts highlighted, then each mark point. */
export function MarkingFeedback({ question, answer, result, theme }) {
  const t = THEMES[theme]
  const scheme = markingScheme(question)
  const full = result.awarded >= result.total
  const ranges = evidenceRanges(answer, result.marks)

  const pieces = []
  let pos = 0
  for (const [s, e, point] of ranges) {
    if (s > pos) pieces.push(answer.slice(pos, s))
    pieces.push(
      <mark key={`${s}-${point}`} style={{ background: t.successBg, color: t.text, borderBottom: `2px solid ${t.success}`, borderRadius: 3, padding: '0 1px' }}>
        {answer.slice(s, e)}
        <sup style={{ fontSize: 10, fontWeight: 800, color: t.success, marginLeft: 2 }}>{point + 1}</sup>
      </mark>,
    )
    pos = e
  }
  if (pos < answer.length) pieces.push(answer.slice(pos))

  return (
    <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div role="status" style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 22, fontWeight: 800, color: full ? t.success : t.text, fontVariantNumeric: 'tabular-nums' }}>
          {result.awarded} / {result.total}
        </span>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: t.textMuted }}>
          mark{result.total === 1 ? '' : 's'}{full ? ' · full marks' : ''}
        </span>
      </div>

      <div>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: t.textFaint, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Your answer</div>
        <div style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.7, color: t.textSub, padding: '10px 12px', borderRadius: 10, background: t.bgSubtle, border: `1px solid ${t.border}`, overflowWrap: 'anywhere' }}>
          {pieces}
        </div>
        {ranges.length > 0 && <div style={{ fontSize: 11.5, color: t.textFaint, marginTop: 4 }}>Highlighted: what earned each mark (numbers match the mark points below).</div>}
      </div>

      <ol aria-label="Marks" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {result.marks.map((m) => {
          const p = scheme[m.point]
          const got = m.awarded > 0
          const all = m.awarded >= m.of
          const tone = all ? t.success : got ? t.goldText : t.danger
          return (
            <li key={m.point} style={{ display: 'flex', gap: 10, padding: '10px 12px', borderRadius: 10, border: `1px solid ${t.border}`, background: t.bgCard }}>
              <span aria-hidden="true" style={{ flexShrink: 0, width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, background: all ? t.successBg : got ? t.accentGlow : t.dangerBg, color: tone }}>
                {m.point + 1}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: t.text, lineHeight: 1.5 }}>{p ? <MathText text={p.point} /> : `Mark point ${m.point + 1}`}</span>
                  <span style={{ flexShrink: 0, fontSize: 12.5, fontWeight: 800, color: tone, fontVariantNumeric: 'tabular-nums' }}>
                    {m.awarded}/{m.of}<span style={VISUALLY_HIDDEN}>{all ? ' marks given' : got ? ' marks, partly given' : ' marks, not given'}</span>
                  </span>
                </div>
                {m.comment && <div style={{ fontSize: 13, color: t.textSub, lineHeight: 1.55, marginTop: 3 }}><MathText text={m.comment} /></div>}
                {got && m.evidence && !m.found && (
                  <div style={{ fontSize: 12.5, color: t.textMuted, marginTop: 3 }}>For: “{m.evidence}”</div>
                )}
              </div>
            </li>
          )
        })}
      </ol>

      {result.summary && (
        <div style={{ fontSize: 13.5, color: t.textSub, lineHeight: 1.6, paddingLeft: 10, borderLeft: `2px solid ${t.accent}` }}>
          <MathText text={result.summary} />
        </div>
      )}
    </div>
  )
}
