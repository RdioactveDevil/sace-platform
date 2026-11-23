import MathText from './MathText'
import { FONT, C } from './publicUi'

// A diagnostic's multiple-choice options (A–D), shared by the untimed and timed pages.
export default function McqQuestion({ q, answer, onAnswer, disabled }) {
  return (
    <div role="radiogroup" aria-label={`Question ${q.id} options`} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {(q.options || []).map((opt, i) => {
        const letter = String.fromCharCode(65 + i)
        const selected = answer === letter
        return (
          <button
            key={letter}
            type="button"
            role="radio"
            aria-checked={selected}
            className="dg-opt"
            onClick={() => !disabled && onAnswer(q.id, letter)}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '11px 14px', borderRadius: 10, textAlign: 'left',
              border: `1px solid ${selected ? C.text : C.border}`, boxShadow: selected ? `0 0 0 1px ${C.text}` : 'none',
              background: C.card, color: C.text,
              cursor: disabled ? 'default' : 'pointer', fontFamily: FONT, fontSize: 14.5,
            }}
          >
            <span aria-hidden="true" style={{
              width: 24, height: 24, borderRadius: 6, flexShrink: 0,
              border: `1px solid ${selected ? C.text : C.border}`,
              background: selected ? C.text : 'transparent',
              color: selected ? C.bg : C.muted,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11.5, fontWeight: 800,
            }}>
              {letter}
            </span>
            <span style={{ flex: 1, minWidth: 0, lineHeight: 1.5 }}>
              <MathText text={opt.replace(/^[A-D]\.\s*/, '')} />
            </span>
          </button>
        )
      })}
    </div>
  )
}
