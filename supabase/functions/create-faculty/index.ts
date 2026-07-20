// Supabase Edge Function: create-faculty
// Lets an authenticated ADMIN create a faculty login + profile in one call,
// without ever exposing the service role key to the browser.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (req.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405)
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return json({ error: 'Missing authorization header' }, 401)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: userData, error: userError } = await callerClient.auth.getUser()
    if (userError || !userData?.user) {
      return json({ error: 'Invalid session' }, 401)
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    const { data: callerProfile, error: profileError } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', userData.user.id)
      .single()

    if (profileError || callerProfile?.role !== 'admin') {
      return json({ error: 'Only admins can create faculty accounts' }, 403)
    }

    const { full_name, email, password, instructor_roles } = await req.json()
    if (!full_name || !email || !password) {
      return json({ error: 'full_name, email, and password are required' }, 400)
    }
    if (password.length < 6) {
      return json({ error: 'Password must be at least 6 characters' }, 400)
    }

    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (createError) {
      return json({ error: createError.message }, 400)
    }

    const { error: insertError } = await adminClient.from('profiles').insert({
      id: newUser.user.id,
      full_name,
      role: 'faculty_personnel',
      instructor_roles: instructor_roles ?? [],
    })

    if (insertError) {
      await adminClient.auth.admin.deleteUser(newUser.user.id)
      return json({ error: insertError.message }, 400)
    }

    return json({ success: true, user_id: newUser.user.id }, 200)
  } catch (err) {
    return json({ error: err.message ?? 'Unexpected error' }, 500)
  }
})

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
