# Skill2Income — Supabase Backend

This replaces the Express/SQLite backend with **Supabase**: Postgres + Row Level
Security for data, Supabase Auth for accounts (email/password, phone OTP, and
Google OAuth — all real, not stubbed), and a Supabase Edge Function for the AI
mentor so your Anthropic key never touches the browser.

I validated this before handing it to you:
- The full SQL migration ran clean on a real Postgres 16 instance (tables, RLS
  policies, triggers, seed data)
- The auto-profile and auto-task triggers were tested with real inserts
- The unique constraint (no duplicate job applications) and check constraints
  (no negative income, invalid chat roles) were tested and correctly reject
  bad data
- The Edge Function type-checks cleanly (Deno/TypeScript)
- The frontend's Supabase JS calls were checked against the real SDK — and I
  caught and fixed a wrong CDN URL (`supabase.min.js` doesn't exist; the real
  path is `supabase.js`) by loading the actual published package and testing
  it in a simulated browser environment

What I *can't* test from here: your specific project's auth provider config,
since that depends on credentials only you have.

## What I need from you

1. **Create a Supabase project** at https://supabase.com/dashboard (free tier is fine)
2. From Project Settings → API, grab:
   - Project URL
   - `anon` `public` key
   - `service_role` key (keep this secret — never put it in frontend code)
3. Optional: an Anthropic API key from https://console.anthropic.com for the real AI mentor

## Setup steps

### 1. Run the database migration
In the Supabase Dashboard → SQL Editor, paste the contents of
`supabase/migrations/0001_init.sql` and run it. (Or, with the Supabase CLI:
`supabase link --project-ref YOUR_REF` then `supabase db push`.)

This creates all tables, Row Level Security policies (every user can only
read/write their own rows — enforced by Postgres, not application code),
the auto-profile-on-signup trigger, the auto-task-on-assessment trigger, and
seeds the jobs table.

### 2. Deploy the Edge Function
```bash
supabase functions deploy ai-mentor
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...   # optional — enables real AI replies
```
Without the secret set, the function responds honestly that the AI mentor
isn't connected instead of faking a reply (same behavior as before, just now
living in Supabase instead of Express).

### 3. Configure the frontend
Open `public/supabase-client.js` and fill in:
```js
const SUPABASE_URL = 'https://YOUR-PROJECT-REF.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR-ANON-PUBLIC-KEY';
```
The anon key is safe to expose here — RLS is what actually protects data, not
key secrecy.

### 4. Enable auth providers (optional but recommended)
- **Google**: Authentication → Providers → Google. Needs a Google Cloud OAuth
  client ID/secret.
- **Phone/SMS OTP**: Authentication → Providers → Phone. Needs an SMS provider
  — Twilio or MessageBird are built in; for Nigeria specifically, Termii works
  well via Twilio's generic SMS provider settings.

Until these are configured, the email/password flow works fully; the Google
and phone buttons will show real errors from Supabase (e.g. "Unsupported
provider") instead of pretending to work.

### 5. Serve the frontend
Any static file server works, e.g.:
```bash
cd public
npx serve .
```
Then open `landing.html`.

## Project structure

```
supabase/
  migrations/0001_init.sql     Full schema + RLS + triggers + seed jobs
  functions/ai-mentor/index.ts Edge Function — real Anthropic API call
public/
  landing.html, auth.html, onboarding.html, results.html, dashboard.html
  supabase-client.js            All Supabase calls the frontend makes
  styles.css, theme.js
```

## Still static (same honest list as before)

Learning, BusinessAI, FreelanceAI, FinanceAI's budget planner, CV Builder,
Interview Coach's scoring, Opportunity Engine, and the Admin Dashboard aren't
wired to real data yet. Each would get its own table(s) + RLS policies +
frontend wiring the same way I did for assessments/jobs/income/tasks — happy
to keep going module by module.
