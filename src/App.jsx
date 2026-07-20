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
import AdminCreateStudent from './pages/AdminCreateStudent'
import FullSchedule from './pages/FullSchedule'
import FacultyDashboard from './pages/FacultyDashboard'
import StudentsList from './pages/StudentsList'
import FacultyManagement from './pages/FacultyManagement'
import SimulatorManagement from './pages/SimulatorManagement'
import SubjectManagement from './pages/SubjectManagement'
import RouteManagement from './pages/RouteManagement'
import InstructorHoursReport from './pages/InstructorHoursReport'
import StageApprovals from './pages/StageApprovals'
import ProtectedRoute from './components/ProtectedRoute'
import FacultyRoute from './components/FacultyRoute'

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const { profile, loading: profileLoading } = useProfile(session)
  const navigate = useNavigate()

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

  useEffect(() => {
    if (!profileLoading && profile && profile.is_active === false) {
      supabase.auth.signOut().then(() => {
        navigate('/login?deactivated=1')
      })
    }
  }, [profile, profileLoading])

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
        <Route index element={<Home session={session} profile={profile} profileLoading={profileLoading} />} />
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
              <FacultyEvaluations session={session} profile={profile} />
            </FacultyRoute>
          }
        />
        <Route
          path="admin/stage-approvals"
          element={
            <FacultyRoute profile={profile} loading={profileLoading} roles={['admin']}>
              <StageApprovals session={session} />
            </FacultyRoute>
          }
        />
        <Route
          path="faculty/schedule"
          element={
            <FacultyRoute profile={profile} loading={profileLoading}>
              <FullSchedule profile={profile} />
            </FacultyRoute>
          }
        />
        <Route
          path="faculty/students"
          element={
            <FacultyRoute profile={profile} loading={profileLoading}>
              <StudentsList profile={profile} session={session} />
            </FacultyRoute>
          }
        />
        <Route
          path="admin/create-student"
          element={
            <FacultyRoute profile={profile} loading={profileLoading} roles={['admin']}>
              <AdminCreateStudent />
            </FacultyRoute>
          }
        />
        <Route
          path="admin/faculty"
          element={
            <FacultyRoute profile={profile} loading={profileLoading} roles={['admin']}>
              <FacultyManagement />
            </FacultyRoute>
          }
        />
        <Route
          path="admin/instructor-hours"
          element={
            <FacultyRoute profile={profile} loading={profileLoading} roles={['admin']}>
              <InstructorHoursReport />
            </FacultyRoute>
          }
        />
        <Route
          path="admin/simulators"
          element={
            <FacultyRoute profile={profile} loading={profileLoading} roles={['admin']}>
              <SimulatorManagement />
            </FacultyRoute>
          }
        />
        <Route
          path="admin/subjects"
          element={
            <FacultyRoute profile={profile} loading={profileLoading} roles={['admin']}>
              <SubjectManagement />
            </FacultyRoute>
          }
        />
        <Route
          path="admin/routes"
          element={
            <FacultyRoute profile={profile} loading={profileLoading} roles={['admin']}>
              <RouteManagement />
            </FacultyRoute>
          }
        />
      </Route>
    </Routes>
  )
}

function Home({ session, profile, profileLoading }) {
  if (profileLoading) return null
  const isFaculty = profile && ['faculty_personnel', 'admin'].includes(profile.role)
  return isFaculty ? <FacultyDashboard profile={profile} /> : <Dashboard session={session} />
}

function Shell({ profile }) {
  const navigate = useNavigate()
  const isFaculty = profile && ['faculty_personnel', 'admin'].includes(profile.role)
  const isAdmin = profile?.role === 'admin'

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
          {!isFaculty && (
            <>
              <Link to="/payments">Payments</Link>
              <Link to="/schedule">Schedule</Link>
            </>
          )}
          {isFaculty && (
            <>
              <div className="sidebar-divider">Faculty</div>
              <Link to="/faculty/payments">Verify payments</Link>
              <Link to="/faculty/evaluations">Evaluations</Link>
              <Link to="/faculty/schedule">Full schedule</Link>
              <Link to="/faculty/students">Students</Link>
            </>
          )}
          {isAdmin && (
            <>
              <div className="sidebar-divider">Admin</div>
              <Link to="/admin/stage-approvals">Stage approvals</Link>
              <Link to="/admin/create-student">Create student</Link>
              <Link to="/admin/faculty">Faculty</Link>
              <Link to="/admin/instructor-hours">Instructor hours</Link>
              <Link to="/admin/simulators">Simulators</Link>
              <Link to="/admin/subjects">Subjects</Link>
              <Link to="/admin/routes">Routes</Link>
            </>
          )}
          <button onClick={handleSignOut}>Sign out</button>
        </nav>
      </aside>
      <Outlet />
    </div>
  )
}
