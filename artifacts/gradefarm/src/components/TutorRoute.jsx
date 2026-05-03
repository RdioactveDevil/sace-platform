import { Navigate } from 'react-router-dom'

export default function TutorRoute({ profile, children }) {
  if (!profile) return <Navigate to="/home" replace />
  if (!profile.is_tutor) return <Navigate to="/question-bank" replace />
  return children
}
