/**
 * Base URL for Supabase auth redirects (email confirm, password reset).
 * Set VITE_APP_URL in production (e.g. https://your-app.vercel.app) so links
 * in email work on any device. If unset, uses the current browser origin (fine for local dev).
 */
export function getAuthRedirectBaseUrl() {
  const raw = (import.meta.env.VITE_APP_URL || '').trim()
  if (raw) {
    try {
      const normalized = raw.replace(/\/+$/, '')
      const u = new URL(normalized.startsWith('http') ? normalized : `https://${normalized}`)
      return `${u.origin}/`
    } catch {
      console.warn('[auth] VITE_APP_URL is invalid; using window.location.origin')
    }
  }
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/`
  }
  return '/'
}
