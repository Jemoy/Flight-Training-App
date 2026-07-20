import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

export function useProfile(session) {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!session) {
      setProfile(null)
      setLoading(false)
      return
    }

    supabase
      .from('profiles')
      .select('id, full_name, role, is_active, avatar_url')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => {
        setProfile(data ?? null)
        setLoading(false)
      })
  }, [session])

  return { profile, loading }
}
