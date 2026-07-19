import { useState } from 'react'
import { supabase } from '../supabaseClient'

const PW_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'

export default function AdminCreateStudent() {
  const [fullName, setFullName] = useState('')
  const [studentNumber, setStudentNumber] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  function generatePassword() {
    let pw = ''
    for (let i = 0; i < 10; i++) pw += PW_CHARS[Math.floor(Math.random() * PW_CHARS.length)]
    setPassword(pw)
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
    } else if (data?.error) {
      setError(data.error)
    } else {
      setSuccessMsg(
        `Account created for ${fullName}. Email: ${email} · Password: ${password} — share these with the student directly, they aren't shown again.`
      )
      setFullName('')
      setStudentNumber('')
      setEmail('')
      setPassword('')
    }
    setSubmitting(false)
  }

  return (
    <div className="main-content">
      <div className="page-heading">Create student account</div>
      <div className="page-subheading">
        Creates the login and profile in one step. The student can sign in immediately
        with the email and password shown after creation.
      </div>

      {error && <div className="auth-error">{error}</div>}
      {successMsg && <div className="auth-success">{successMsg}</div>}

      <form onSubmit={handleSubmit} className="payment-form">
        <div className="field">
          <label htmlFor="fullName">Full name</label>
          <input
            id="fullName"
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
          />
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
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
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
    </div>
  )
}
