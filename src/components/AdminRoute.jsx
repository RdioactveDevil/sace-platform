import { Navigate } from 'react-router-dom'

export default function AdminRoute({ profile, children }) {
  if (!profile) return <Navigate to="/home" replace />
  if (!profile.is_admin) return <Navigate to="/question-bank" replace />
  return children
}
