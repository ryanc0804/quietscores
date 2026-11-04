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
- *Site URL*: `https://www.scoresnstats.com`
- *Redirect URLs*: `https://www.scoresnstats.com/**`, `https://scoresnstats.com/**`,
  `https://sportsdashboard.vercel.app/**` and `http://localhost:5173/**` (the old
  `quietscores.com` entries can stay: that domain redirects to scoresnstats.com).

Sign-up confirmation and password-reset emails send people back to these URLs.

## 4. Sign-in method
Accounts are **email + password only**. **Authentication → Providers → Email** is on by
default; leave "Confirm email" on so new users verify their address before signing in.
No other providers need to be enabled.

## 5. Email delivery (Resend)
Supabase's built-in email sender only sends 2 emails an hour, so sign-ups past that
fail. Auth emails go out through [Resend](https://resend.com) instead (free tier:
3,000 emails a month, 100 a day).

1. **Resend → Domains → Add domain**: `scoresnstats.com`.
2. Add the DNS records Resend lists (a DKIM `TXT`, plus an `MX` and SPF `TXT` on the
   `send` subdomain) in **Vercel → Domains → scoresnstats.com → DNS Records**, then
   click **Verify** in Resend.
3. **Resend → API Keys → Create**: permission *Sending access*, domain `scoresnstats.com`.
4. **Supabase → Authentication → Emails → SMTP Settings** → enable custom SMTP:
   - Sender email `noreply@scoresnstats.com`, sender name `Scores n Stats`
   - Host `smtp.resend.com`, port `465`, username `resend`
   - Password: the Resend API key
5. Turning on custom SMTP raises *Authentication → Rate Limits → sending emails* from
   2 to 30 an hour; raise it further there if needed (Resend's free cap is 100 a day).

Check the domain's status in Resend if confirmation emails stop arriving.
