import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { GraduationCap, Check, TriangleAlert, BookOpen } from 'lucide-react'
import { fetchInvite, respondToInvite } from '../lib/db'
import { clearPendingInvite, inviteAcceptPath, pendingInvite, rememberPendingInvite } from '../lib/pendingInvite'

const GOLD  = '#f1be43'
const GOLDL = '#f9d87a'
const NAVYD = '#080d28'
const FONT_B = "'Plus Jakarta Sans', sans-serif"

const STATUS_TEXT = {
  accepted:  'This invite has already been accepted.',
  declined:  'This invite was declined.',
  cancelled: 'Your tutor cancelled this invite.',
  expired:   'This invite has expired. Ask your tutor to send a new one.',
}

/**
 * /invite/:token — a student accepts (or declines) a tutor's invite. Signed
 * out, it sends them to sign up (email pre-filled) or sign in and remembers
 * the invite; it accepts itself when they come back signed in, either from
 * the app (pendingInvite) or from the sign-up confirmation link (?accept=1).
 */
export default function InviteScreen({ signedIn }) {
  const { token } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [invite, setInvite] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(null) // 'accept' | 'decline'
  const [done, setDone] = useState(null) // 'accepted' | 'declined'
  const [accepted, setAccepted] = useState(null) // { subject, subjectError } from accepting
  const autoAccept = useRef(searchParams.get('accept') === '1')

  useEffect(() => {
    let cancelled = false
    fetchInvite(token)
      .then(inv => { if (!cancelled) setInvite(inv) })
      .catch(e => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [token])

  const respond = async (accept) => {
    setBusy(accept ? 'accept' : 'decline'); setError('')
    try {
      const res = await respondToInvite(token, accept)
      if (accept) setAccepted({ subject: res?.subject || null, subjectError: res?.subjectError || null })
      setDone(accept ? 'accepted' : 'declined')
    } catch (e) { setError(e.message) }
    setBusy(null)
  }

  // Back signed in after signing up or in from this page: accept it for them.
  useEffect(() => {
    if (!signedIn) return
    if (pendingInvite() === token) autoAccept.current = true
    clearPendingInvite()
  }, [signedIn, token])
  useEffect(() => {
    if (!signedIn || invite?.status !== 'pending' || !autoAccept.current) return
    autoAccept.current = false
    respond(true)
  }, [signedIn, invite]) // eslint-disable-line react-hooks/exhaustive-deps

  const toAuth = (mode) => {
    rememberPendingInvite(token)
    navigate('/auth', { state: {
      mode,
      email: invite?.signup_email || '',
      // The sign-up confirmation link comes back here, on whichever device it's opened.
      redirectTo: `${window.location.origin}${inviteAcceptPath(token)}`,
      invitedBy: invite?.tutor_name || null,
    } })
  }

  // Reload so the sidebar picks up the new tutor and the portal welcome shows.
  const openPortal = () => window.location.assign('/portal')

  const btn = (primary, disabled) => ({
    padding: '12px 22px', borderRadius: 10, fontSize: 14, fontWeight: 800, fontFamily: FONT_B,
    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
    border: primary ? 'none' : '1px solid rgba(255,255,255,0.14)',
    background: primary ? `linear-gradient(135deg,${GOLD},${GOLDL})` : 'transparent',
    color: primary ? NAVYD : '#cbd5e1',
  })

  const tutor = invite?.tutor_name || 'Your tutor'
  const subject = invite?.subject || null
  let body
  if (!invite && !error) {
    body = <p style={{ color: '#94a3b8', fontSize: 14 }}>Loading invite…</p>
  } else if (!invite) {
    body = <Notice icon={TriangleAlert} color="#f87171" text={error} />
  } else if (done === 'accepted') {
    body = (
      <>
        <Notice icon={Check} color="#4ade80" text={`You're in. ${tutor} is now your tutor.`} />
        {accepted?.subject && (
          <div style={{ marginTop: 10 }}><Notice icon={BookOpen} color={GOLD} text={`${accepted.subject} is unlocked, included with your tutoring.`} /></div>
        )}
        {accepted?.subjectError && (
          <div style={{ marginTop: 10 }}><Notice icon={TriangleAlert} color={GOLD} text={accepted.subjectError} /></div>
        )}
        <button onClick={openPortal} style={{ ...btn(true), marginTop: 20 }}>Continue →</button>
      </>
    )
  } else if (done === 'declined') {
    body = (
      <>
        <Notice icon={Check} color="#94a3b8" text={`Invite declined. ${tutor} won't be added as your tutor.`} />
        <button onClick={() => navigate('/home')} style={{ ...btn(false), marginTop: 20 }}>Go to gradefarm.</button>
      </>
    )
  } else if (invite.status !== 'pending') {
    body = <Notice icon={TriangleAlert} color={GOLD} text={STATUS_TEXT[invite.status] || 'This invite can no longer be used.'} />
  } else if (busy === 'accept' && !error) {
    body = <p style={{ color: '#94a3b8', fontSize: 14 }}>Accepting your invite…</p>
  } else {
    body = (
      <>
        {subject && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', margin: '0 0 16px', padding: '12px 14px', borderRadius: 12, background: 'rgba(241,190,67,0.08)', border: '1px solid rgba(241,190,67,0.3)' }}>
            <BookOpen size={18} color={GOLD} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontSize: 14, lineHeight: 1.5, color: '#f1f5f9' }}>
              <strong>{subject}</strong> is included with your tutoring. There's nothing to pay for it.
            </div>
          </div>
        )}
        <p style={{ margin: '0 0 14px', color: '#cbd5e1', fontSize: 15, lineHeight: 1.6 }}>
          Accept to open the Student Portal: your lessons, class resources and recordings, and the work {tutor} sets you.
          {' '}{tutor} will also be able to see your practice progress.
        </p>
        <p style={{ margin: '0 0 22px', color: '#94a3b8', fontSize: 13 }}>Sent to {invite.email}</p>
        {signedIn ? (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={() => respond(true)} disabled={!!busy} style={btn(true, !!busy)}>{busy === 'accept' ? 'Accepting…' : 'Accept invite'}</button>
            <button onClick={() => respond(false)} disabled={!!busy} style={btn(false, !!busy)}>{busy === 'decline' ? 'Declining…' : 'Decline'}</button>
          </div>
        ) : (
          <>
            <p style={{ margin: '0 0 14px', color: '#cbd5e1', fontSize: 14 }}>Create your account with that email address (or sign in if you have one). We'll accept the invite for you as soon as you're in.</p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button onClick={() => toAuth('signup')} style={btn(true)}>Create account</button>
              <button onClick={() => toAuth('signin')} style={btn(false)}>I have an account</button>
            </div>
          </>
        )}
        {error && <div style={{ marginTop: 16 }}><Notice icon={TriangleAlert} color="#f87171" text={error} /></div>}
      </>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0c18', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 16px', fontFamily: FONT_B, boxSizing: 'border-box' }}>
      <div style={{ width: '100%', maxWidth: 480, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 18, padding: '32px 28px', boxSizing: 'border-box' }}>
        <div style={{ fontSize: 22, fontWeight: 900, color: GOLD, letterSpacing: '-0.5px', marginBottom: 22 }}>gradefarm.</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <GraduationCap size={22} color={GOLD} aria-hidden="true" />
          <h1 style={{ margin: 0, fontSize: 21, fontWeight: 800, color: '#f1f5f9' }}>
            {invite ? `${tutor} wants to be your tutor` : 'Tutor invite'}
          </h1>
        </div>
        {body}
      </div>
    </div>
  )
}

function Notice({ icon: Icon, color, text }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, color, fontSize: 14, fontWeight: 600, lineHeight: 1.5 }}>
      <Icon size={16} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
      <span>{text}</span>
    </div>
  )
}
