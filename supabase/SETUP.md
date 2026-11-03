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
- *Site URL*: `https://nfl-website-six.vercel.app`
- *Redirect URLs*: add `http://localhost:5173/**` and `https://nfl-website-six.vercel.app/**`
  (plus `https://*-ryanc0804.vercel.app/**` if you want preview deployments to work).

Email-link sign-in, sign-up confirmation and password reset all send people back to these URLs.

## 4. Sign-in methods
**Authentication → Providers**
- **Email**: on by default. This covers email + password *and* email links.
  "Confirm email" is on by default; new users must click the link before signing in.
- **Google**:
  1. In Google Cloud Console → APIs & Services → Credentials → *Create OAuth client ID* (Web application).
  2. Authorized redirect URI: `https://YOUR-REF.supabase.co/auth/v1/callback`
  3. Paste the client ID and secret into Supabase → Providers → Google → enable.

## 5. Email delivery (before launch)
Supabase's built-in email sender is rate-limited (a few emails per hour) and meant
for testing. For real users, set up custom SMTP under **Authentication → Emails → SMTP**
(e.g. Resend, Postmark, SendGrid).
