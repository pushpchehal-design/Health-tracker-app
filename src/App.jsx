import { useState, useEffect } from 'react'
import { supabase, configMissing } from './lib/supabase'
import Auth from './components/Auth'
import ProfileSetup from './components/ProfileSetup'
import FamilyMemberSetup from './components/FamilyMemberSetup'
import Dashboard from './components/Dashboard'
import './App.css'

function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [userProfile, setUserProfile] = useState(null)
  const [profileLoading, setProfileLoading] = useState(true)
  const [showFamilySetup, setShowFamilySetup] = useState(false)
  const [familySetupComplete, setFamilySetupComplete] = useState(false)

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
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', userId)
        .single()

      if (error && error.code !== 'PGRST116') {
        console.error('Error loading profile:', error)
      } else {
        setUserProfile(data || null)
        // Check if user has any family members
        if (data) {
          checkFamilyMembers(userId)
        }
      }
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
      <div className="app" style={{ backgroundColor: '#242424', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="loading" style={{ color: '#fff', fontSize: '1.5rem' }}>Loading Health Tracker...</div>
      </div>
    )
  }

  // Show config missing (e.g. Vercel env vars not set) — avoids blank page
  if (configMissing) {
    return (
      <div className="app" style={{ backgroundColor: '#242424', minHeight: '100vh', padding: '2rem', color: '#fff', maxWidth: '560px' }}>
        <h1 style={{ color: '#f0ad4e' }}>Configuration missing</h1>
        <p style={{ marginBottom: '1rem' }}>Supabase URL and anon key are not set. The app cannot connect to the backend.</p>
        <p style={{ fontSize: '0.9rem', color: '#ccc', marginBottom: '0.5rem' }}>On <strong>Vercel</strong>:</p>
        <ul style={{ fontSize: '0.9rem', color: '#888', marginLeft: '1.25rem', marginBottom: '1rem' }}>
          <li>Project → <strong>Settings</strong> → <strong>Environment Variables</strong></li>
          <li>Add <code style={{ background: '#333', padding: '0.1rem 0.3rem' }}>VITE_SUPABASE_URL</code> (e.g. <code style={{ background: '#333', padding: '0.1rem 0.3rem' }}>https://xxxx.supabase.co</code>)</li>
          <li>Add <code style={{ background: '#333', padding: '0.1rem 0.3rem' }}>VITE_SUPABASE_ANON_KEY</code> (anon public key from Supabase → Settings → API)</li>
          <li>Redeploy: <strong>Deployments</strong> → ⋮ on latest → <strong>Redeploy</strong></li>
        </ul>
        <p style={{ fontSize: '0.9rem', color: '#888', marginBottom: '1rem' }}>Locally: add them to <code style={{ background: '#333', padding: '0.1rem 0.3rem' }}>.env</code> and run <code style={{ background: '#333', padding: '0.1rem 0.3rem' }}>npm run dev</code>.</p>
      </div>
    )
  }

  // Show error with visible text
  if (error) {
    return (
      <div className="app" style={{ backgroundColor: '#242424', minHeight: '100vh', padding: '2rem', color: '#fff', maxWidth: '560px' }}>
        <h1 style={{ color: '#ff4444' }}>Connection failed</h1>
        <p style={{ marginBottom: '1rem' }}>{error}</p>
        <p style={{ fontSize: '0.9rem', color: '#ccc', marginBottom: '0.5rem' }}>Quick checks:</p>
        <ul style={{ fontSize: '0.9rem', color: '#888', marginLeft: '1.25rem', marginBottom: '1rem' }}>
          <li><strong>.env</strong> has <code style={{ background: '#333', padding: '0.1rem 0.3rem' }}>VITE_SUPABASE_URL</code> and <code style={{ background: '#333', padding: '0.1rem 0.3rem' }}>VITE_SUPABASE_ANON_KEY</code></li>
          <li>URL looks like <code style={{ background: '#333', padding: '0.1rem 0.3rem' }}>https://xxxx.supabase.co</code></li>
          <li>Use the <strong>anon public</strong> key (long JWT starting with <code style={{ background: '#333', padding: '0.1rem 0.3rem' }}>eyJ</code>) from Supabase → Project Settings → API</li>
          <li>Free-tier project may be <strong>paused</strong> — open the Supabase dashboard and click “Restore project” if needed</li>
          <li>After editing .env, restart the app: <code style={{ background: '#333', padding: '0.1rem 0.3rem' }}>npm run dev</code></li>
        </ul>
        <button 
          onClick={() => window.location.reload()} 
          style={{ padding: '0.5rem 1rem', marginTop: '0.5rem', cursor: 'pointer' }}
        >
          Retry
        </button>
      </div>
    )
  }

  // Show auth if not logged in
  if (!user) {
    return <Auth />
  }

  // Step 2: Show profile setup if user doesn't have a profile
  if (!userProfile) {
    return <ProfileSetup userId={user.id} onComplete={handleProfileComplete} />
  }

  // Step 3: Show family member setup prompt if profile exists but no family members yet
  if (showFamilySetup && !familySetupComplete) {
    return <FamilyMemberSetup userId={user.id} onComplete={handleFamilySetupComplete} onSkip={handleSkipFamilySetup} />
  }

  // Step 4: Show main dashboard with all family members
  return (
    <div className="app">
      <header className="header">
        <h1>Health Tracker</h1>
        <div className="user-info">
          <span>{user.email}</span>
          <button onClick={handleLogout} className="logout-btn">
            Logout
          </button>
        </div>
      </header>
      <main className="main-content">
        <Dashboard userId={user.id} userProfile={userProfile} user={user} />
      </main>
    </div>
  )
}

export default App
