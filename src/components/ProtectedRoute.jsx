import { Navigate } from 'react-router-dom'

export default function ProtectedRoute({ session, loading, children }) {
  if (loading) return null
  if (!session) return <Navigate to="/login" replace />
  return children
}
