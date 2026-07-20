import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

const ROLE_LABELS = {
  student: 'Student',
  faculty_personnel: 'Faculty',
  admin: 'Admin',
}

const INSTRUCTOR_ROLE_LABELS = {
  ground_instructor: 'Ground Instructor',
  fsi_rated: 'FSI Rated',
  flight_instructor: 'Flight Instructor',
  any: 'Any',
}

export default function Profile({ session }) {
  const [profileInfo, setProfileInfo] = useState(null)
  const [fullName, setFullName] = useState('')
  const [avatarUrl, setAvatarUrl] = useState(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [avatarError, setAvatarError] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [savingName, setSavingName] = useState(false)

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)

  useEffect(() => {
    loadProfile()
  }, [])

  async function loadProfile() {
    setLoading(true)
    const { data, error } = await supabase
      .from('profiles')
      .select('full_name, role, instructor_roles, student_number, pel_number, avatar_url')
      .eq('id', session.user.id)
      .single()

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    setProfileInfo(data)
    setFullName(data.full_name ?? '')
    setAvatarUrl(data.avatar_url ?? null)
    setLoading(false)
  }

  async function handleAvatarUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return

    setAvatarError('')
    if (!file.type.startsWith('image/')) {
      setAvatarError('Please choose an image file.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setAvatarError('Image must be under 5MB.')
      return
    }

    setUploadingAvatar(true)

    const ext = file.name.split('.').pop()
    const filePath = `${session.user.id}/avatar.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, file, { upsert: true })

    if (uploadError) {
      setAvatarError(uploadError.message)
      setUploadingAvatar(false)
      return
    }

    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath)
    // Cache-bust so the new image shows immediately even though the path is the same
    const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ avatar_url: publicUrl })
      .eq('id', session.user.id)

    if (updateError) {
      setAvatarError(updateError.message)
      setUploadingAvatar(false)
      return
    }

    setAvatarUrl(publicUrl)
    setUploadingAvatar(false)
  }

  async function handleSaveName(e) {
    e.preventDefault()
    setError('')
    setSuccessMsg('')
    if (!fullName.trim()) {
      setError('Name cannot be empty.')
      return
    }

    setSavingName(true)
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: fullName.trim() })
      .eq('id', session.user.id)

    if (error) {
      setError(error.message)
      setSavingName(false)
      return
    }

    setSuccessMsg('Name updated.')
    await loadProfile()
    setSavingName(false)
  }

  async function handleChangePassword(e) {
    e.preventDefault()
    setPasswordError('')
    setPasswordSuccess('')

    if (newPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match.')
      return
    }

    setSavingPassword(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })

    if (error) {
      setPasswordError(error.message)
      setSavingPassword(false)
      return
    }

    setPasswordSuccess('Password updated.')
    setNewPassword('')
    setConfirmPassword('')
    setSavingPassword(false)
  }

  return (
    <div className="main-content">
      <div className="page-heading">Profile</div>

      {loading && <p className="loading-text">Loading…</p>}

      {!loading && (
        <>
          <div className="avatar-section">
            <div className="avatar-preview">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Profile" />
              ) : (
                <span className="avatar-placeholder">
                  {(fullName || '?').trim().charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <div>
              <label className="btn-primary avatar-upload-btn">
                {uploadingAvatar ? 'Uploading…' : 'Change photo'}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarUpload}
                  disabled={uploadingAvatar}
                  style={{ display: 'none' }}
                />
              </label>
              {avatarError && <p className="auth-error" style={{ marginTop: 8 }}>{avatarError}</p>}
            </div>
          </div>

          <form onSubmit={handleSaveName} className="payment-form" style={{ maxWidth: 460, marginBottom: 28 }}>
            {error && <div className="auth-error">{error}</div>}
            {successMsg && <div className="auth-success">{successMsg}</div>}

            <div className="field">
              <label>Full name</label>
              <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </div>

            <div className="field">
              <label>Email</label>
              <input type="text" value={session.user.email ?? ''} disabled />
            </div>

            <div className="field">
              <label>Role</label>
              <input type="text" value={ROLE_LABELS[profileInfo?.role] ?? profileInfo?.role ?? '—'} disabled />
            </div>

            {profileInfo?.role === 'student' && (
              <>
                <div className="field">
                  <label>Student number</label>
                  <input type="text" value={profileInfo.student_number ?? '—'} disabled />
                </div>
                <div className="field">
                  <label>PEL number</label>
                  <input type="text" value={profileInfo.pel_number ?? '—'} disabled />
                </div>
                <p className="empty-text">Student number and PEL number are set by admin.</p>
              </>
            )}

            {profileInfo?.role === 'faculty_personnel' && (
              <div className="field">
                <label>Instructor qualifications</label>
                <input
                  type="text"
                  value={
                    (profileInfo.instructor_roles ?? [])
                      .map((r) => INSTRUCTOR_ROLE_LABELS[r] ?? r)
                      .join(', ') || '—'
                  }
                  disabled
                />
              </div>
            )}

            <button className="btn-primary" type="submit" disabled={savingName}>
              {savingName ? 'Saving…' : 'Save name'}
            </button>
          </form>

          <div className="section-divider" />

          <h3 className="section-title">Change password</h3>
          <form onSubmit={handleChangePassword} className="payment-form" style={{ maxWidth: 460 }}>
            {passwordError && <div className="auth-error">{passwordError}</div>}
            {passwordSuccess && <div className="auth-success">{passwordSuccess}</div>}

            <div className="field">
              <label>New password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label>Confirm new password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>

            <button className="btn-primary" type="submit" disabled={savingPassword}>
              {savingPassword ? 'Updating…' : 'Update password'}
            </button>
          </form>
        </>
      )}
    </div>
  )
}
