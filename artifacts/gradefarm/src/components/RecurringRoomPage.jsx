import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getRoomInfo, getRoomToken } from '../lib/db'
import RoomFrame from './call/RoomFrame'

export default function RecurringRoomPage({ profile }) {
  const { roomName } = useParams()
  const navigate = useNavigate()
  const [room, setRoom] = useState(null)
  const [livekitToken, setLivekitToken] = useState(null)
  const [wsUrl, setWsUrl] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [roomInfo, tokenData] = await Promise.all([
        getRoomInfo(roomName),
        getRoomToken(roomName),
      ])
      setRoom(roomInfo)
      setLivekitToken(tokenData.token)
      setWsUrl(tokenData.wsUrl)
    } catch (e) {
      setError(e.message || 'Failed to join room.')
    } finally {
      setLoading(false)
    }
  }, [roomName])

  useEffect(() => { load() }, [load])

  const handleLeave = () => navigate(profile?.is_tutor ? '/tutor' : '/lessons')

  return (
    <RoomFrame
      loading={loading}
      error={error}
      token={livekitToken}
      wsUrl={wsUrl}
      title={room?.title || 'Session'}
      subtitle={room?.schedule || null}
      isTutor={profile?.is_tutor ?? false}
      onLeave={handleLeave}
    />
  )
}
