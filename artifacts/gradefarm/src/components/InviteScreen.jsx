import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Check } from 'lucide-react'
import { fetchInvite, respondToInvite, switchToChild } from '../lib/db'
import { clearPendingInvite, inviteAcceptPath, pendingInvite, rememberPendingInvite } from '../lib/pendingInvite'
import { THEMES } from '../lib/theme'
import { AuthLayout, Note, authBtn } from './AuthLayout'
import CalmBackground from './CalmBackground'

const STATUS_TEXT = {
  accepted:  'This invite has already been accepted.',
  declined:  'This invite was declined.',
  cancelled: 'Your tutor cancelled this invite.',
  expired:   'This invite has expired. Ask your tutor to send a new one.',
}

/**
 * /invite/:token — a student accepts (or declines) a tutor's invite. An
 * invite sent to a parent (recipient 'parent') reads to them, and its sign-up
 * is the parent sign-up with the child's name filled in. Signed
 * out, it sends them to sign up (email pre-filled) or sign in and remembers
 * the invite (pendingInvite); once they're signed in the app accepts it
 * wherever they are (App.jsx). It accepts itself when they're signed in on
 * this page with it remembered, or arrive from the sign-up confirmation
 * link (?accept=1).
 */
export default function InviteScreen({ signedIn, theme = 'dark', onToggleTheme }) {
  const t = THEMES[theme]
  const { token } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [invite, setInvite] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(null) // 'accept' | 'decline'
  const [done, setDone] = useState(null) // 'accepted' | 'declined'
  const [accepted, setAccepted] = useState(null) // { subjects, subjectError, student } from accepting
  // A parent's invite that could be for more than one of their children: { childName, children }.
  const [choice, setChoice] = useState(null)
  const autoAccept = useRef(searchParams.get('accept') === '1')

  useEffect(() => {
    let cancelled = false
    fetchInvite(token)
      .then(inv => { if (!cancelled) setInvite(inv) })
      .catch(e => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [token])

  const respond = async (accept, child = null) => {
    setBusy(accept ? 'accept' : 'decline'); setError('')
    try {
      const res = await respondToInvite(token, accept, child)
      if (accept) setAccepted({ subjects: res?.subjects || [], subjectError: res?.subjectError || null, student: res?.student || null })
      setChoice(null)
      setDone(accept ? 'accepted' : 'declined')
    } catch (e) {
      if (e.body?.code === 'choose_child') {
        setChoice({ childName: e.body.child_name, children: e.body.children || [] })
        setBusy(null)
        return // still remembered: answered once they pick
      }
      setError(e.message)
    }
    if (pendingInvite() === token) clearPendingInvite() // answered, one way or the other
    setBusy(null)
  }

  // Back signed in after signing up or in from this page: accept it for them.
  useEffect(() => {
    if (!signedIn || !invite || busy || done) return
    const remembered = pendingInvite() === token
    if (invite.status !== 'pending') {
      if (remembered) clearPendingInvite()
      return
    }
    if (!autoAccept.current && !remembered) return
    autoAccept.current = false
    respond(true)
  }, [signedIn, invite]) // eslint-disable-line react-hooks/exhaustive-deps

  const forParent = invite?.recipient === 'parent'
  const child = invite?.child_name || 'your child'

  const toAuth = (mode) => {
    rememberPendingInvite(token)
    navigate('/auth', { state: {
      mode,
      email: invite?.signup_email || '',
      ...(forParent ? { as: 'parent', childName: invite.child_name || '' } : {}),
      // The sign-up confirmation link comes back here, on whichever device it's opened.
      redirectTo: `${window.location.origin}${inviteAcceptPath(token)}`,
      invitedBy: invite?.tutor_name || null,
    } })
  }

  // Reload so the sidebar picks up the new tutor and the portal welcome shows.
  const openPortal = () => window.location.assign('/portal')

  const tutor = invite?.tutor_name || 'Your tutor'
  const subjects = invite?.subjects || []
  const firstName = (invite?.tutor_name || '').trim().split(' ')[0] || tutor
  const childFirst = (accepted?.student?.name || child)

  const h1 = (text) => <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.25, color: t.text, textWrap: 'balance' }}>{text}</h1>
  const p = (children, extra) => <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: t.textSub, ...extra }}>{children}</p>
  const ok = (text) => <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 14, fontWeight: 700, color: t.success }}><Check size={16} strokeWidth={2.5} aria-hidden="true" />{text}</div>
  const homeBtn = <button type="button" className="af-btn" onClick={() => navigate('/home')} style={authBtn(t, 'secondary', { full: true })}>Go to gradefarm</button>

  let body
  if (!invite && !error) {
    body = p('Loading your invite…', { color: t.textMuted })
  } else if (!invite) {
    body = <>{h1("This invite link isn't working")}{p(error, { color: t.textMuted })}{homeBtn}</>
  } else if (done === 'accepted') {
    body = (
      <>
        {ok("You're in")}
        {h1(forParent ? `${tutor} is now ${childFirst}'s tutor` : `${tutor} is now your tutor`)}
        {accepted?.subjects?.length > 0 && p(`${listSubjects(accepted.subjects)} ${accepted.subjects.length > 1 ? 'are' : 'is'} unlocked, included with ${forParent ? 'the' : 'your'} tutoring.`, { color: t.textMuted })}
        {accepted?.subjectError && <Note theme={theme}>{accepted.subjectError}</Note>}
        {error && <Note tone="danger" theme={theme}>{error}</Note>}
        {accepted?.student ? (
          <button type="button" className="af-btn" onClick={() => switchToChild(accepted.student.id, '/portal').catch(e => setError(e.message))} style={authBtn(t, 'primary', { full: true })}>Switch to {accepted.student.name}</button>
        ) : (
          <button type="button" className="af-btn" onClick={openPortal} style={authBtn(t, 'primary', { full: true })}>Open the Student Portal</button>
        )}
      </>
    )
  } else if (done === 'declined') {
    body = <>{h1('Invite declined')}{p(forParent ? `${tutor} won't be added as ${child}'s tutor.` : `${tutor} won't be added as your tutor.`, { color: t.textMuted })}{homeBtn}</>
  } else if (invite.status !== 'pending') {
    body = <>{h1("This invite can't be used")}{p(STATUS_TEXT[invite.status] || 'This invite can no longer be used.', { color: t.textMuted })}{homeBtn}</>
  } else if (choice) {
    body = (
      <>
        {h1('Which of your children is this for?')}
        {p(<>{tutor} named <strong style={{ color: t.text }}>{choice.childName || 'your child'}</strong>.</>, { color: t.textMuted })}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {choice.children.map(c => (
            <button key={c.id} type="button" className="af-btn" onClick={() => respond(true, { childId: c.id })} disabled={!!busy} style={{ ...authBtn(t, 'secondary', { disabled: !!busy, full: true }), justifyContent: 'flex-start' }}>{c.name}</button>
          ))}
          <button type="button" className="af-btn" onClick={() => respond(true, { newChild: true })} disabled={!!busy} style={{ ...authBtn(t, 'primary', { disabled: !!busy, full: true }), justifyContent: 'flex-start' }}>
            Add {choice.childName || 'them'} as a new child
          </button>
        </div>
        {p('A new child gets their own account under your email, with their own progress and subjects. You switch between your children from the menu.', { fontSize: 12.5, color: t.textMuted })}
        {error && <Note tone="danger" theme={theme}>{error}</Note>}
      </>
    )
  } else if (busy === 'accept' && !error) {
    body = p('Accepting your invite…', { color: t.textMuted })
  } else {
    body = (
      <>
        {h1(forParent ? `${tutor} wants to tutor ${child}` : `${tutor} wants to be your tutor`)}
        {subjects.length > 0 && p(`${listSubjects(subjects)} ${subjects.length > 1 ? 'are' : 'is'} included with ${forParent ? `${child}'s` : 'your'} tutoring, at no cost.`, { color: t.textMuted, marginTop: -4 })}
        {p(forParent
          ? `You sign in with your email and set the account up for ${child}. Accepting opens the Student Portal for ${child}'s lessons and the work ${firstName} sets. ${firstName} will see ${child}'s practice progress, and you'll get a short progress email every Sunday.`
          : `Accepting opens the Student Portal: your lessons, recordings and the work ${firstName} sets. ${firstName} will see your practice progress.`)}
        {signedIn ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button type="button" className="af-btn" onClick={() => respond(true)} disabled={!!busy} style={authBtn(t, 'primary', { disabled: !!busy, full: true })}>{busy === 'accept' ? 'Accepting…' : 'Accept invite'}</button>
            <button type="button" className="af-btn" onClick={() => respond(false)} disabled={!!busy} style={authBtn(t, 'secondary', { disabled: !!busy, full: true })}>{busy === 'decline' ? 'Declining…' : 'Decline'}</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button type="button" className="af-btn" onClick={() => toAuth('signup')} style={authBtn(t, 'primary', { full: true })}>{forParent ? `Set up ${invite.child_name ? `${invite.child_name}'s` : 'the'} account` : 'Create account'}</button>
            <button type="button" className="af-btn" onClick={() => toAuth('signin')} style={authBtn(t, 'secondary', { full: true })}>I have an account</button>
          </div>
        )}
        {!signedIn && invite.email && p(<>Use <strong style={{ color: t.text }}>{invite.email}</strong>, the address the invite went to. We accept it as soon as you're in.</>, { fontSize: 12.5, color: t.textMuted, textAlign: 'center' })}
        {signedIn && invite.email && p(`Sent to ${invite.email}`, { fontSize: 12.5, color: t.textMuted, textAlign: 'center' })}
        {error && <Note tone="danger" theme={theme}>{error}</Note>}
      </>
    )
  }

  return (
    <AuthLayout theme={theme} backdrop={<CalmBackground theme={theme} />} onToggleTheme={onToggleTheme} onLogoClick={() => navigate('/home')}>
      <div className="af-in" style={{ width: '100%', maxWidth: 440, background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: 14, padding: 'clamp(20px, 5vw, 28px)', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {body}
      </div>
    </AuthLayout>
  )
}

/** "Chemistry", "Chemistry and Physics", "Chemistry, Physics and Biology". */
function listSubjects(labels) {
  return labels.length <= 1 ? (labels[0] || '') : `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`
}
