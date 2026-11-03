import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../hooks/useAuth'

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

function ThemeIcon({ mode }) {
  const common = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }
  if (mode === 'light') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    )
  }
  if (mode === 'dark') {
    return (
      <svg {...common}>
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </svg>
  )
}

const THEMES = [
  { mode: 'system', label: 'System' },
  { mode: 'light', label: 'Light' },
  { mode: 'dark', label: 'Dark' },
]

/**
 * The header's one menu: account (sign in / sign out) and appearance.
 * Shows the user's avatar or initial when signed in, a person icon otherwise.
 */
export function AccountButton({ themeMode, onThemeChange }) {
  const auth = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e) => !ref.current?.contains(e.target) && setOpen(false)
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const accounts = auth.configured && auth.ready
  const user = accounts ? auth.user : null
  const email = user?.email || 'Account'
  const avatar = user?.user_metadata?.avatar_url

  return (
    <div className="account-menu" ref={ref}>
      <button
        type="button"
        className={`account-btn avatar ${user ? '' : 'guest'}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={user ? 'Account and settings' : 'Sign in and settings'}
      >
        {user ? (
          avatar ? <img src={avatar} alt="" referrerPolicy="no-referrer" /> : email.charAt(0).toUpperCase()
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
          </svg>
        )}
      </button>
      {open && (
        <div className="account-dropdown" role="menu">
          {user && <div className="account-email">{email}</div>}
          {accounts && !user && (
            <button
              type="button"
              role="menuitem"
              className="account-signin"
              onClick={() => {
                setOpen(false)
                auth.openLogin()
              }}
            >
              Sign in or create an account
            </button>
          )}

          <div className="account-section-label">Appearance</div>
          <div className="account-theme" role="radiogroup" aria-label="Appearance">
            {THEMES.map((t) => (
              <button
                key={t.mode}
                type="button"
                role="radio"
                aria-checked={themeMode === t.mode}
                className={themeMode === t.mode ? 'active' : ''}
                onClick={() => onThemeChange(t.mode)}
              >
                <ThemeIcon mode={t.mode} />
                {t.label}
              </button>
            ))}
          </div>

          {user && (
            <button
              type="button"
              role="menuitem"
              className="account-signout"
              onClick={async () => {
                setOpen(false)
                await auth.signOut()
              }}
            >
              Sign out
            </button>
          )}
        </div>
      )}
    </div>
  )
}
