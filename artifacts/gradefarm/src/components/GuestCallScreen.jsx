import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { loadGuestCall, joinGuestCall } from '../lib/db'
import { formatWhen, joinCountdownText } from '../lib/bookingFormat'
import { guestLoadError, guestJoinOutcome } from '../lib/guestCall'
import { AuthLayout } from './AuthLayout'
import { Panel, H1, P, btnStyle } from './publicUi'
import RoomFrame from './call/RoomFrame'

const zoneNow = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone } catch { return undefined } }

/** /call/:guestToken: the prospect's call page; the room itself once they join. Public. */
export default function GuestCallScreen({ theme = 'dark', onToggleTheme }) {
  const { guestToken } = useParams()
  const [call, setCall] = useState(null)
  const [error, setError] = useState(null) // { invalid, message } when loading failed
  const [now, setNow] = useState(() => Date.now())
  const [room, setRoom] = useState(null) // { token, wsUrl } once joined
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState('')
  const [finished, setFinished] = useState(false)
  const zone = zoneNow()

  const load = useCallback(() => {
    setError(null)
    loadGuestCall(guestToken).then(setCall).catch(err => setError(guestLoadError(err)))
  }, [guestToken])
  useEffect(() => { load() }, [load])

  // The countdown refreshes every 30 seconds.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])

  const join = async () => {
    setJoining(true)
    setJoinError('')
    try {
      setRoom(await joinGuestCall(guestToken))
    } catch (err) {
      const outcome = guestJoinOutcome(err, Date.now())
      if (outcome.kind === 'wait') { setNow(Date.now()); setCall(c => ({ ...c, canJoinFrom: outcome.canJoinFrom })) }
      else if (outcome.kind === 'finished') { setFinished(true); load() } // cancelled shows as such after the reload
      else setJoinError(outcome.message)
    } finally {
      setJoining(false)
    }
  }

  if (room && call) {
    return (
      <RoomFrame token={room.token} wsUrl={room.wsUrl} title={call.title} subtitle={formatWhen(call.start, zone)} isTutor={false}
        onLeave={() => setRoom(null)} />
    )
  }

  const countdown = call ? joinCountdownText(call.canJoinFrom, now, zone) : null
  const over = finished || call?.status === 'completed'
  return (
    <AuthLayout theme={theme} onToggleTheme={onToggleTheme}>
      {!call && !error && <Panel><P muted>Loading your call…</P></Panel>}
      {!call && error?.invalid && (
        <Panel>
          <H1>{error.message}</H1>
          <P muted>Check the link with whoever sent it.</P>
        </Panel>
      )}
      {!call && error && !error.invalid && (
        <Panel>
          <H1>Your call didn't load.</H1>
          <P muted>{error.message}</P>
          <button type="button" className="af-btn" onClick={load} style={btnStyle('primary')}>Try again</button>
        </Panel>
      )}
      {call?.status === 'cancelled' && (
        <Panel>
          <H1>This call was cancelled.</H1>
          <P muted>{call.tutorName} can send you a new time.</P>
        </Panel>
      )}
      {call && call.status !== 'cancelled' && over && (
        <Panel>
          <H1>This call has finished.</H1>
        </Panel>
      )}
      {call && call.status !== 'cancelled' && !over && (
        <Panel>
          <H1>{call.title}</H1>
          <P>{formatWhen(call.start, zone)}{call.minutes ? `, ${call.minutes} minutes` : ''}</P>
          {countdown
            ? <P muted>{countdown}</P>
            : <P muted>You can join now.</P>}
          {joinError && <div role="alert" style={{ fontSize: 13.5, color: 'var(--t-danger)', lineHeight: 1.45 }}>{joinError}</div>}
          <button type="button" className="af-btn" onClick={join} disabled={!!countdown || joining}
            style={{ ...btnStyle('primary'), opacity: countdown || joining ? 0.55 : 1, cursor: countdown || joining ? 'default' : 'pointer' }}>
            {joining ? 'Joining…' : 'Join call'}
          </button>
        </Panel>
      )}
    </AuthLayout>
  )
}
