# Nebu — Deployment Guide

This turns the dashboard you built into a live product your clients can log into.
You will: (1) stand up a database, (2) run the app locally to confirm it works,
(3) put it online, (4) create your admin login and your first client.

No prior backend experience needed — follow the steps in order. Budget ~1 hour
the first time. Everything here is free-tier friendly.

There are two pieces:
- **Supabase** — the database + login system (the "backend").
- **Vercel** — hosts the website (the "frontend"). You could use Netlify instead; steps are nearly identical.

---

## Prerequisites (install once)

1. **Node.js** (v18 or newer): https://nodejs.org — download the "LTS" version, install it.
   Verify in a terminal: `node -v` should print something like `v20.x`.
2. A **GitHub** account (free): https://github.com — used to deploy to Vercel.
3. A code editor is helpful but not required (VS Code: https://code.visualstudio.com).

---

## Step 1 — Create the database (Supabase)

1. Go to https://supabase.com, sign up, click **New project**.
2. Give it a name (e.g. `nebu`), set a strong database password (save it somewhere),
   pick the region closest to you, and create. Wait ~2 minutes for it to provision.
3. In the left menu open **SQL Editor** → **New query**.
4. Open the file `supabase/schema.sql` from this project, copy ALL of it, paste into
   the editor, and click **Run**. You should see "Success. No rows returned."
   This created every table and the security rules.
5. In the left menu open **Project Settings** (gear icon) → **API**. Copy two values:
   - **Project URL** (looks like `https://abcd1234.supabase.co`)
   - **anon public** key (a long string under "Project API keys")

Keep these two values handy for Step 2.

---

## Step 2 — Run it on your computer (confirm it works before going live)

1. Open a terminal in this project folder (the one containing `package.json`).
2. Create your env file: copy `.env.example` to `.env`:
   - Mac/Linux: `cp .env.example .env`
   - Windows: `copy .env.example .env`
3. Open `.env` in a text editor and paste your two values from Step 1:
   ```
   VITE_SUPABASE_URL=https://abcd1234.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOi...your-anon-key...
   ```
4. Install dependencies (one time): `npm install`
5. Start it: `npm run dev`
6. Open the URL it prints (usually http://localhost:5173).
   You'll see the **login screen**. You can't log in yet — create your admin user next.

---

## Step 3 — Create your admin login

1. In Supabase, left menu → **Authentication** → **Users** → **Add user** → **Create new user**.
2. Enter your email and a password. Click create.
3. Make this user the **admin**. Still in Authentication → Users, click your new user,
   find **Raw app metadata** (or use SQL below), and set:
   ```json
   { "role": "admin" }
   ```
   If the UI doesn't let you edit metadata, open **SQL Editor** and run (replace the email):
   ```sql
   update auth.users
   set raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'::jsonb
   where email = 'you@youremail.com';
   ```
4. Back at http://localhost:5173, sign in with that email/password.
   You should now see the full Nebu dashboard. Create a project — refresh the page —
   it's still there. **That confirms persistence is working.**

> Why this matters: the admin role is what unlocks write access. Everyone else is a
> read-only client. This is enforced by the database, not just the screen.

---

## Step 4 — Put it online (Vercel)

1. Push this project to a **GitHub repository**:
   - Create an empty repo on GitHub.
   - In your terminal, in this folder:
     ```
     git init
     git add .
     git commit -m "Nebu"
     git branch -M main
     git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
     git push -u origin main
     ```
   (`.gitignore` already excludes `.env` and `node_modules`, so your keys stay private.)
2. Go to https://vercel.com, sign up with GitHub, click **Add New… → Project**,
   and import your repo.
3. Vercel auto-detects Vite. Before deploying, open **Environment Variables** and add
   the same two values from your `.env`:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Click **Deploy**. In ~1 minute you get a live URL like `https://nebu-xyz.vercel.app`.
5. One more Supabase setting so logins work on the live URL:
   Supabase → **Authentication** → **URL Configuration** → set **Site URL** to your
   Vercel URL, and add it under **Redirect URLs** too. Save.

Your dashboard is now live. Sign in with your admin account at the Vercel URL.

---

## Step 5 — Give a client access

1. In Nebu (as admin), go to **Clients → Add client** (name, company, email).
2. On that client's row, use **Manage access…** to grant the projects they should see.
3. Create their login: Supabase → Authentication → Users → Add user, using the **same
   email** you entered in Nebu. Either set a temporary password and send it to them, or
   use the **Reset password** button on the client's row in Nebu to email them a set-password link.
   - For the email to match access, the client's email in the `clients` table and their
     auth email must be identical (the database links them by email).
4. The client signs in at your Vercel URL and sees **only** their granted projects,
   read-only, with the Payments tab where they can report a payment.

> Clients never get the `admin` role, so they can never write or see other clients'
> data or any Accesses (credentials are admin-only at the database level).

---

## Securing the Accesses tab (do this before storing real passwords)

The `accesses` table stores credentials. Supabase encrypts data **at rest** on disk,
and Row Level Security makes the table **admin-only** (clients can never read it).
That is already a meaningful baseline.

For stronger, application-level encryption (so even a database export is unreadable
without a key), use Supabase **Vault**:
1. Supabase → **Database → Vault** → create a secret (your encryption key).
2. Store passwords encrypted via `vault` functions instead of plain text.
This requires a small change to how the Accesses tab reads/writes the password column;
ask a developer to wire `vault.create_secret` / `vault.decrypted_secrets` if you handle
sensitive client credentials. Until then, prefer storing a *reference* ("password in
1Password, vault: Café Aurora") rather than the secret itself.

---

## Day-to-day

- **Update the site:** push changes to GitHub; Vercel redeploys automatically.
- **Costs:** Supabase and Vercel free tiers comfortably cover a solo agency. You'll be
  prompted to upgrade only at significant scale.
- **Backups:** Supabase keeps automatic backups on paid plans; on free tier, periodically
  export via Database → Backups, or run a SQL dump.

---

## Troubleshooting

- **Login screen says "Missing Supabase env vars"** → your `.env` (local) or Vercel env
  vars (live) aren't set. Re-check Step 2.4 / Step 4.3.
- **Logged in but see "Could not connect"** → the SQL schema didn't run, or the URL/key
  is wrong. Re-run `supabase/schema.sql` and recheck the API values.
- **Client logs in but sees nothing** → confirm (a) you granted them projects in Nebu,
  and (b) their auth email exactly matches their email in the Clients list.
- **Admin can't write / everything read-only** → the `role: admin` metadata isn't set on
  your user. Redo Step 3.3, then sign out and back in (metadata loads at login).
