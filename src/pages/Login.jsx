import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'

export default function Login() {
  const [mode, setMode] = useState('sign_in') // 'sign_in' | 'sign_up'
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const wasDeactivated = searchParams.get('deactivated') === '1'

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    if (mode === 'sign_in') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setError(error.message)
      } else {
        navigate('/')
      }
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) {
        setError(error.message)
      } else if (data.user) {
        // Create the matching profiles row (role defaults to 'student')
        await supabase.from('profiles').insert({
          id: data.user.id,
          full_name: fullName,
          role: 'student',
        })
        navigate('/')
      }
    }
    setSubmitting(false)
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-title">Flight Training Portal</div>
        <div className="auth-sub">
          {mode === 'sign_in' ? 'Sign in to view your training progress.' : 'Create your student account.'}
        </div>

        {error && <div className="auth-error">{error}</div>}
        {wasDeactivated && (
          <div className="auth-error">
            This account has been deactivated. Contact your school administrator if you
            believe this is a mistake.
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {mode === 'sign_up' && (
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
          )}
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
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>
          <button className="btn-primary" type="submit" disabled={submitting}>
            {submitting ? 'Please wait…' : mode === 'sign_in' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <div className="auth-toggle">
          {mode === 'sign_in' ? (
            <>
              New here?{' '}
              <button type="button" onClick={() => setMode('sign_up')}>
                Create an account
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button type="button" onClick={() => setMode('sign_in')}>
                Sign in
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
