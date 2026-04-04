import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { getAuthRedirectBaseUrl } from '../lib/appOrigin'
import ThemePicker from './ThemePicker'
import './Auth.css'

// Razorpay verification: when user enters this as "email", sign in with the real Supabase user below
const TEMP_ACCESS_LOGIN = 'Temp_Access'
const TEMP_ACCESS_REAL_EMAIL = 'temp_razorpay@razorpay-verification.in'

function Auth() {
  const [isSignUp, setIsSignUp] = useState(false)
  const [showForgotPassword, setShowForgotPassword] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const handleForgotPassword = async (e) => {
    e.preventDefault()
    if (!email?.trim()) {
      setError('Enter your email address.')
      return
    }
    setLoading(true)
    setError('')
    setSuccessMessage('')
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: getAuthRedirectBaseUrl(),
      })
      if (error) throw error
      setSuccessMessage('Check your email for the password reset link.')
      setShowForgotPassword(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccessMessage('')

    try {
      if (isSignUp) {
        if (password !== confirmPassword) {
          throw new Error('Passwords do not match.')
        }
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: getAuthRedirectBaseUrl(),
          },
        })
        if (error) throw error
        setSuccessMessage('Check your email for the confirmation link!')
      } else {
        const loginId = (email || '').trim()
        const isTempAccess = loginId.toLowerCase() === TEMP_ACCESS_LOGIN.toLowerCase()
        const signInEmail = isTempAccess ? TEMP_ACCESS_REAL_EMAIL : loginId
        const { error } = await supabase.auth.signInWithPassword({
          email: signInEmail,
          password,
        })
        if (error) throw error
      }
    } catch (error) {
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }

  if (showForgotPassword) {
    return (
      <div className="auth-container">
        <div className="auth-theme-row">
          <ThemePicker />
        </div>
        <div className="auth-card">
          <h1>Health Tracker</h1>
          <h2>Forgot password</h2>
          <p className="auth-hint">Enter your registered email. We&apos;ll send you a link to reset your password.</p>
          {error && <div className="error-message">{error}</div>}
          {successMessage && <div className="success-message">{successMessage}</div>}
          <form onSubmit={handleForgotPassword} className="auth-form" noValidate>
            <div className="form-group">
              <label htmlFor="forgot-email">Email</label>
              <input
                type="email"
                id="forgot-email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
              />
            </div>
            <button type="submit" className="auth-btn" disabled={loading}>
              {loading ? 'Sending...' : 'Send reset link'}
            </button>
          </form>
          <p className="auth-switch">
            <button
              type="button"
              onClick={() => { setShowForgotPassword(false); setError(''); setSuccessMessage(''); }}
              className="link-btn"
            >
              ← Back to Sign In
            </button>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-container">
      <div className="auth-theme-row">
        <ThemePicker />
      </div>
      <div className="auth-card">
        <h1>Health Tracker</h1>
        <h2>{isSignUp ? 'Sign Up' : 'Sign In'}</h2>
        
        {error && <div className="error-message">{error}</div>}
        {successMessage && <div className="success-message">{successMessage}</div>}
        
        <form onSubmit={handleSubmit} className="auth-form" noValidate>
          <div className="form-group">
            <label htmlFor="email">Email or login</label>
            <input
              type="text"
              id="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com or Temp_Access"
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              required
              minLength={6}
            />
          </div>
          {isSignUp && (
            <div className="form-group">
              <label htmlFor="confirm-password">Confirm password</label>
              <input
                type="password"
                id="confirm-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter password"
                required={isSignUp}
                minLength={6}
              />
            </div>
          )}
          <button type="submit" className="auth-btn" disabled={loading}>
            {loading ? 'Loading...' : isSignUp ? 'Sign Up' : 'Sign In'}
          </button>
        </form>
        
        {!isSignUp && (
          <p className="auth-forgot">
            <button
              type="button"
              onClick={() => { setShowForgotPassword(true); setError(''); setSuccessMessage(''); }}
              className="link-btn"
            >
              Forgot password?
            </button>
          </p>
        )}
        <p className="auth-switch">
          {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
          <button
            type="button"
            onClick={() => { setIsSignUp(!isSignUp); setConfirmPassword(''); setError(''); setSuccessMessage(''); }}
            className="link-btn"
          >
            {isSignUp ? 'Sign In' : 'Sign Up'}
          </button>
        </p>
      </div>
    </div>
  )
}

export default Auth