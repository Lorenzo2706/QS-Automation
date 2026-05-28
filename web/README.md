# Quicksilver Web

Next.js frontend for the QS Automation pipeline. Lets invited users sign up,
upload a resume, manage LinkedIn searches, and tune their notification
threshold. Talks to the same Supabase project as the Trigger.dev backend.

## Stack

- Next.js 15 (App Router) with React 19
- `@supabase/ssr` for cookie-based sessions and RLS
- Tailwind CSS for styling
- Server Actions for all writes (auth, resume parse, search config CRUD)
- `pdf2json` (Node runtime) for resume parsing — shared with the Trigger.dev
  task via `../shared/resume/parsePdf.ts`

## Local development

```bash
cd web
cp .env.local.example .env.local
# fill in NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
# SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SITE_URL
npm install
npm run dev
```

The Trigger.dev dev server runs from the repo root (`npm run dev` there) and is
unrelated to this app at runtime — both just talk to Supabase.

## One-time Supabase setup

Required before signups can succeed in production:

1. **SMTP** — Auth → Emails → SMTP Settings → wire Resend:
   - Host: `smtp.resend.com`
   - Port: `465`
   - Username: `resend`
   - Password: your `RESEND_API_KEY`
   - Sender: a verified Resend address (e.g. `jobs@yourdomain`)
2. **Redirect URLs** — Auth → URL Configuration → add:
   - Site URL: production URL (no trailing slash)
   - Additional Redirect URLs:
     - `http://localhost:3000/**`
     - `https://<your-vercel-app>.vercel.app/**`
3. **Allowlist** — Add invited emails:
   ```sql
   INSERT INTO public.signup_allowlist (email, note)
   VALUES ('user@example.com', 'q1 invite');
   ```

## Deploying on Vercel

- Import the repo
- **Root Directory: `web`**
- Env vars: same four as `.env.local.example`
- Framework preset: Next.js (auto)
- Build command: `next build` (default)

The shared `pdf2json` parser lives one directory up (`../shared/`); the
`outputFileTracingRoot` in `next.config.ts` ensures Vercel includes it in the
deployment bundle.
