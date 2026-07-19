import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'

export default function FacultyDashboard({ profile }) {
  const [stats, setStats] = useState({
    pendingPayments: 0,
    pendingEvaluations: 0,
    sessionsToday: 0,
    totalStudents: 0,
  })
  const [loading, setLoading] = useState(true)
  const isAdmin = profile?.role === 'admin'

  useEffect(() => {
    loadStats()
  }, [])

  async function loadStats() {
    setLoading(true)

    const { count: pendingPayments } = await supabase
      .from('payments')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')

    const { count: totalStudents } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'student')

    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const todayEnd = new Date()
    todayEnd.setHours(23, 59, 59, 999)

    const { count: sessionsToday } = await supabase
      .from('sessions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'scheduled')
      .gte('scheduled_start', todayStart.toISOString())
      .lte('scheduled_start', todayEnd.toISOString())

    const { data: participants } = await supabase
      .from('session_participants')
      .select('session_id, student_id, sessions(status)')

    const { data: evaluations } = await supabase.from('evaluations').select('session_id, student_id')

    const evaluatedKeys = new Set((evaluations ?? []).map((e) => `${e.session_id}_${e.student_id}`))
    const pendingEvaluations = (participants ?? []).filter(
      (p) => p.sessions?.status !== 'pending' && !evaluatedKeys.has(`${p.session_id}_${p.student_id}`)
    ).length

    setStats({
      pendingPayments: pendingPayments ?? 0,
      pendingEvaluations,
      sessionsToday: sessionsToday ?? 0,
      totalStudents: totalStudents ?? 0,
    })
    setLoading(false)
  }

  return (
    <div className="main-content main-content-wide">
      <div className="page-heading">
        {isAdmin ? 'Admin dashboard' : 'Faculty dashboard'}
      </div>
      <div className="page-subheading">
        {profile?.full_name ? `Welcome back, ${profile.full_name}.` : 'Welcome back.'} Here's
        what needs attention.
      </div>

      <div className="stat-grid">
        <StatCard label="Pending payments" value={stats.pendingPayments} loading={loading} />
        <StatCard label="Pending evaluations" value={stats.pendingEvaluations} loading={loading} />
        <StatCard label="Sessions today" value={stats.sessionsToday} loading={loading} />
        <StatCard label="Total students" value={stats.totalStudents} loading={loading} />
      </div>

      <h3 className="section-title" style={{ marginTop: 32 }}>
        Quick actions
      </h3>
      <div className="quick-links">
        <Link to="/faculty/payments" className="quick-link">
          <div className="quick-link-title">Verify payments</div>
          <div className="quick-link-desc">Review receipts and approve schedule requests</div>
        </Link>
        <Link to="/faculty/evaluations" className="quick-link">
          <div className="quick-link-title">Evaluations</div>
          <div className="quick-link-desc">Pass/fail students on completed sessions</div>
        </Link>
        <Link to="/faculty/schedule" className="quick-link">
          <div className="quick-link-title">Full schedule</div>
          <div className="quick-link-desc">See every booked session with student names</div>
        </Link>
        {isAdmin && (
          <Link to="/admin/create-student" className="quick-link">
            <div className="quick-link-title">Create student</div>
            <div className="quick-link-desc">Set up a new student login and profile</div>
          </Link>
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value, loading }) {
  return (
    <div className="stat-card">
      <div className="stat-value">{loading ? '—' : value}</div>
      <div className="stat-label">{label}</div>
    </div>
  )
}
