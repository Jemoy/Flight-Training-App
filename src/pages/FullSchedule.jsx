import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import Calendar from '../components/Calendar'

export default function FullSchedule() {
  const [calView, setCalView] = useState('week')
  const [calDate, setCalDate] = useState(new Date())
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    loadSchedule()
  }, [])

  async function loadSchedule() {
    setLoading(true)
    setError('')

    const { data, error } = await supabase
      .from('session_participants')
      .select(
        'student_id, profiles(full_name), sessions(id, scheduled_start, scheduled_end, status, stages(name))'
      )

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    // Group participants by session so a group session (e.g. Virtual Aerodrome)
    // shows all names on one event instead of stacking duplicate blocks.
    const bySession = {}
    for (const row of data ?? []) {
      const s = row.sessions
      if (!s || s.status === 'cancelled') continue
      if (!bySession[s.id]) {
        bySession[s.id] = {
          id: `session-${s.id}`,
          start: new Date(s.scheduled_start),
          end: new Date(s.scheduled_end),
          title: `${s.stages?.name ?? 'Session'}${s.status === 'pending' ? ' (pending)' : ''}`,
          names: [],
          type: 'admin',
        }
      }
      bySession[s.id].names.push(row.profiles?.full_name ?? 'Unknown')
    }

    const eventList = Object.values(bySession).map((e) => ({
      ...e,
      subtitle: e.names.join(', '),
    }))

    setEvents(eventList)
    setLoading(false)
  }

  return (
    <div className="main-content main-content-wide">
      <div className="page-heading">Full simulator schedule</div>
      <div className="page-subheading">
        Every booked session across all students, with names, so instructors can be
        assigned and conflicts spotted at a glance.
      </div>

      {error && <div className="auth-error">{error}</div>}
      {loading && <p className="loading-text">Loading…</p>}

      {!loading && (
        <Calendar
          view={calView}
          currentDate={calDate}
          onViewChange={setCalView}
          onDateChange={setCalDate}
          events={events}
        />
      )}
    </div>
  )
}
