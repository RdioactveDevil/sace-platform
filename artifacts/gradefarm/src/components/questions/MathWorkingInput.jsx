import { useEffect, useRef, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { THEMES } from '../../lib/theme'
import { totalMarks } from '../../lib/questionTypes'
import { parseWorking, serializeWorking, newLine } from '../../lib/mathWorking'
import { MathLiveInput, MathKeyboard } from '../MathInput'

const FONT_B = "'Plus Jakarta Sans', sans-serif"

/**
 * The answer box for a written-answer question in a maths subject: working
 * set out one step per line, each line a maths box (the same input as the
 * Diagnostic) or a line of words. Enter starts a new line, Backspace on an
 * empty line removes it, and the arrow keys move between lines.
 *
 * Give it key={question.id}: it keeps its lines itself and only reads
 * `response` when it mounts.
 */
export default function MathWorkingInput({ question, response, onChange, disabled, onSubmit, canSubmit, theme }) {
  const t = THEMES[theme]
  const marks = totalMarks(question)
  const [lines, setLines] = useState(() => parseWorking(response))
  const [focusId, setFocusId] = useState(null)
  const [activeId, setActiveId] = useState(null)
  const [showSymbols, setShowSymbols] = useState(false)
  const fields = useRef({})
  const inserts = useRef({})
  const refFor = (map, id) => (map.current[id] ||= { current: null })
  // A line to focus once React has removed the one before it (removing the
  // focused field sends focus to the page, so this has to come after).
  const refocus = useRef(null)
  useEffect(() => {
    if (!refocus.current) return
    fields.current[refocus.current]?.current?.focus()
    refocus.current = null
  })

  const commit = (next) => {
    setLines(next)
    onChange(serializeWorking(next))
  }
  const setValue = (id, value) => commit(lines.map(l => (l.id === id ? { ...l, value } : l)))

  const focusLine = (id) => {
    const el = fields.current[id]?.current
    if (el) { el.focus(); return true }
    return false
  }

  const addLine = (kind, afterId = lines[lines.length - 1]?.id) => {
    const line = newLine(kind)
    const at = lines.findIndex(l => l.id === afterId)
    const next = [...lines]
    next.splice(at < 0 ? next.length : at + 1, 0, line)
    setFocusId(line.id)
    commit(next)
    return line
  }

  const removeLine = (id) => {
    if (lines.length <= 1) return false
    const i = lines.findIndex(l => l.id === id)
    const neighbour = lines[i - 1] || lines[i + 1]
    refocus.current = neighbour?.id || null
    commit(lines.filter(l => l.id !== id))
    return true
  }

  // Keys shared by maths and word lines. Returns true when handled.
  const handleKey = (id, key, e) => {
    if (disabled) return false
    const i = lines.findIndex(l => l.id === id)
    if (key === 'enter') {
      if (e?.metaKey || e?.ctrlKey) { if (canSubmit) onSubmit(); return true }
      addLine('math', id)
      return true
    }
    if (key === 'backspace-empty') return removeLine(id)
    if (key === 'up') return i > 0 && focusLine(lines[i - 1].id)
    if (key === 'down') return i < lines.length - 1 && focusLine(lines[i + 1].id)
    return false
  }

  // The symbols keyboard types into the maths line last used, else the last maths line.
  const insertSymbol = (sym) => {
    if (disabled) return
    const active = lines.find(l => l.id === activeId && l.kind === 'math')
    const target = active || [...lines].reverse().find(l => l.kind === 'math')
    if (target) { inserts.current[target.id]?.current?.(sym); return }
    // Only words so far: start a maths line; the symbol waits for the next press.
    addLine('math')
  }

  const lineButton = {
    display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 8,
    border: `1px solid ${t.border}`, background: t.bgCard, color: t.textMuted,
    fontFamily: FONT_B, fontSize: 12, fontWeight: 700, cursor: 'pointer',
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
        <span id={`mw-label-${question.id}`} style={{ fontSize: 12.5, fontWeight: 700, color: t.textSub }}>
          Your answer{marks ? ` · ${marks} mark${marks === 1 ? '' : 's'}` : ''}
        </span>
        {!disabled && <span style={{ fontSize: 11.5, color: t.textFaint }}>One step per line. Enter starts a new line.</span>}
      </div>

      <div
        role="group"
        aria-labelledby={`mw-label-${question.id}`}
        onFocus={e => { const id = e.target.closest?.('[data-line-id]')?.dataset.lineId; if (id) setActiveId(id) }}
        style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
      >
        {lines.map((line, i) => (
          <div key={line.id} data-line-id={line.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {line.kind === 'math' ? (
                <MathLiveInput
                  questionId={line.id}
                  value={line.value}
                  onAnswer={(_, v) => setValue(line.id, v)}
                  insertFnRef={refFor(inserts, line.id)}
                  fieldRef={refFor(fields, line.id)}
                  onKeys={(key, e) => handleKey(line.id, key, e)}
                  autoFocus={focusId === line.id}
                  ariaLabel={`Working, line ${i + 1} (maths)`}
                  disabled={disabled}
                  minHeight={46}
                  compact
                />
              ) : (
                <input
                  ref={el => { refFor(fields, line.id).current = el }}
                  type="text"
                  value={line.value}
                  disabled={disabled}
                  autoFocus={focusId === line.id}
                  aria-label={`Working, line ${i + 1} (words)`}
                  placeholder="Words, e.g. so the minimum is at x = 2"
                  onChange={e => setValue(line.id, e.target.value)}
                  onKeyDown={e => {
                    const key = e.key === 'Enter' ? 'enter'
                      : e.key === 'Backspace' && !line.value ? 'backspace-empty'
                        : e.key === 'ArrowUp' ? 'up' : e.key === 'ArrowDown' ? 'down' : null
                    if (key && handleKey(line.id, key, e)) e.preventDefault()
                  }}
                  style={{
                    width: '100%', boxSizing: 'border-box', minHeight: 46, padding: '8px 12px', borderRadius: 10,
                    border: `1px solid ${t.border}`, background: t.bgCard, color: t.text, outline: 'none',
                    fontFamily: FONT_B, fontSize: 14.5,
                  }}
                />
              )}
            </div>
            {!disabled && lines.length > 1 && (
              <button type="button" onClick={() => removeLine(line.id)} aria-label={`Remove line ${i + 1}`}
                style={{ flexShrink: 0, width: 28, height: 28, borderRadius: 7, border: 'none', background: 'transparent', color: t.textFaint, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={15} aria-hidden="true" />
              </button>
            )}
          </div>
        ))}
      </div>

      {!disabled && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => addLine('math')} style={lineButton}><Plus size={13} aria-hidden="true" />Maths line</button>
            <button type="button" onClick={() => addLine('text')} style={lineButton}><Plus size={13} aria-hidden="true" />Words</button>
            <button type="button" onClick={() => setShowSymbols(v => !v)} aria-pressed={showSymbols}
              style={{ ...lineButton, marginLeft: 'auto', color: showSymbols ? t.text : t.textMuted, borderColor: showSymbols ? t.text : t.border }}>
              {showSymbols ? 'Hide symbols' : 'Maths symbols'}
            </button>
          </div>
          {showSymbols && <MathKeyboard onInsert={insertSymbol} />}
        </>
      )}
    </div>
  )
}
