import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { emptyClassEntry, generateOccurrences, daysToPattern, formatTimeRange } from '../lib/classSchedule'
import { CURRENT_SEMESTER_START, CURRENT_SEMESTER_END } from '../lib/semester'

const PW_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'

export default function AdminCreateStudent() {
  const [fullName, setFullName] = useState('')
  const [studentNumber, setStudentNumber] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  const [semesterStart, setSemesterStart] = useState(CURRENT_SEMESTER_START)
  const [semesterEnd, setSemesterEnd] = useState(CURRENT_SEMESTER_END)
  const [classEntries, setClassEntries] = useState([emptyClassEntry()])
  const [offerings, setOfferings] = useState([])

  useEffect(() => {
    supabase
      .from('course_offerings')
      .select('*')
      .order('subject_code', { ascending: true })
      .then(({ data }) => setOfferings(data ?? []))
  }, [])

  function generatePassword() {
    let pw = ''
    for (let i = 0; i < 10; i++) pw += PW_CHARS[Math.floor(Math.random() * PW_CHARS.length)]
    setPassword(pw)
  }

  function applyOffering(id, offeringId) {
    const offering = offerings.find((o) => o.id === offeringId)
    setClassEntries((prev) =>
      prev.map((e) =>
        e.id === id
          ? offering
            ? {
                ...e,
                offeringId,
                className: `${offering.subject_code} - ${offering.subject_title}`,
                days: offering.days,
                startTime: offering.start_time,
                endTime: offering.end_time,
              }
            : { ...e, offeringId: '', className: '' }
          : e
      )
    )
  }

  function addEntry() {
    setClassEntries((prev) => [...prev, emptyClassEntry()])
  }

  function removeEntry(id) {
    setClassEntries((prev) => prev.filter((e) => e.id !== id))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSuccessMsg('')
    setSubmitting(true)

    const { data, error: invokeError } = await supabase.functions.invoke('create-student', {
      body: { full_name: fullName, student_number: studentNumber, email, password },
    })

    if (invokeError) {
      setError(invokeError.message)
      setSubmitting(false)
      return
    }
    if (data?.error) {
      setError(data.error)
      setSubmitting(false)
      return
    }

    const newStudentId = data.user_id

    // Build class_schedule rows for every filled-in class, across the whole semester
    const validEntries = classEntries.filter((c) => c.className.trim())
    let scheduleRows = []
    for (const entry of validEntries) {
      const occurrences = generateOccurrences(entry, semesterStart, semesterEnd)
      scheduleRows = scheduleRows.concat(
        occurrences.map((o) => ({ ...o, student_id: newStudentId }))
      )
    }

    let scheduleWarning = ''
    if (scheduleRows.length > 0) {
      const { error: scheduleError } = await supabase.from('class_schedule').insert(scheduleRows)
      if (scheduleError) {
        scheduleWarning = ` Account created, but the class schedule could not be saved: ${scheduleError.message}`
      }
    }

    setSuccessMsg(
      `Account created for ${fullName}. Email: ${email} · Password: ${password} — share these with the student directly, they aren't shown again.` +
        (scheduleRows.length > 0 && !scheduleWarning
          ? ` ${scheduleRows.length} class session(s) added to their weekly schedule through ${semesterEnd}.`
          : scheduleWarning)
    )
    setFullName('')
    setStudentNumber('')
    setEmail('')
    setPassword('')
    setClassEntries([emptyClassEntry()])
    setSubmitting(false)
  }

  return (
    <div className="main-content main-content-wide">
      <div className="page-heading">Create student account</div>
      <div className="page-subheading">
        Creates the login and profile in one step, plus their recurring weekly class
        schedule for conflict-checking against simulator bookings.
      </div>

      {error && <div className="auth-error">{error}</div>}
      {successMsg && <div className="auth-success">{successMsg}</div>}

      <div className="create-student-layout">
        <form onSubmit={handleSubmit} className="payment-form">
          <div className="field">
            <label htmlFor="fullName">Full name</label>
            <input id="fullName" type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="studentNumber">Student ID number</label>
            <input
              id="studentNumber"
              type="text"
              value={studentNumber}
              onChange={(e) => setStudentNumber(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="password">Temporary password</label>
            <input
              id="password"
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
            <button type="button" className="link-btn generate-pw-btn" onClick={generatePassword}>
              Generate random password
            </button>
          </div>
          <button className="btn-primary" type="submit" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create account'}
          </button>
        </form>

        <div className="class-schedule-builder">
          <div className="class-schedule-title">Class schedule</div>
          <p className="empty-text" style={{ marginBottom: 14 }}>
            Recurs weekly on the selected day, for the full date range below.
          </p>

          <div className="backfill-form-row" style={{ marginBottom: 16 }}>
            <div className="field">
              <label htmlFor="semStart">Semester start</label>
              <input id="semStart" type="date" value={semesterStart} onChange={(e) => setSemesterStart(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="semEnd">Semester end</label>
              <input id="semEnd" type="date" value={semesterEnd} onChange={(e) => setSemesterEnd(e.target.value)} />
            </div>
          </div>

          {classEntries.map((entry) => (
            <div className="class-entry-card" key={entry.id}>
              <select
                value={entry.offeringId ?? ''}
                onChange={(e) => applyOffering(entry.id, e.target.value)}
                className="inline-select"
                style={{ marginBottom: 6, width: '100%' }}
              >
                <option value="">Select a subject…</option>
                {offerings.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.subject_code} - {o.subject_title} ({o.section || o.year_level || 'Section n/a'}) ·{' '}
                    {daysToPattern(o.days)} {formatTimeRange(o.start_time, o.end_time)}
                  </option>
                ))}
              </select>
              {entry.className ? (
                <div className="class-entry-summary-row">
                  <p className="empty-text" style={{ margin: 0 }}>
                    {entry.className} · {daysToPattern(entry.days)} · {formatTimeRange(entry.startTime, entry.endTime)}
                  </p>
                  <button type="button" className="link-btn" onClick={() => removeEntry(entry.id)}>
                    Remove
                  </button>
                </div>
              ) : (
                <div className="class-entry-summary-row">
                  <p className="empty-text" style={{ margin: 0 }}>
                    Days and time come from the Subjects catalog.
                  </p>
                  <button type="button" className="link-btn" onClick={() => removeEntry(entry.id)}>
                    Remove
                  </button>
                </div>
              )}
            </div>
          ))}

          <button type="button" className="add-schedule-btn" onClick={addEntry}>
            + Add another schedule
          </button>
        </div>
      </div>
    </div>
  )
}
