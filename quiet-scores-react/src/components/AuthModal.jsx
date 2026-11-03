import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../hooks/useAuth'

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  )
}

export function AuthModal() {
  const auth = useAuth()
  const { modal, recovering } = auth
  const [mode, setMode] = useState('signin') // signin | signup | reset
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const dialogRef = useRef(null)

  useEffect(() => {
    if (!modal) return
    const onKey = (e) => e.key === 'Escape' && auth.closeLogin()
    window.addEventListener('keydown', onKey)
    dialogRef.current?.querySelector('input')?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [modal, auth])

  if (!modal) return null

  const reset = (next) => {
    setMode(next)
    setError(null)
    setNotice(null)
  }

  const submit = async (action) => {
    setBusy(true)
    setError(null)
    setNotice(null)
    const res = await action()
    setBusy(false)
    if (res?.error) setError(res.error)
    return res
  }

  const onSubmit = async (e) => {
    e.preventDefault()
    if (recovering) {
      const res = await submit(() => auth.updatePassword(password))
      if (!res.error) setNotice('Password updated. You’re signed in.')
      return
    }
    if (mode === 'reset') {
      const res = await submit(() => auth.resetPassword(email))
      if (!res.error) setNotice('Check your email for a link to reset your password.')
      return
    }
    if (mode === 'signup') {
      const res = await submit(() => auth.signUp(email, password))
      // With email confirmation on, Supabase returns no session until confirmed.
      if (!res.error && !res.data?.session) setNotice('Almost done: check your email to confirm your account.')
      return
    }
    await submit(() => auth.signIn(email, password))
  }

  const onMagicLink = async () => {
    if (!email) {
      setError('Enter your email first.')
      return
    }
    const res = await submit(() => auth.sendMagicLink(email))
    if (!res.error) setNotice(`We sent a sign-in link to ${email}.`)
  }

  const title = recovering
    ? 'Set a new password'
    : mode === 'signup'
      ? 'Create your account'
      : mode === 'reset'
        ? 'Reset your password'
        : 'Sign in'

  return (
    <div className="auth-backdrop" onMouseDown={(e) => e.target === e.currentTarget && auth.closeLogin()}>
      <div className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title" ref={dialogRef}>
        <button className="auth-close" onClick={auth.closeLogin} aria-label="Close">×</button>
        <h2 id="auth-title">{title}</h2>
        {modal.reason && !recovering && <p className="auth-reason">{modal.reason}</p>}

        {!recovering && mode !== 'reset' && (
          <>
            <button type="button" className="auth-google" onClick={() => submit(auth.signInWithGoogle)} disabled={busy}>
              <GoogleMark /> Continue with Google
            </button>
            <div className="auth-divider"><span>or</span></div>
          </>
        )}

        <form onSubmit={onSubmit} className="auth-form">
          {!recovering && (
            <label>
              <span>Email</span>
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
          )}
          {mode !== 'reset' && (
            <label>
              <span>{recovering ? 'New password' : 'Password'}</span>
              <input
                type="password"
                autoComplete={mode === 'signup' || recovering ? 'new-password' : 'current-password'}
                required
                minLength={mode === 'signup' || recovering ? 6 : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
          )}

          {error && <div className="auth-error" role="alert">{error}</div>}
          {notice && <div className="auth-notice" role="status">{notice}</div>}

          <button type="submit" className="auth-primary" disabled={busy}>
            {busy ? 'Please wait…' : recovering ? 'Save password' : mode === 'signup' ? 'Create account' : mode === 'reset' ? 'Send reset link' : 'Sign in'}
          </button>

          {!recovering && mode === 'signin' && (
            <button type="button" className="auth-secondary" onClick={onMagicLink} disabled={busy}>
              Email me a sign-in link instead
            </button>
          )}
        </form>

        {!recovering && (
          <div className="auth-footer">
            {mode === 'signin' && (
              <>
                <button type="button" className="auth-link" onClick={() => reset('reset')}>Forgot password?</button>
                <span>
                  New here? <button type="button" className="auth-link" onClick={() => reset('signup')}>Create an account</button>
                </span>
              </>
            )}
            {mode !== 'signin' && (
              <span>
                Have an account? <button type="button" className="auth-link" onClick={() => reset('signin')}>Sign in</button>
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export function AccountButton() {
  const auth = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e) => !ref.current?.contains(e.target) && setOpen(false)
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  if (!auth.configured || !auth.ready) return null

  if (!auth.user) {
    return (
      <button type="button" className="account-btn signin" onClick={() => auth.openLogin()}>
        Sign in
      </button>
    )
  }

  const email = auth.user.email || 'Account'
  const initial = email.charAt(0).toUpperCase()
  const avatar = auth.user.user_metadata?.avatar_url

  return (
    <div className="account-menu" ref={ref}>
      <button
        type="button"
        className="account-btn avatar"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
      >
        {avatar ? <img src={avatar} alt="" referrerPolicy="no-referrer" /> : initial}
      </button>
      {open && (
        <div className="account-dropdown" role="menu">
          <div className="account-email">{email}</div>
          <button
            type="button"
            role="menuitem"
            onClick={async () => {
              setOpen(false)
              await auth.signOut()
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
