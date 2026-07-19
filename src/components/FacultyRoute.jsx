import { Navigate } from 'react-router-dom'

export default function FacultyRoute({
  profile,
  loading,
  roles = ['faculty_personnel', 'admin'],
  children,
}) {
  if (loading) return null
  if (!profile || !roles.includes(profile.role)) {
    return <Navigate to="/" replace />
  }
  return children
}
