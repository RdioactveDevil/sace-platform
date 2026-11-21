import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { loadQuestionnaire, submitQuestionnaire } from '../lib/db'
import { loadDraft, saveDraft, clearDraft, missingRequired, toPayload } from '../lib/questionnaireForm'
import { AuthLayout } from './AuthLayout'
import { FONT, C, Panel, H1, P, OkLine, btnStyle } from './publicUi'

/**
 * /questionnaire/:token: the pre-call questionnaire a prospect fills in before
 * their consultation call. Public (the diagnostic's token is the key). The
 * sender is named in full by the server; nothing here says "your tutor".
 */

const MISSING = 'Please answer this.'

// A choice in the same chip style as the diagnostic's multiple choice, around a real radio or checkbox.
function Choice({ type, name, checked, onChange, label, children }) {
  return (
    <label className="qn-opt" style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', borderRadius: 10, cursor: 'pointer',
      border: `1px solid ${checked ? C.text : C.border}`, boxShadow: checked ? `0 0 0 1px ${C.text}` : 'none',
      background: C.card, color: C.text, fontFamily: FONT, fontSize: 14.5,
    }}>
      <input type={type} name={name} checked={checked} onChange={onChange} style={{ width: 18, height: 18, margin: 0, flexShrink: 0, accentColor: 'var(--t-text)', cursor: 'pointer' }} />
      <span style={{ flex: 1, minWidth: 0, lineHeight: 1.5 }}>{label}</span>
      {children}
    </label>
  )
}

function Question({ item, value, onChange, missing }) {
  const id = `qn-${item.id}`
  const errId = `${id}-err`
  const help = item.help && <div id={`${id}-help`} style={{ fontSize: 13, lineHeight: 1.5, color: C.muted }}>{item.help}</div>
  const error = missing && <div id={errId} role="alert" style={{ fontSize: 12.5, lineHeight: 1.45, color: 'var(--t-danger)' }}>{MISSING}</div>
  const describedBy = [item.help && `${id}-help`, missing && errId].filter(Boolean).join(' ') || undefined
  const title = <>{item.label}{item.required ? <span aria-hidden="true" style={{ color: C.muted }}> *</span> : <span style={{ fontWeight: 500, color: C.muted }}> (optional)</span>}</>
  const titleStyle = { fontSize: 15.5, fontWeight: 700, color: C.text, lineHeight: 1.6, whiteSpace: 'pre-wrap' }
  const card = { background: C.card, border: `1px solid ${missing ? 'var(--t-danger)' : C.border}`, borderRadius: 12, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12, margin: 0, minWidth: 0 }

  if (item.type === 'short' || item.type === 'long') {
    return (
      <section id={id} style={card}>
        <label htmlFor={`${id}-input`} style={titleStyle}>{title}</label>
        {help}
        {item.type === 'short'
          ? <input id={`${id}-input`} className="af-inp" type="text" value={value || ''} onChange={e => onChange(e.target.value)}
              aria-required={item.required || undefined} aria-invalid={missing || undefined} aria-describedby={describedBy} />
          : <textarea id={`${id}-input`} className="af-inp" value={value || ''} onChange={e => onChange(e.target.value)}
              aria-required={item.required || undefined} aria-invalid={missing || undefined} aria-describedby={describedBy}
              style={{ minHeight: 120, fontSize: 15.5, lineHeight: 1.7, resize: 'vertical' }} />}
        {error}
      </section>
    )
  }

  const many = item.type === 'many'
  const v = value || {}
  const otherOn = many ? !!v.otherOn : v.choice === 'other'
  const otherInput = (
    <input className="af-inp" type="text" value={v.other || ''} aria-label={`Other: ${item.label}`} placeholder="Please specify"
      onClick={e => e.stopPropagation()} onChange={e => onChange(many ? { ...v, otherOn: true, other: e.target.value } : { ...v, choice: 'other', other: e.target.value })} />
  )
  return (
    <fieldset id={id} aria-required={item.required || undefined} aria-describedby={describedBy} style={card}>
      <legend style={{ ...titleStyle, padding: 0, float: 'left', width: '100%' }}>{title}</legend>
      <div style={{ clear: 'both', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {help}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(item.options || []).map(o => many ? (
            <Choice key={o.id} type="checkbox" name={id} label={o.label} checked={(v.picked || []).includes(o.id)}
              onChange={e => onChange({ ...v, picked: e.target.checked ? [...(v.picked || []), o.id] : (v.picked || []).filter(x => x !== o.id) })} />
          ) : (
            <Choice key={o.id} type="radio" name={id} label={o.label} checked={v.choice === o.id} onChange={() => onChange({ ...v, choice: o.id })} />
          ))}
          {item.other && (
            <Choice type={many ? 'checkbox' : 'radio'} name={id} label="Other" checked={otherOn}
              onChange={e => onChange(many ? { ...v, otherOn: e.target.checked } : { ...v, choice: 'other' })} />
          )}
          {item.other && otherOn && otherInput}
        </div>
        {error}
      </div>
    </fieldset>
  )
}

export default function QuestionnaireScreen({ theme = 'dark', onToggleTheme }) {
  const { token } = useParams()
  const [state, setState] = useState({ phase: 'loading', data: null, error: '' })
  const [answers, setAnswers] = useState({})
  const [missing, setMissing] = useState([])
  const [sending, setSending] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const loaded = useRef(false)

  useEffect(() => {
    let cancelled = false
    loadQuestionnaire(token)
      .then(data => {
        if (cancelled) return
        if (data.submitted) setState({ phase: 'submitted', data, error: '' })
        else if (!data.open) setState({ phase: 'closed', data, error: '' })
        else { setAnswers(loadDraft(token)); loaded.current = true; setState({ phase: 'ready', data, error: '' }) }
      })
      .catch(err => { if (!cancelled) setState({ phase: 'error', data: null, error: err.status === 404 ? '' : err.message }) })
    return () => { cancelled = true }
  }, [token])

  // The draft is kept as they go, so a closed tab doesn't lose it.
  useEffect(() => { if (loaded.current && state.phase === 'ready') saveDraft(token, answers) }, [answers, token, state.phase])

  const { phase, data, error } = state
  const sender = data?.senderName || ''

  const setAnswer = (id, value) => {
    setAnswers(a => ({ ...a, [id]: value }))
    setMissing(m => (m.includes(id) ? m.filter(x => x !== id) : m))
  }

  const send = async () => {
    setSubmitError('')
    const gaps = missingRequired(data, answers)
    setMissing(gaps)
    if (gaps.length) {
      const el = document.getElementById(`qn-${gaps[0]}`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el?.querySelector('input, textarea')?.focus({ preventScroll: true })
      return
    }
    setSending(true)
    try {
      await submitQuestionnaire(token, toPayload(data, answers))
      clearDraft(token)
      setState(s => ({ ...s, phase: 'done' }))
      window.scrollTo?.({ top: 0, behavior: 'smooth' })
    } catch (err) {
      if (err.status === 409) { clearDraft(token); setState(s => ({ ...s, phase: 'submitted' })) }
      else if (err.status === 410) setState(s => ({ ...s, phase: 'closed' }))
      else setSubmitError(err.message || "That didn't send. Try again.")
    } finally {
      setSending(false)
    }
  }

  return (
    <AuthLayout theme={theme} onToggleTheme={onToggleTheme}>
      <style>{`
        .qn-opt:hover { border-color: var(--t-textMuted) !important; }
        .qn-opt:focus-within { outline: 2px solid var(--t-accent); outline-offset: 2px; }
      `}</style>
      {phase === 'loading' && <Panel><P muted>Loading the questionnaire…</P></Panel>}
      {phase === 'error' && (
        <Panel>
          <H1>This page isn't available</H1>
          <P muted>{error || "We couldn't find it. Check the link with whoever sent it."}</P>
        </Panel>
      )}
      {phase === 'closed' && (
        <Panel>
          <H1>This questionnaire has closed.</H1>
          <P muted>{sender ? `If you still want to add something, get in touch with ${sender}.` : 'If you still want to add something, get in touch with whoever sent it.'}</P>
        </Panel>
      )}
      {phase === 'submitted' && (
        <Panel>
          <OkLine>Answers sent</OkLine>
          <H1>Thanks, we have your answers.</H1>
          <P muted>{sender ? `${sender} has them, and will go through them with you on your call.` : 'They will be gone through with you on your call.'} You can close this page.</P>
        </Panel>
      )}
      {phase === 'done' && (
        <Panel>
          <OkLine>Sent</OkLine>
          <H1>Thanks, that's sent{sender ? ` to ${sender}` : ''}.</H1>
          <P muted>{sender ? `${sender} will` : 'They will'} go through your answers with you on your call. You can close this page.</P>
        </Panel>
      )}
      {phase === 'ready' && (
        <form noValidate onSubmit={e => { e.preventDefault(); if (!sending) send() }} style={{ width: '100%', maxWidth: 680, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <H1>Before your call</H1>
          {data.intro && <P>{data.intro}</P>}
          <P muted>{sender ? `Your answers go to ${sender}. ` : ''}Questions marked * need an answer. Your answers are saved on this device as you go.</P>
          {data.items.map(item => item.type === 'section' ? (
            <div key={item.id} style={{ marginTop: 8 }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: C.text }}>{item.label}</h2>
              {item.help && <div style={{ marginTop: 4, fontSize: 13, lineHeight: 1.5, color: C.muted }}>{item.help}</div>}
            </div>
          ) : (
            <Question key={item.id} item={item} value={answers[item.id]} onChange={v => setAnswer(item.id, v)} missing={missing.includes(item.id)} />
          ))}
          {(submitError || missing.length > 0) && (
            <div role="alert" style={{ fontSize: 13.5, color: 'var(--t-danger)' }}>
              {submitError || `${missing.length} question${missing.length !== 1 ? 's need' : ' needs'} an answer.`}
            </div>
          )}
          <button type="submit" className="af-btn" disabled={sending} style={{ ...btnStyle('primary'), opacity: sending ? 0.55 : 1, cursor: sending ? 'default' : 'pointer' }}>
            {sending ? 'Sending…' : 'Submit'}
          </button>
        </form>
      )}
    </AuthLayout>
  )
}
