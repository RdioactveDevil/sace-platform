import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { fetchTutoringSession, getTutoringSessionToken, endTutoringSession } from '../lib/db'
import RoomFrame from './call/RoomFrame'

function sessionWhen(session) {
  if (!session?.scheduled_at) return null
  const start = new Date(session.scheduled_at)
  const label = start.toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
  return session.duration_minutes ? `${label} · ${session.duration_minutes} min` : label
}

export default function SessionRoom({ profile }) {
  const { sessionId } = useParams()
  const navigate = useNavigate()

  const [session, setSession] = useState(null)
  const [livekitToken, setLivekitToken] = useState(null)
  const [wsUrl, setWsUrl] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const s = await fetchTutoringSession(sessionId)
      setSession(s)
      const { token, wsUrl: url } = await getTutoringSessionToken(sessionId)
      setLivekitToken(token)
      setWsUrl(url)
    } catch (e) {
      setError(e.message || 'Failed to load session.')
    } finally {
      setLoading(false)
    }
  }, [sessionId])

  useEffect(() => { load() }, [load])

  const handleLeave = () => navigate(profile?.is_tutor ? '/tutor' : '/lessons')

  const handleEnd = async () => {
    try { await endTutoringSession(sessionId) } catch {}
    handleLeave()
  }

  const isTutor = profile?.is_tutor ?? false
  return (
    <RoomFrame
      loading={loading}
      error={error}
      token={livekitToken}
      wsUrl={wsUrl}
      title={session?.title || 'Tutoring session'}
      subtitle={sessionWhen(session)}
      isTutor={isTutor}
      onLeave={handleLeave}
      onEnd={isTutor ? handleEnd : undefined}
    />
  )
}
