import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { isAuthConfigured, supabase } from '../lib/supabase'

const AuthContext = createContext(null)

// Where Supabase sends people back after an email link or Google sign-in.
function redirectUrl() {
  return `${window.location.origin}/`
}

function friendlyError(error) {
  const msg = error?.message || String(error || '')
  if (/invalid login credentials/i.test(msg)) return 'Wrong email or password.'
  if (/email not confirmed/i.test(msg)) return 'Check your inbox to confirm your email first.'
  if (/user already registered/i.test(msg)) return 'An account with that email already exists. Try signing in.'
  if (/password should be at least/i.test(msg)) return 'Password must be at least 6 characters.'
  if (/rate limit|too many/i.test(msg)) return 'Too many attempts. Wait a minute and try again.'
  if (/provider is not enabled/i.test(msg)) return 'Google sign-in isn’t set up yet.'
  return msg || 'Something went wrong. Please try again.'
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [ready, setReady] = useState(!isAuthConfigured)
  // modal: null | { reason?: string, recovery?: boolean }
  // recovery is set after the user follows a password-reset email link.
  const [modal, setModal] = useState(null)

  useEffect(() => {
    if (!supabase) return
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session ?? null)
      setReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next ?? null)
      if (event === 'PASSWORD_RECOVERY') setModal({ recovery: true })
      else if (event === 'SIGNED_IN') setModal((m) => (m?.recovery ? m : null))
    })
    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const run = useCallback(async (fn) => {
    try {
      const { error, data } = await fn()
      if (error) return { error: friendlyError(error) }
      return { data }
    } catch (e) {
      return { error: friendlyError(e) }
    }
  }, [])

  const api = useMemo(
    () => ({
      configured: isAuthConfigured,
      ready,
      session,
      user: session?.user ?? null,
      recovering: !!modal?.recovery,
      modal,
      openLogin: (reason) => setModal({ reason }),
      closeLogin: () => setModal(null),
      signIn: (email, password) => run(() => supabase.auth.signInWithPassword({ email, password })),
      signUp: (email, password) =>
        run(() => supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirectUrl() } })),
      sendMagicLink: (email) =>
        run(() => supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectUrl() } })),
      signInWithGoogle: () =>
        run(() => supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirectUrl() } })),
      resetPassword: (email) => run(() => supabase.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl() })),
      updatePassword: async (password) => {
        const res = await run(() => supabase.auth.updateUser({ password }))
        if (!res.error) setModal(null)
        return res
      },
      signOut: () => run(() => supabase.auth.signOut()),
    }),
    [ready, session, modal, run],
  )

  return <AuthContext.Provider value={api}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
