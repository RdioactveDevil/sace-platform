import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { loadGuestCall, joinGuestCall } from '../lib/db'
import { formatWhen, joinCountdownText } from '../lib/bookingFormat'
import { AuthLayout } from './AuthLayout'
import { Panel, H1, P, btnStyle } from './publicUi'
import RoomFrame from './call/RoomFrame'

const zoneNow = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone } catch { return undefined } }

/** /call/:guestToken: the prospect's call page; the room itself once they join. Public. */
export default function GuestCallScreen({ theme = 'dark', onToggleTheme }) {
  const { guestToken } = useParams()
  const [call, setCall] = useState(null)
  const [error, setError] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const [room, setRoom] = useState(null) // { token, wsUrl } once joined
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState('')
  const [finished, setFinished] = useState(false)
  const zone = zoneNow()

  const load = useCallback(() => {
    loadGuestCall(guestToken).then(setCall).catch(err => setError(err.message || "This call link isn't valid."))
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
      if (err.status === 403 && err.body?.canJoinFrom) setCall(c => ({ ...c, canJoinFrom: err.body.canJoinFrom }))
      else if (err.status === 410) { setFinished(true); load() } // cancelled shows as such after the reload
      else setJoinError(err.message || 'Could not join the call.')
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
      {error && (
        <Panel>
          <H1>This call link isn't valid</H1>
          <P muted>{error} Check the link with whoever sent it.</P>
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
