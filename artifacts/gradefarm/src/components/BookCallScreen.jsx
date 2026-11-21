import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { loadConsultationSlots } from '../lib/db'
import { AuthLayout } from './AuthLayout'
import { Panel, H1, P } from './publicUi'
import BookingPicker from './BookingPicker'

/** /book/:token: book (or see) the consultation call for a finished diagnostic. Public. */
export default function BookCallScreen({ theme = 'dark', onToggleTheme }) {
  const { token } = useParams()
  const [state, setState] = useState({ phase: 'loading', data: null, error: '' })

  useEffect(() => {
    let cancelled = false
    loadConsultationSlots(token)
      .then(data => { if (!cancelled) setState({ phase: data.noHours ? 'closed' : 'ready', data, error: '' }) })
      .catch(err => { if (!cancelled) setState({ phase: 'error', data: null, error: err.status === 404 ? '' : err.message }) })
    return () => { cancelled = true }
  }, [token])

  const { phase, data, error } = state
  return (
    <AuthLayout theme={theme} onToggleTheme={onToggleTheme}>
      {phase === 'loading' && <Panel><P muted>Loading times…</P></Panel>}
      {phase === 'error' && (
        <Panel>
          <H1>This page isn't available</H1>
          <P muted>{error || "We couldn't find it. Check the link with whoever sent it."}</P>
        </Panel>
      )}
      {phase === 'closed' && (
        <Panel>
          <H1>No times to book yet</H1>
          <P muted>{data.senderName || 'They'} hasn't opened any times for calls. Get in touch with them directly.</P>
        </Panel>
      )}
      {phase === 'ready' && (
        <Panel>
          <H1>{data.booking ? 'Your call' : `Book a call${data.senderName ? ` with ${data.senderName}` : ''}`}</H1>
          <BookingPicker token={token} data={data} theme={theme} heading={false} />
        </Panel>
      )}
    </AuthLayout>
  )
}
