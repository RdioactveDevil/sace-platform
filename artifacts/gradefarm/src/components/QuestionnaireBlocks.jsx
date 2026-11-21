import { useEffect, useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { THEMES } from '../lib/theme'
import { confirmDialog } from '../lib/dialog'
import { fetchQuestionnaire, saveQuestionnaire } from '../lib/db'
import { answerText, isFlagged, questionCount, cloneQuestionnaire, BASIC_QUESTIONNAIRE } from '../lib/questionnaireEdit'
import QuestionnaireEditor from './QuestionnaireEditor'

const FONT_B = "'Plus Jakarta Sans', sans-serif"

function styles(t, theme) {
  const dark = theme === 'dark'
  return {
    card: { background: 'var(--t-bgCard)', border: '1px solid var(--t-border)', borderRadius: 12 },
    sectionHdr: { padding: '14px 20px', borderBottom: '1px solid var(--t-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
    ghostBtn: { padding: '9px 16px', borderRadius: 9, border: dark ? '1px solid var(--t-border)' : `1px solid ${t.border}`, background: dark ? 'var(--t-bgSubtle)' : 'transparent', color: t.textMuted, fontFamily: FONT_B, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
    primaryBtn: busy => ({ padding: '10px 22px', borderRadius: 9, border: 'none', background: busy ? (dark ? 'var(--t-bgSubtle)' : t.border) : 'var(--t-accent)', color: busy ? t.textMuted : 'var(--t-onAccent)', fontFamily: FONT_B, fontSize: 13, fontWeight: 800, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.7 : 1 }),
    alert: { fontSize: 13, color: t.danger, padding: '10px 14px', borderRadius: 8, background: t.dangerBg, border: `1px solid ${t.danger}40` },
  }
}

/** The "Pre-call questionnaire" sub-tab: edit and save the tutor's own questionnaire. */
export function QuestionnaireTab({ theme }) {
  const t = THEMES[theme]
  const s = styles(t, theme)
  const [draft, setDraft] = useState(null)
  const [isDefault, setIsDefault] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [savedNote, setSavedNote] = useState('')

  useEffect(() => {
    let cancelled = false
    fetchQuestionnaire()
      .then(r => { if (!cancelled) { setDraft(cloneQuestionnaire(r.questionnaire)); setIsDefault(!!r.isDefault) } })
      .catch(err => { if (!cancelled) setLoadError(err.message || "Couldn't load your questionnaire.") })
    return () => { cancelled = true }
  }, [])

  const edit = v => { setDraft(v); setSavedNote('') }

  const save = async () => {
    setError(''); setSavedNote(''); setSaving(true)
    try {
      const saved = await saveQuestionnaire(draft)
      setDraft(cloneQuestionnaire(saved))
      setIsDefault(false)
      setSavedNote('Saved. New diagnostics use this questionnaire; ones already sent keep theirs.')
    } catch (err) {
      setError(err.message || "That didn't save. Please try again.")
    }
    setSaving(false)
  }

  const reset = async () => {
    const ok = await confirmDialog('Replace the questions below with the basic set? Nothing changes until you press Save.', { confirm: 'Use the basic set', cancel: 'Keep mine', danger: true })
    if (ok) { edit(cloneQuestionnaire(BASIC_QUESTIONNAIRE)); setError('') }
  }

  return (
    <div style={s.card}>
      <div style={s.sectionHdr}>
        <div>
          <div style={{ fontSize: 14.5, fontWeight: 800, color: t.text }}>Pre-call questionnaire</div>
          <div style={{ fontSize: 12, color: t.textMuted, marginTop: 3 }}>
            What a prospect fills in after booking a call.{isDefault ? " You haven't changed it yet, so the basic set is in use." : ''}
          </div>
        </div>
        {draft && <button type="button" onClick={reset} style={{ ...s.ghostBtn, padding: '6px 12px', fontSize: 12 }}>Reset to the basic set</button>}
      </div>
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {loadError && <div role="alert" style={s.alert}>{loadError}</div>}
        {!draft && !loadError && <div style={{ padding: 24, textAlign: 'center', color: t.textMuted, fontSize: 13 }}>Loading…</div>}
        {draft && <QuestionnaireEditor value={draft} onChange={edit} theme={theme} />}
        {error && <div role="alert" style={s.alert}>{error}</div>}
        {savedNote && <div role="status" style={{ fontSize: 13, color: t.success }}>{savedNote}</div>}
        {draft && (
          <button type="button" onClick={save} disabled={saving} style={{ ...s.primaryBtn(saving), alignSelf: 'flex-start' }}>
            {saving ? 'Saving…' : 'Save questionnaire'}
          </button>
        )}
      </div>
    </div>
  )
}

/** A modal with the editor on a copy; "Use for this student" hands the copy back. */
function TailorModal({ initial, theme, onCancel, onDone }) {
  const t = THEMES[theme]
  const dark = theme === 'dark'
  const s = styles(t, theme)
  const [draft, setDraft] = useState(() => cloneQuestionnaire(initial))
  const titleId = useId()
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 9999, padding: 16, overflowY: 'auto' }}>
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} style={{ background: t.bgCard, border: dark ? '1px solid var(--t-border)' : `1px solid ${t.border}`, borderRadius: 12, padding: 32, width: '100%', maxWidth: 720, fontFamily: FONT_B, margin: 'auto', backdropFilter: 'blur(16px)' }}>
        <h2 id={titleId} style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 800, letterSpacing: '-0.01em', color: t.text }}>Edit for this student</h2>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: t.textMuted }}>Changes here apply to this student's questionnaire only. Your own questionnaire stays as it is.</p>
        <QuestionnaireEditor value={draft} onChange={setDraft} theme={theme} />
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 24, flexWrap: 'wrap' }}>
          <button type="button" onClick={onCancel} style={s.ghostBtn}>Cancel</button>
          <button type="button" onClick={() => onDone(draft)} className="btn-gold-shimmer" style={s.primaryBtn(false)}>Use for this student</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/**
 * The create form's "Pre-call questionnaire" section. `master` is the tutor's own
 * (null until loaded); `tailored` is a copy edited for this student, or null.
 */
export function QuestionnaireSection({ master, masterError, tailored, onTailor, theme, labelStyle }) {
  const t = THEMES[theme]
  const s = styles(t, theme)
  const [open, setOpen] = useState(false)
  const shown = tailored || master
  return (
    <div>
      <div style={labelStyle}>Pre-call questionnaire</div>
      <div style={{ background: 'var(--t-bgSubtle)', border: '1px solid var(--t-border)', borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 180, fontSize: 13, color: t.text, fontWeight: 600 }}>
          {shown
            ? `${questionCount(shown)} question${questionCount(shown) === 1 ? '' : 's'} · ${tailored ? 'edited for this student' : 'from your questionnaire'}`
            : masterError ? "Couldn't load your questionnaire. Your own will still be used." : 'Loading your questionnaire…'}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {tailored && <button type="button" onClick={() => onTailor(null)} style={{ ...s.ghostBtn, padding: '6px 12px', fontSize: 12 }}>Use my questionnaire</button>}
          <button type="button" disabled={!shown} onClick={() => setOpen(true)} style={{ padding: '6px 12px', borderRadius: 7, border: `1px solid ${t.border}`, background: 'transparent', color: t.text, fontSize: 12, fontWeight: 700, cursor: shown ? 'pointer' : 'not-allowed', opacity: shown ? 1 : 0.5, fontFamily: FONT_B }}>
            Edit for this student
          </button>
        </div>
      </div>
      <div style={{ fontSize: 11, color: t.textFaint, marginTop: 4 }}>Sent to the student after they book a call. Edit your own in the "Pre-call questionnaire" tab.</div>
      {open && <TailorModal initial={shown} theme={theme} onCancel={() => setOpen(false)} onDone={q => { onTailor(q); setOpen(false) }} />}
    </div>
  )
}

/** The questions in order with the prospect's answers; red-flag answers are highlighted. */
export function QuestionnaireAnswers({ questionnaire, answers, submittedAt, theme }) {
  const t = THEMES[theme]
  if (!questionnaire || !answers) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {submittedAt && <div style={{ fontSize: 11, color: t.textFaint }}>Filled in {new Date(submittedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</div>}
      {questionnaire.items.map(item => {
        if (item.type === 'section') {
          return <div key={item.id} style={{ fontSize: 12, fontWeight: 800, color: t.text, marginTop: 4, paddingBottom: 4, borderBottom: '1px solid var(--t-border)' }}>{item.label}</div>
        }
        const text = answerText(item, answers[item.id])
        const flagged = isFlagged(item, answers[item.id])
        return (
          <div key={item.id}>
            <div style={{ fontSize: 12, fontWeight: 700, color: t.textMuted, marginBottom: 3 }}>{item.label}</div>
            {text ? (
              <div style={{ fontSize: 13, color: flagged ? t.danger : t.text, lineHeight: 1.55, whiteSpace: 'pre-wrap', ...(flagged ? { padding: '8px 12px', borderRadius: 8, background: t.dangerBg, border: `1px solid ${t.danger}40`, fontWeight: 600 } : {}) }}>
                {flagged && <span style={{ fontSize: 11, fontWeight: 800, marginRight: 8 }}>Red flag</span>}{text}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: t.textFaint }}>No answer</div>
            )}
          </div>
        )
      })}
    </div>
  )
}
