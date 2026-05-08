# Menopause App

Personalised holistic wellness support for women experiencing perimenopause and menopause.

> This is a wellness app. It does not provide medical advice and is not a substitute for professional healthcare.

## Stack

- **Next.js 14** (App Router, TypeScript strict)
- **Supabase** (Postgres + Auth + RLS)
- **Tailwind CSS**
- **Stripe** (subscriptions — GBP + USD)
- **PWA** (service worker, offline, installable)
- **Android** (TWA via bubblewrap — Google Play)
- **Vercel** (hosting)

## Getting Started

```bash
# 1. Clone
git clone git@github.com:TA-OG/menopause-app.git
cd menopause-app

# 2. Install
npm install

# 3. Environment
cp .env.example .env.local
# Fill in your Supabase, Stripe, Resend, and VAPID keys

# 4. Run database migrations
# In Supabase dashboard → SQL Editor, run files in supabase/migrations/ in order

# 5. Dev server
npm run dev
```

## Project Structure

```
src/
  app/
    (app)/          ← Authenticated routes
    api/            ← API routes
    auth/           ← Sign in / sign up
  components/       ← UI components
  lib/              ← Supabase, Stripe, wellness engine
  types/            ← TypeScript interfaces
content/
  wellness/         ← Pamela's YAML frameworks (wellness engine input)
supabase/
  migrations/       ← Run in order against your Supabase project
```

## Content Authoring (Pamela)

Wellness frameworks live in `content/wellness/frameworks/` as YAML files.
See `content/wellness/frameworks/template.yaml` for the structure.

Run `npm run validate-content` before committing to check for missing disclaimers.

## Key Commands

```bash
npm run dev              # Development server
npm run build            # Production build (runs content validation)
npm run test             # Run wellness engine tests
npm run type-check       # TypeScript check
npm run validate-content # Validate YAML frameworks
```

## Compliance

- All user-facing content includes wellness disclaimer (see `src/lib/disclaimer.ts`)
- Supplement suggestions require GP disclaimer (enforced at build time)
- GDPR consent collected at sign-up (separate checkboxes for data processing + marketing)
- All sensitive tables have audit triggers

---

**TheOkelloGroup Ltd × Pamela | Confidential**
