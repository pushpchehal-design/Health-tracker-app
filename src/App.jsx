import { useState, useEffect } from 'react'
import { supabase, configMissing } from './lib/supabase'
import Auth from './components/Auth'
import ProfileSetup from './components/ProfileSetup'
import FamilyMemberSetup from './components/FamilyMemberSetup'
import Dashboard from './components/Dashboard'
import AdminDashboard from './components/AdminDashboard'
import './App.css'
import ThemePicker from './components/ThemePicker'

function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [userProfile, setUserProfile] = useState(null)
  const [profileLoading, setProfileLoading] = useState(true)
  const [showFamilySetup, setShowFamilySetup] = useState(false)
  const [familySetupComplete, setFamilySetupComplete] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [showAdminView, setShowAdminView] = useState(false)

  useEffect(() => {
    if (configMissing) {
      setLoading(false)
      return
    }
    console.log('App mounted, checking Supabase connection...')
    
    // Add a timeout to prevent infinite loading
    const timeout = setTimeout(() => {
      if (loading) {
        console.error('Supabase connection timeout')
        setError('Connection timeout - check your Supabase configuration')
        setLoading(false)
      }
    }, 5000)

    // Check if user is logged in
    supabase?.auth.getSession()
      .then(({ data: { session }, error }) => {
        clearTimeout(timeout)
        console.log('Session check complete:', { session: !!session, error })
        if (error) {
          console.error('Session error:', error)
          setError(error.message)
        } else {
          setUser(session?.user ?? null)
          if (session?.user) {
            loadUserProfile(session.user.id)
          } else {
            setProfileLoading(false)
          }
        }
        setLoading(false)
      })
      .catch((err) => {
        clearTimeout(timeout)
        console.error('Error getting session:', err)
        setError(err.message || 'Failed to connect to Supabase')
        setLoading(false)
        setProfileLoading(false)
      })

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase?.auth.onAuthStateChange((_event, session) => {
      console.log('Auth state changed:', { user: !!session?.user })
      setUser(session?.user ?? null)
      if (session?.user) {
        loadUserProfile(session.user.id)
      } else {
        setUserProfile(null)
        setProfileLoading(false)
        setShowFamilySetup(false)
        setFamilySetupComplete(false)
      }
    })

    return () => {
      clearTimeout(timeout)
      subscription?.unsubscribe()
    }
  }, [])

  const loadUserProfile = async (userId) => {
    try {
      const [profileRes, adminRes] = await Promise.all([
        supabase.from('user_profiles').select('*').eq('user_id', userId).single(),
        supabase.from('admin_users').select('user_id').eq('user_id', userId).maybeSingle(),
      ])
      const { data, error } = profileRes
      if (error && error.code !== 'PGRST116') {
        console.error('Error loading profile:', error)
      } else {
        setUserProfile(data || null)
        if (data) checkFamilyMembers(userId)
      }
      const admin = !!adminRes.data
      setIsAdmin(admin)
      if (!admin) setShowAdminView(false)
      else if (!profileRes.data) setShowAdminView(true) // admin with no profile: open Admin view by default
    } catch (err) {
      console.error('Error loading user profile:', err)
    } finally {
      setProfileLoading(false)
    }
  }

  const checkFamilyMembers = async (userId) => {
    try {
      const { data, error } = await supabase
        .from('family_members')
        .select('id')
        .eq('user_id', userId)
        .limit(1)

      if (!error && data && data.length > 0) {
        // User has family members, skip the setup
        setFamilySetupComplete(true)
      } else {
        // User doesn't have family members, show the prompt
        setShowFamilySetup(true)
      }
    } catch (err) {
      console.error('Error checking family members:', err)
    }
  }

  const handleProfileComplete = () => {
    if (user) {
      loadUserProfile(user.id)
    }
  }

  const handleFamilySetupComplete = () => {
    setShowFamilySetup(false)
    setFamilySetupComplete(true)
  }

  const handleSkipFamilySetup = () => {
    setShowFamilySetup(false)
    setFamilySetupComplete(true)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setUserProfile(null)
    setShowFamilySetup(false)
    setFamilySetupComplete(false)
  }

  // Show loading with visible text
  if (loading || profileLoading) {
    return (
      <div className="app app-shell-loading">
        <div className="loading">Loading Health Tracker...</div>
      </div>
    )
  }

  // Show config missing (e.g. Vercel env vars not set) — avoids blank page
  if (configMissing) {
    return (
      <div className="app app-shell-config">
        <h1>Configuration missing</h1>
        <p style={{ marginBottom: '1rem' }}>Supabase URL and anon key are not set. The app cannot connect to the backend.</p>
        <p className="app-shell-muted" style={{ marginBottom: '0.5rem' }}>On <strong>Vercel</strong>:</p>
        <ul className="app-shell-list">
          <li>Project → <strong>Settings</strong> → <strong>Environment Variables</strong></li>
          <li>Add <code className="app-shell-code">VITE_SUPABASE_URL</code> (e.g. <code className="app-shell-code">https://xxxx.supabase.co</code>)</li>
          <li>Add <code className="app-shell-code">VITE_SUPABASE_ANON_KEY</code> (anon public key from Supabase → Settings → API)</li>
          <li>Add <code className="app-shell-code">VITE_APP_URL</code> to your live site (e.g. <code className="app-shell-code">https://your-app.vercel.app</code>) so email confirmation links do not point at localhost</li>
          <li>In Supabase → <strong>Authentication</strong> → <strong>URL Configuration</strong>: set <strong>Site URL</strong> to the same live URL and add it under <strong>Redirect URLs</strong></li>
          <li>Redeploy: <strong>Deployments</strong> → ⋮ on latest → <strong>Redeploy</strong></li>
        </ul>
        <p className="app-shell-list" style={{ marginBottom: '1rem' }}>Locally: add them to <code className="app-shell-code">.env</code> and run <code className="app-shell-code">npm run dev</code>.</p>
      </div>
    )
  }

  // Show error with visible text
  if (error) {
    return (
      <div className="app app-shell-error">
        <h1>Connection failed</h1>
        <p style={{ marginBottom: '1rem' }}>{error}</p>
        <p className="app-shell-muted" style={{ marginBottom: '0.5rem' }}>Quick checks:</p>
        <ul className="app-shell-list">
          <li><strong>.env</strong> has <code className="app-shell-code">VITE_SUPABASE_URL</code> and <code className="app-shell-code">VITE_SUPABASE_ANON_KEY</code></li>
          <li>URL looks like <code className="app-shell-code">https://xxxx.supabase.co</code></li>
          <li>Use the <strong>anon public</strong> key (long JWT starting with <code className="app-shell-code">eyJ</code>) from Supabase → Project Settings → API</li>
          <li>Free-tier project may be <strong>paused</strong> — open the Supabase dashboard and click “Restore project” if needed</li>
          <li>After editing .env, restart the app: <code className="app-shell-code">npm run dev</code></li>
        </ul>
        <button type="button" onClick={() => window.location.reload()} style={{ padding: '0.5rem 1rem', marginTop: '0.5rem', cursor: 'pointer' }}>
          Retry
        </button>
      </div>
    )
  }

  // Show auth if not logged in
  if (!user) {
    return <Auth />
  }

  // Admins skip profile and family setup — go straight to app (Admin view by default if no profile)
  const isAdminNoProfile = isAdmin && !userProfile
  if (!isAdmin) {
    // Step 2: Show profile setup if user doesn't have a profile
    if (!userProfile) {
      return <ProfileSetup userId={user.id} onComplete={handleProfileComplete} />
    }
    // Step 3: Show family member setup prompt if profile exists but no family members yet
    if (showFamilySetup && !familySetupComplete) {
      return <FamilyMemberSetup userId={user.id} onComplete={handleFamilySetupComplete} onSkip={handleSkipFamilySetup} />
    }
  }

  // Admin view only when explicitly opened (Back button sets showAdminView false)
  if (isAdmin && showAdminView) {
    return (
      <AdminDashboard onBack={() => setShowAdminView(false)} />
    )
  }

  // Step 4: Show main dashboard with all family members (or minimal dashboard for admin with profile)
  return (
    <div className="app">
      <header className="header">
        <div className="header-main">
          <h1>Health Tracker</h1>
          <ThemePicker className="theme-picker--inline-header" />
        </div>
        <div className="user-info">
          {isAdmin && (
            <button
              type="button"
              onClick={() => setShowAdminView(true)}
              className="admin-link-btn"
              style={{ marginRight: '0.75rem' }}
            >
              Admin
            </button>
          )}
          <span>{user.email}</span>
          <button onClick={handleLogout} className="logout-btn">
            Logout
          </button>
        </div>
      </header>
      <main className="main-content">
        <Dashboard userId={user.id} userProfile={userProfile || null} user={user} />
      </main>
    </div>
  )
}

export default App
