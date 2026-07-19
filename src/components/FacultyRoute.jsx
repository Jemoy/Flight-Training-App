import { Navigate } from 'react-router-dom'

export default function FacultyRoute({ profile, loading, children }) {
  if (loading) return null
  if (!profile || !['faculty_personnel', 'admin'].includes(profile.role)) {
    return <Navigate to="/" replace />
  }
  return children
}
