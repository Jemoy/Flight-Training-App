import { useEffect, useState } from 'react'
import { Routes, Route, useNavigate, Outlet, Link } from 'react-router-dom'
import { supabase } from './supabaseClient'
import { useProfile } from './hooks/useProfile'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Payments from './pages/Payments'
import Schedule from './pages/Schedule'
import FacultyPayments from './pages/FacultyPayments'
import FacultyEvaluations from './pages/FacultyEvaluations'
import ProtectedRoute from './components/ProtectedRoute'
import FacultyRoute from './components/FacultyRoute'

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const { profile, loading: profileLoading } = useProfile(session)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute session={session} loading={loading}>
            <Shell profile={profile} />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard session={session} />} />
        <Route path="payments" element={<Payments session={session} />} />
        <Route path="schedule" element={<Schedule session={session} />} />
        <Route
          path="faculty/payments"
          element={
            <FacultyRoute profile={profile} loading={profileLoading}>
              <FacultyPayments session={session} />
            </FacultyRoute>
          }
        />
        <Route
          path="faculty/evaluations"
          element={
            <FacultyRoute profile={profile} loading={profileLoading}>
              <FacultyEvaluations session={session} />
            </FacultyRoute>
          }
        />
      </Route>
    </Routes>
  )
}

function Shell({ profile }) {
  const navigate = useNavigate()
  const isFaculty = profile && ['faculty_personnel', 'admin'].includes(profile.role)

  async function handleSignOut() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          Flight<span>Path</span>
        </div>
        <nav className="sidebar-nav">
          <Link to="/">Dashboard</Link>
          <Link to="/payments">Payments</Link>
          <Link to="/schedule">Schedule</Link>
          {isFaculty && (
            <>
              <div className="sidebar-divider">Faculty</div>
              <Link to="/faculty/payments">Verify payments</Link>
              <Link to="/faculty/evaluations">Evaluations</Link>
            </>
          )}
          <button onClick={handleSignOut}>Sign out</button>
        </nav>
      </aside>
      <Outlet />
    </div>
  )
}
