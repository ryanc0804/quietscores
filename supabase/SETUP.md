# Accounts setup (Supabase)

Logins and favorites run on [Supabase](https://supabase.com) (free tier is fine).
Until the two environment variables below are set, the app runs without
accounts and favorites are saved in the browser only.

## 1. Create the project
1. Sign in at supabase.com → **New project**.
2. **SQL Editor** → paste `supabase/schema.sql` → **Run**.

## 2. Add the keys
**Project Settings → API** has the *Project URL* and the *anon public* key.

- Local: create `quiet-scores-react/.env.local` (git-ignored):
  ```
  VITE_SUPABASE_URL=https://YOUR-REF.supabase.co
  VITE_SUPABASE_ANON_KEY=YOUR-ANON-KEY
  ```
  Restart `npm run dev` after creating it.
- Vercel: **Project → Settings → Environment Variables**, add the same two, then redeploy.

The anon key is designed to be public; row-level security in `schema.sql`
keeps each user's favorites private.

## 3. Redirect URLs
**Authentication → URL Configuration**
- *Site URL*: `https://www.quietscores.com`
- *Redirect URLs*: `https://www.quietscores.com/**`, `https://quietscores.com/**`,
  `https://sportsdashboard.vercel.app/**` and `http://localhost:5173/**`.

Sign-up confirmation and password-reset emails send people back to these URLs.

## 4. Sign-in method
Accounts are **email + password only**. **Authentication → Providers → Email** is on by
default; leave "Confirm email" on so new users verify their address before signing in.
No other providers need to be enabled.

## 5. Email delivery (before launch)
Supabase's built-in email sender is rate-limited (a few emails per hour) and meant
for testing. For real users, set up custom SMTP under **Authentication → Emails → SMTP**
(e.g. Resend, Postmark, SendGrid).
