import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { saveParentDetails } from '../lib/db'
import { awaitingParent } from '../lib/parentConsent'
import { THEMES } from '../lib/theme'

const GOLD = '#f1be43'
const FONT_B = "'Plus Jakarta Sans', sans-serif"
/** How often to look for the parent's OK while the banner shows. */
const CHECK_MS = 60_000

/**
 * Banner across student pages while a student under 15 waits for their parent
 * or guardian to confirm (lib/parentConsent.js). Picks up the confirmation on
 * its own, so the AI features switch on without a reload.
 */
export default function ParentConsentBanner({ profile, theme, onProfileUpdated }) {
  const t = THEMES[theme]
  const navigate = useNavigate()
  const waiting = awaitingParent(profile)
  const [sending, setSending] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (!waiting || !profile?.id) return undefined
    let cancelled = false
    const check = () => {
      supabase.from('profiles').select('parent_consent_at').eq('id', profile.id).maybeSingle()
        .then(({ data }) => { if (!cancelled && data?.parent_consent_at) onProfileUpdated?.({ parent_consent_at: data.parent_consent_at }) }, () => {})
    }
    const id = setInterval(check, CHECK_MS)
    window.addEventListener('focus', check)
    return () => { cancelled = true; clearInterval(id); window.removeEventListener('focus', check) }
  }, [waiting, profile?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!waiting) return null

  const resend = async () => {
    setSending(true); setMsg('')
    try {
      const { parent } = await saveParentDetails({ resend: true })
      onProfileUpdated?.(parent)
      setMsg('Sent again.')
    } catch (e) {
      setMsg(e.message || "Couldn't send it. Try again in a minute.")
    }
    setSending(false)
  }

  const btn = (primary) => ({
    height: 32, padding: '0 12px', borderRadius: 9, fontFamily: FONT_B, fontSize: 12.5, fontWeight: 800, cursor: 'pointer', flexShrink: 0,
    border: primary ? 'none' : `1px solid ${t.border}`, background: primary ? GOLD : 'transparent', color: primary ? '#171724' : t.text,
  })

  return (
    <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '10px 20px', flexShrink: 0, fontFamily: FONT_B, borderBottom: `1px solid ${t.border}`, background: theme === 'dark' ? 'rgba(241,190,67,0.10)' : '#fff8e6' }}>
      <ShieldCheck size={17} color={t.goldText} aria-hidden="true" style={{ flexShrink: 0 }} />
      <div style={{ flex: '1 1 260px', minWidth: 0, fontSize: 13, color: t.text, lineHeight: 1.45 }}>
        {profile.parent_email ? (
          <>
            <strong>Titan AI switches on when your parent or guardian says yes.</strong>
            <span style={{ color: t.textMuted }}> We emailed {profile.parent_email}. Practice questions work in the meantime.</span>
          </>
        ) : (
          <>
            <strong>Add your parent or guardian's email to switch on Titan AI.</strong>
            <span style={{ color: t.textMuted }}> You're under 15, so we ask them first. Practice questions work in the meantime.</span>
          </>
        )}
        {msg && <span style={{ color: t.textMuted }}> {msg}</span>}
      </div>
      {profile.parent_email && (
        <button type="button" onClick={resend} disabled={sending} style={{ ...btn(true), opacity: sending ? 0.6 : 1 }}>
          {sending ? 'Sending…' : 'Send again'}
        </button>
      )}
      <button type="button" onClick={() => navigate('/my-account?tab=profile')} style={btn(!profile.parent_email)}>
        {profile.parent_email ? 'Change email' : 'Add email'}
      </button>
    </div>
  )
}
