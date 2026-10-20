// Client-side auth helpers.
//
// IMPORTANT: localStorage 'lecka_user_id' holds the SESSION TOKEN, not the
// user's UUID. The key name is kept so the existing call sites that send
// `Authorization: Bearer ${localStorage.getItem('lecka_user_id')}` keep working
// unchanged. Never compare it to a plan's user_id.

export const AUTH_TOKEN_KEY = 'lecka_user_id'
export const AUTH_EMAIL_KEY = 'lecka_user_email'

export function getAuthToken() {
  try { return localStorage.getItem(AUTH_TOKEN_KEY) } catch { return null }
}

export function clearLocalAuth() {
  try {
    localStorage.removeItem(AUTH_TOKEN_KEY)
    localStorage.removeItem(AUTH_EMAIL_KEY)
  } catch {}
}

/** Revoke the session server-side (best effort), clear the browser, go home. */
export async function logout() {
  const token = getAuthToken()
  if (token) {
    try {
      await fetch('/api/auth/me', {
        method:  'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
    } catch {}
  }
  clearLocalAuth()
  window.location.replace('/')
}

/**
 * Called once on app load. If the stored session is rejected (401 — expired,
 * revoked, or a pre-sessions UUID), clear it and reload so the UI shows the
 * logged-out state. Network errors and 5xx are ignored (never log out on an outage).
 * Skipped on /auth/* pages so it can't race with VerifyPage writing a new token.
 */
export async function validateSession() {
  if (window.location.pathname.startsWith('/auth/')) return
  const token = getAuthToken()
  if (!token) return
  try {
    const res = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
    if (res.status === 401 && getAuthToken() === token) {
      clearLocalAuth()
      window.location.reload()
    }
  } catch {}
}
