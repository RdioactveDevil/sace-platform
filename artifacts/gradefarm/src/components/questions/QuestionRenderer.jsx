import { useEffect } from 'react'
import { THEMES } from '../../lib/theme'
import { getQuestionType, gradeResponse, responseIsComplete, describeCorrectAnswer } from '../../lib/questionTypes'
import MathText from '../MathText'

const GOLD = '#f1be43'
const GOLDL = '#f9d87a'
const NAVY = '#0c1037'
const FONT_B = "'Plus Jakarta Sans', sans-serif"
const FONT_M = "'JetBrains Mono', monospace"

// Shared option-pill styling used by mcq + multi_select so they read identically
// to the legacy quiz card.
function optionStyle(t, { picked, showAns, isCorrect, isPickedWrong }) {
  let bg = t.bgSubtle, border = `1px solid ${t.border}`, color = t.textSub
  if (showAns) {
    if (isCorrect) { bg = t.successBg; border = `1px solid ${t.success}55`; color = t.success }
    else if (isPickedWrong) { bg = t.dangerBg; border = `1px solid ${t.danger}55`; color = t.danger }
    else { bg = 'transparent'; border = `1px solid ${t.border}`; color = t.textFaint }
  } else if (picked) {
    bg = t.accentGlow; border = `1px solid ${t.borderAccent}`; color = t.text
  }
  return {
    background: bg, border, color, padding: '12px 16px', borderRadius: 11,
    fontSize: 14, fontWeight: 600, textAlign: 'left', fontFamily: FONT_B,
    display: 'flex', alignItems: 'center', gap: 12, transition: 'all 0.13s',
    cursor: showAns ? 'default' : 'pointer', width: '100%',
  }
}

function Bullet({ t, children, bg, color }) {
  return (
    <span style={{ width: 28, height: 28, borderRadius: '50%', background: bg || t.borderMid, color: color || t.text, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0 }}>
      {children}
    </span>
  )
}

// ── Multiple select ──────────────────────────────────────────────────────────
function MultiSelect({ question, response, onChange, showAns, theme }) {
  const t = THEMES[theme]
  const picks = Array.isArray(response) ? response : []
  const correct = question.answer_indices || []
  const toggle = (i) => {
    if (showAns) return
    onChange(picks.includes(i) ? picks.filter(x => x !== i) : [...picks, i])
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 11, color: t.textFaint, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Select all that apply</div>
      {question.options.map((opt, i) => {
        const picked = picks.includes(i)
        const isCorrect = correct.includes(i)
        const isPickedWrong = picked && !isCorrect
        return (
          <button key={i} onClick={() => toggle(i)} style={optionStyle(t, { picked, showAns, isCorrect, isPickedWrong })}>
            <Bullet t={t}
              bg={showAns ? (isCorrect ? `${t.success}33` : isPickedWrong ? `${t.danger}33` : t.borderMid) : picked ? t.accentGlow : t.borderMid}
              color={showAns ? (isCorrect ? t.success : isPickedWrong ? t.danger : t.textFaint) : picked ? GOLD : t.text}
            >
              {showAns && isCorrect ? '✓' : showAns && isPickedWrong ? '✗' : picked ? '■' : '□'}
            </Bullet>
            <span style={{ minWidth: 0, flex: 1, overflowX: 'auto' }}><MathText text={opt} /></span>
          </button>
        )
      })}
    </div>
  )
}

// ── Numeric entry ────────────────────────────────────────────────────────────
function Numeric({ question, response, onChange, showAns, onSubmit, canSubmit, theme }) {
  const t = THEMES[theme]
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 8 }}>
        <input
          type="number"
          inputMode="decimal"
          value={response ?? ''}
          disabled={showAns}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && canSubmit) onSubmit() }}
          placeholder="Your answer"
          style={{
            flex: 1, padding: '14px 16px', borderRadius: 11, fontFamily: FONT_M, fontSize: 18, fontWeight: 700,
            border: `1px solid ${t.border}`, background: t.bgSubtle, color: t.text, outline: 'none',
          }}
        />
        {question.unit && (
          <div style={{ display: 'flex', alignItems: 'center', padding: '0 16px', borderRadius: 11, background: t.bgHover, border: `1px solid ${t.border}`, color: t.textMuted, fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap' }}>
            <MathText text={question.unit} />
          </div>
        )}
      </div>
      {question.tolerance != null && !showAns && (
        <div style={{ fontSize: 11, color: t.textFaint, marginTop: 6 }}>Accepted within ±{question.tolerance}{question.unit ? ' ' + question.unit : ''}</div>
      )}
    </div>
  )
}

// ── Short text ───────────────────────────────────────────────────────────────
function ShortText({ question, response, onChange, showAns, onSubmit, canSubmit, theme }) {
  const t = THEMES[theme]
  return (
    <input
      type="text"
      value={response ?? ''}
      disabled={showAns}
      onChange={e => onChange(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter' && canSubmit) onSubmit() }}
      placeholder="Type your answer"
      style={{
        width: '100%', padding: '14px 16px', borderRadius: 11, fontFamily: FONT_B, fontSize: 16, fontWeight: 600,
        border: `1px solid ${t.border}`, background: t.bgSubtle, color: t.text, outline: 'none',
      }}
    />
  )
}

// ── Put in order (move up/down — touch friendly, no DnD dependency) ───────────
function OrderList({ question, response, onChange, showAns, theme }) {
  const t = THEMES[theme]
  // Seed the student's response with a shuffled copy the first time this
  // question renders, so it never starts in the already-correct order.
  useEffect(() => {
    if (!Array.isArray(response) || response.length === 0) {
      const src = question.items || []
      const shuffled = [...src]
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
      }
      // Nudge off a coincidentally-correct shuffle when there's room to.
      if (src.length > 1 && shuffled.every((x, i) => x === src[i])) {
        ;[shuffled[0], shuffled[1]] = [shuffled[1], shuffled[0]]
      }
      onChange(shuffled)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question])

  const items = Array.isArray(response) && response.length ? response : (question.items || [])
  const move = (idx, dir) => {
    if (showAns) return
    const next = [...items]
    const j = idx + dir
    if (j < 0 || j >= next.length) return
    ;[next[idx], next[j]] = [next[j], next[idx]]
    onChange(next)
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 11, color: t.textFaint, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Arrange in the correct order</div>
      {items.map((item, i) => {
        const rightSpot = showAns && question.items[i] === item
        return (
          <div key={item + i} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 11,
            background: showAns ? (rightSpot ? t.successBg : t.dangerBg) : t.bgSubtle,
            border: `1px solid ${showAns ? (rightSpot ? t.success + '55' : t.danger + '55') : t.border}`,
          }}>
            <Bullet t={t} bg={t.accentGlow} color={GOLD}>{i + 1}</Bullet>
            <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, color: t.text }}><MathText text={item} /></span>
            {!showAns && (
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <button onClick={() => move(i, -1)} disabled={i === 0} style={arrowBtn(t, i === 0)}>▲</button>
                <button onClick={() => move(i, 1)} disabled={i === items.length - 1} style={arrowBtn(t, i === items.length - 1)}>▼</button>
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

function arrowBtn(t, disabled) {
  return {
    width: 26, height: 18, borderRadius: 5, border: `1px solid ${t.border}`, background: t.bgHover,
    color: disabled ? t.textFaint : t.textMuted, fontSize: 9, cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.4 : 1, lineHeight: 1, padding: 0,
  }
}

// ── Hotspot — click the correct region of an image ───────────────────────────
function Hotspot({ question, response, onChange, showAns, theme }) {
  const t = THEMES[theme]
  const hs = question.hotspots || []
  return (
    <div>
      <div style={{ position: 'relative', width: '100%', borderRadius: 12, overflow: 'hidden', border: `1px solid ${t.border}`, background: t.bgSubtle }}>
        <img src={question.image_url} alt="Question diagram" style={{ display: 'block', width: '100%' }} />
        {hs.map((h, i) => {
          const picked = response === i
          let border = `2px dashed ${t.borderAccent}`, bg = 'transparent'
          if (showAns) {
            if (h.correct) { border = `2px solid ${t.success}`; bg = `${t.success}33` }
            else if (picked) { border = `2px solid ${t.danger}`; bg = `${t.danger}33` }
            else { border = `2px dashed ${t.border}` }
          } else if (picked) { border = `2px solid ${GOLD}`; bg = t.accentGlow }
          return (
            <button key={i} onClick={() => { if (!showAns) onChange(i) }}
              title={showAns ? h.label : 'Click to select this region'}
              style={{ position: 'absolute', left: `${h.x}%`, top: `${h.y}%`, width: `${h.w}%`, height: `${h.h}%`, border, background: bg, borderRadius: 8, cursor: showAns ? 'default' : 'pointer', padding: 0 }} />
          )
        })}
      </div>
      {!showAns && <div style={{ fontSize: 11, color: t.textFaint, marginTop: 8 }}>Click the correct region on the image.</div>}
    </div>
  )
}

// ── Image labelling — assign each label to its numbered marker ────────────────
function ImageLabel({ question, response, onChange, showAns, theme }) {
  const t = THEMES[theme]
  const markers = question.markers || []
  const labels = question.labels || []
  const resp = Array.isArray(response) && response.length === markers.length ? response : markers.map(() => null)
  const setAt = (i, v) => { const next = [...resp]; next[i] = v || null; onChange(next) }
  return (
    <div>
      <div style={{ position: 'relative', width: '100%', borderRadius: 12, overflow: 'hidden', border: `1px solid ${t.border}`, background: t.bgSubtle }}>
        <img src={question.image_url} alt="Question diagram" style={{ display: 'block', width: '100%' }} />
        {markers.map((m, i) => (
          <span key={i} style={{ position: 'absolute', left: `${m.x}%`, top: `${m.y}%`, transform: 'translate(-50%,-50%)', width: 24, height: 24, borderRadius: '50%', background: GOLD, color: NAVY, fontWeight: 800, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 6px rgba(0,0,0,0.45)', border: '2px solid #fff' }}>{i + 1}</span>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
        {markers.map((m, i) => {
          const correct = showAns && resp[i] === m.answer
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Bullet t={t} bg={t.accentGlow} color={GOLD}>{i + 1}</Bullet>
              <select value={resp[i] || ''} disabled={showAns} onChange={e => setAt(i, e.target.value)}
                style={{ flex: 1, padding: '10px 12px', borderRadius: 9, fontFamily: FONT_B, fontSize: 13, cursor: showAns ? 'default' : 'pointer',
                  border: `1px solid ${showAns ? (correct ? t.success + '55' : t.danger + '55') : t.border}`,
                  background: showAns ? (correct ? t.successBg : t.dangerBg) : t.bgSubtle,
                  color: showAns ? (correct ? t.success : t.danger) : t.text }}>
                <option value="">Choose a label…</option>
                {labels.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
              {showAns && !correct && <span style={{ fontSize: 11, color: t.success, whiteSpace: 'nowrap', fontWeight: 700 }}>✓ {m.answer}</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * QuestionRenderer — renders the input UI for any non-mcq question type and
 * owns the Check button. The parent passes the controlled `response` + onChange
 * and an `onSubmit(response, isCorrect)` callback fired when the student checks.
 *
 * (mcq is intentionally NOT handled here — the legacy quiz card renders mcq
 * inline so its instant-answer behaviour and styling stay byte-identical.)
 */
export default function QuestionRenderer({ question, response, onChange, showAns, onSubmit, theme = 'dark', hideCheck = false }) {
  const t = THEMES[theme]
  const type = getQuestionType(question)
  const canSubmit = !showAns && responseIsComplete(question, response)

  const submit = () => {
    if (!canSubmit) return
    onSubmit(response, gradeResponse(question, response))
  }

  return (
    <div>
      {type === 'multi_select' && <MultiSelect question={question} response={response} onChange={onChange} showAns={showAns} theme={theme} />}
      {type === 'numeric' && <Numeric question={question} response={response} onChange={onChange} showAns={showAns} onSubmit={submit} canSubmit={canSubmit} theme={theme} />}
      {type === 'short_text' && <ShortText question={question} response={response} onChange={onChange} showAns={showAns} onSubmit={submit} canSubmit={canSubmit} theme={theme} />}
      {type === 'order' && <OrderList question={question} response={response} onChange={onChange} showAns={showAns} theme={theme} />}
      {type === 'hotspot' && <Hotspot question={question} response={response} onChange={onChange} showAns={showAns} theme={theme} />}
      {type === 'image_label' && <ImageLabel question={question} response={response} onChange={onChange} showAns={showAns} theme={theme} />}

      {showAns && (type === 'numeric' || type === 'short_text') && (
        <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 10, background: t.successBg, border: `1px solid ${t.success}44`, fontSize: 13, color: t.success, fontWeight: 700 }}>
          Correct answer: <MathText text={describeCorrectAnswer(question)} />
        </div>
      )}

      {!showAns && !hideCheck && (
        <button
          onClick={submit}
          disabled={!canSubmit}
          style={{
            marginTop: 16, width: '100%', padding: '13px', borderRadius: 12, border: 'none',
            background: canSubmit ? `linear-gradient(135deg,${GOLD},${GOLDL})` : t.bgHover,
            color: canSubmit ? NAVY : t.textFaint, fontSize: 14, fontWeight: 800,
            cursor: canSubmit ? 'pointer' : 'default', fontFamily: FONT_B,
            boxShadow: canSubmit ? `0 6px 20px rgba(241,190,67,0.3)` : 'none',
          }}
        >
          Check answer
        </button>
      )}
    </div>
  )
}
