import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import './AdminDashboard.css'

function AdminDashboard({ onBack }) {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedUser, setSelectedUser] = useState(null)
  const [userDetail, setUserDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)

  useEffect(() => {
    loadUsers()
  }, [])

  const loadUsers = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) {
        setError('Not signed in')
        setLoading(false)
        return
      }
      const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
      const isDev = import.meta.env.DEV
      const url = isDev
        ? `${window.location.origin}/supabase-functions/functions/v1/admin-list-users`
        : `${supabaseUrl}/functions/v1/admin-list-users`
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY || '',
        },
      })
      const json = await res.json()
      if (res.ok) {
        setUsers(json.users || [])
        setLoading(false)
        return
      }
      // Fallback: load from user_profiles (admins can SELECT all via RLS) so Admin still works if Edge Function returns 401
      const { data: profiles, error: profilesError } = await supabase
        .from('user_profiles')
        .select('user_id, name, created_at')
        .order('created_at', { ascending: false })
      if (!profilesError && profiles?.length) {
        setUsers(profiles.map((p) => ({
          id: p.user_id,
          email: p.name || p.user_id?.slice(0, 8) || '—',
          created_at: p.created_at,
          last_sign_in_at: undefined,
        })))
        setError(null)
      } else {
        const msg = json?.error || res.statusText || 'Request failed'
        setError(`${msg} (${res.status})`)
      }
    } catch (err) {
      // Fallback on network error too
      const { data: profiles, error: profilesError } = await supabase
        .from('user_profiles')
        .select('user_id, name, created_at')
        .order('created_at', { ascending: false })
      if (!profilesError && profiles?.length) {
        setUsers(profiles.map((p) => ({
          id: p.user_id,
          email: p.name || p.user_id?.slice(0, 8) || '—',
          created_at: p.created_at,
          last_sign_in_at: undefined,
        })))
        setError(null)
      } else {
        setError(err.message || 'Failed to load users')
      }
    } finally {
      setLoading(false)
    }
  }

  const loadUserDetail = async (u) => {
    setSelectedUser(u)
    setDetailLoading(true)
    setUserDetail(null)
    try {
      const [profilesRes, membersRes, reportsRes] = await Promise.all([
        supabase.from('user_profiles').select('*').eq('user_id', u.id),
        supabase.from('family_members').select('*').eq('user_id', u.id).order('created_at', { ascending: false }),
        supabase.from('health_reports').select('id, report_name, report_type, uploaded_at, analysis_status').eq('user_id', u.id).order('uploaded_at', { ascending: false }).limit(50),
      ])
      setUserDetail({
        profile: profilesRes.data?.[0] ?? null,
        familyMembers: membersRes.data ?? [],
        reports: reportsRes.data ?? [],
      })
    } catch (err) {
      console.error('Error loading user detail:', err)
      setUserDetail({ error: err.message })
    } finally {
      setDetailLoading(false)
    }
  }

  const formatDate = (s) => {
    if (!s) return '—'
    try {
      return new Date(s).toLocaleString()
    } catch {
      return s
    }
  }

  if (loading) {
    return (
      <div className="admin-dashboard">
        <div className="admin-header">
          <button type="button" className="admin-back-btn" onClick={onBack}>← Back to app</button>
          <h1>Admin: All users</h1>
        </div>
        <p className="admin-loading">Loading users…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="admin-dashboard">
        <div className="admin-header">
          <button type="button" className="admin-back-btn" onClick={onBack}>← Back to app</button>
          <h1>Admin</h1>
        </div>
        <p className="admin-error">{error}</p>
        <p className="admin-hint" style={{ marginTop: '0.75rem', maxWidth: '420px' }}>
          If this is 401: add <strong>SUPABASE_ANON_KEY</strong> in Supabase → Project Settings → Edge Functions → Secrets (use your project’s anon public key), then redeploy <code>admin-list-users</code> and Retry.
        </p>
        <button type="button" onClick={loadUsers}>Retry</button>
      </div>
    )
  }

  return (
    <div className="admin-dashboard">
      <div className="admin-header">
        <button type="button" className="admin-back-btn" onClick={onBack}>← Back to app</button>
        <h1>Admin: All users ({users.length})</h1>
      </div>

      <div className="admin-layout">
        <div className="admin-user-list">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Created</th>
                <th>Last sign-in</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr
                  key={u.id}
                  className={selectedUser?.id === u.id ? 'selected' : ''}
                  onClick={() => loadUserDetail(u)}
                >
                  <td>{u.email || u.id.slice(0, 8)}</td>
                  <td>{formatDate(u.created_at)}</td>
                  <td>{formatDate(u.last_sign_in_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="admin-detail">
          {!selectedUser && <p className="admin-hint">Select a user to view data.</p>}
          {selectedUser && detailLoading && <p>Loading…</p>}
          {selectedUser && userDetail && !detailLoading && (
            <>
              <h2>{selectedUser.email || selectedUser.id}</h2>
              {userDetail.error && <p className="admin-error">{userDetail.error}</p>}
              {userDetail.profile && (
                <section className="admin-section">
                  <h3>Profile</h3>
                  <pre className="admin-json">{JSON.stringify(userDetail.profile, null, 2)}</pre>
                </section>
              )}
              {!userDetail.profile && !userDetail.error && <p>No profile yet.</p>}
              <section className="admin-section">
                <h3>Family members ({userDetail.familyMembers?.length ?? 0})</h3>
                {userDetail.familyMembers?.length > 0 ? (
                  <pre className="admin-json">{JSON.stringify(userDetail.familyMembers, null, 2)}</pre>
                ) : (
                  <p>None</p>
                )}
              </section>
              <section className="admin-section">
                <h3>Health reports ({userDetail.reports?.length ?? 0})</h3>
                {userDetail.reports?.length > 0 ? (
                  <pre className="admin-json">{JSON.stringify(userDetail.reports, null, 2)}</pre>
                ) : (
                  <p>None</p>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default AdminDashboard
