import { useState, useRef } from 'react'
import { Bot } from 'lucide-react'
import { THEMES } from '../lib/theme'
import { confirmDialog } from '../lib/dialog'
import DialogFrame, { DialogButtons } from './DialogFrame'
import { TestBuilder } from './TestBuilder'
import { addTestToDiagnostic } from '../lib/db'

const FONT_B = "'Plus Jakarta Sans', sans-serif"

/**
 * "Send a test" for a consultation that went out without one: choose the year
 * level, subject and topics, generate and check the questions, then send. The
 * test's link is emailed to the ticked recipients.
 *
 *   row     the diagnostic row { id, student_name, submitted_by_name, prospect_email }
 *   onDone  called after it's sent; the caller refreshes
 */
export default function SendTestModal({ row, theme, onClose, onDone }) {
  const t = THEMES[theme]
  const dark = theme === 'dark'
  const [test, setTest] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const who = row.submitted_by_name || row.student_name || row.prospect_email || 'this student'
  const focusRef = useRef(null)

  const requestClose = async () => {
    if (saving) return
    if (test && !(await confirmDialog('Discard the generated test?', { confirm: 'Discard', cancel: 'Keep editing', danger: true }))) return
    onClose()
  }

  const send = async () => {
    if (!test || saving) return
    setError('')
    setSaving(true)
    let res
    try {
      res = await addTestToDiagnostic(row.id, test)
    } catch (err) {
      setError(err.message || "That didn't work. Please try again.")
      setSaving(false)
      return
    }
    // The test is saved; a failed refresh of the list must not read as a failed send.
    try { await onDone(res) } catch { /* the list refreshes on its next load */ }
    onClose()
  }

  const inputStyle = {
    width: '100%', padding: '10px 12px', borderRadius: 8,
    border: dark ? '1px solid var(--t-border)' : `1px solid ${t.border}`,
    background: dark ? 'var(--t-bgSubtle)' : t.bgCard,
    color: t.text, fontFamily: FONT_B, fontSize: 14, boxSizing: 'border-box', outline: 'none',
  }
  const labelStyle = { display: 'block', fontSize: 11, fontWeight: 700, color: t.textMuted, marginBottom: 6, fontFamily: FONT_B }

  return (
    <DialogFrame theme={theme} title="Send a test" icon={<Bot size={17} aria-hidden="true" />} maxWidth={640}
      intro={`A diagnostic test for ${who}. Its link is emailed to the people who got the consultation details.`}
      onRequestClose={requestClose} firstFocusRef={focusRef}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <TestBuilder theme={theme} value={test} onChange={setTest} idPrefix="st" labelStyle={labelStyle} inputStyle={inputStyle} disabled={saving} />
        {error && <p role="alert" style={{ color: t.danger, fontSize: 13, margin: 0 }}>{error}</p>}
        {test && <DialogButtons theme={theme} onCancel={requestClose} submitType="button" onSubmit={send} submitLabel={saving ? 'Sending…' : 'Send the test'} busy={saving} />}
        {!test && (
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" ref={focusRef} onClick={requestClose} style={{ padding: '10px 20px', borderRadius: 9, border: dark ? '1px solid var(--t-border)' : `1px solid ${t.border}`, background: dark ? 'var(--t-bgSubtle)' : 'transparent', color: t.textMuted, fontFamily: FONT_B, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
          </div>
        )}
      </div>
    </DialogFrame>
  )
}
