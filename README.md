# ShowPilot — Base44 → Supabase Migration (In Progress)

This is a partial rebuild of ShowPilot, migrating off Base44 onto Supabase.
See `showpilot-migration-checklist.md` (from our chat) for the full plan and current progress.

## What's in this folder

- `base44/entities/` — original Base44 schema definitions (reference only, not used by the app)
- `supabase/schema.sql` — run this in Supabase's SQL Editor to create your database tables
- `supabase/functions/generate-experience/` — Edge Function for AI-generated experience profiles (needs to be deployed via Supabase CLI)
- `src/api/supabaseClient.js` — the Supabase connection (replaces Base44's client)
- `src/pages/` — Home, Calendar, Experience (rewired to Supabase)
- `src/components/showpilot/` — UI components (most needed no changes)
- `src/hooks/usePreferences.js` — user preferences (rewired to Supabase)

## Setup steps

1. `npm install`
2. Copy `.env.example` to `.env`, fill in your Supabase Project URL + anon/publishable key
   (Supabase dashboard → Project Settings → API Keys)
3. In Supabase SQL Editor, run **in this order**:
   - `supabase/schema.sql`
   - `supabase/shared_show_migration.sql`
   - `supabase/tour_manager_migration.sql`
4. Create 3 Storage buckets in Supabase (all **public**): `profile-photos`, `stage-plots`, `input-files`
5. Deploy the Edge Function (for AI-generated Experience Profiles):
   ```
   supabase login
   supabase link --project-ref YOUR_PROJECT_ID
   supabase functions deploy generate-experience
   ```
6. Set the `GEMINI_API_KEY` secret in Supabase (Edge Functions → Manage secrets)
7. `npm run dev` to run locally

## Status: all pages built ✅

Every route in `App.jsx` now resolves — Login, Register, Forgot/Reset Password, Home,
ShowDetail (handles both new + existing shows), Calendar, Experience, SharedShow
(public token-gated view/edit), TourManagerIntake (public token-gated submission).

## Known gaps / TODOs

- **Email notifications are not wired up.** Base44 sent an email to the engineer when
  a tour manager submitted a gig. Supabase has no built-in equivalent — needs a service
  like Resend connected via another small Edge Function. Not blocking core functionality.
- **App icon / manifest.json** — not yet added (there's a "Show Pilot Icon.png" sitting
  in the project folder ready to use for this).
- Two bug fixes made along the way (functionally different from the original, but the
  original versions didn't actually work):
  - `ShowDetail.jsx`'s "Create import link" now actually saves a `TourManagerRequest`
    row (the original generated a link that pointed at nothing)
  - Same underlying issue was already correct in `CalendarPage.jsx`

## Architecture notes worth knowing

- Two Postgres functions (`update_shared_show`, `submit_tour_manager_request`) handle
  the token-gated public actions (editing a shared show, submitting a tour manager
  form) securely — normal permissions correctly block anonymous writes to other
  people's data, so these functions verify the token server-side first.
- All three of your "public, no login required" pages (`/shared/:id`, `/tm-intake`)
  and their SQL functions assume the token itself is the only secret — anyone with
  the link can view/edit, matching the original Base44 behavior.
