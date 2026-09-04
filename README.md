# Flood Escape

A hyperlocal, crowdsourced flood-awareness and route-safety app for Metro Manila.

> People often discover that a road is flooded only after they have already reached it.

Flood Escape answers one question: **"Is my route safe right now?"** Users report flooding from their GPS position with a severity, an optional photo, and a note. Other users see nearby reports and confirm whether the water is still there. Every report carries its age and an explainable confidence score, the app keeps working offline, updates live, and warns users whose saved routes are affected.

Flood information is crowdsourced and treated as **untrusted**. The app never claims a road is safe, only that no recent reports were found.

## Status

Work in progress, built in phases. See [Roadmap](#roadmap).

| Phase | Scope | State |
|---|---|---|
| 1 | Foundation: Expo SDK 57, NativeWind, Supabase client, React Query, offline persistence, jest | Done |
| 2 | Anonymous auth with optional email upgrade, profiles table + RLS, onboarding | Done |
| 3 | Map with viewport-scoped reports, location handling, PostGIS read RPCs | Done |
| 4 | Fast reporting flow, SQLite outbox with idempotent retries, photo compression, storage policies, write RPCs with rate limits | Done |
| 5 | Report details with confidence explanation, activity, author close action | Done |
| 6 | Verification RPC with abuse rules, explainable confidence (SQL + TS mirror, 600-case fixture), lifecycle triggers and cron sweep | Done |
| 7 | Realtime updates scoped to viewport grid cells, focus/app-state lifecycle, cache patching | Done |
| 8 | Offline banner, client-side staleness for cached rows, Activity with retry/discard, Wi-Fi-only photos, location blur, delete my data | Done |
| 9 | Route safety: openrouteservice behind an Edge Function, buffered PostGIS route query, explainable risk levels, saved routes | Done |
| 10 | Evacuation centers | Next |
| 11–12 | Push notifications, testing and polish | Planned |

## Tech stack

| Layer | Choice |
|---|---|
| Mobile | React Native 0.86, Expo SDK 57, TypeScript 6, expo-router, NativeWind 4 |
| Server state | TanStack Query, persisted to SQLite for offline reads |
| Local state | zustand (viewport, connectivity, sync status) |
| Local DB | expo-sqlite (auth session storage, query cache, offline outbox) |
| Backend | Supabase: Postgres + PostGIS, Auth (anonymous first), Storage, Realtime, Edge Functions, RLS |
| Maps | react-native-maps (Apple Maps on iOS, Google Maps on Android) |
| Routing | openrouteservice behind a Supabase Edge Function (provider is swappable) |
| Tests | jest-expo, React Native Testing Library, pgTAP, Maestro |

## Architecture

```
Expo app
  src/app/         thin expo-router routes
  src/features/    screen logic per feature (map, reports, verification, routes, centers, offline)
  src/lib/         pure, testable logic: geo, confidence, lifecycle, validation, supabase client
  src/store/       zustand store
  src/db/          SQLite (query cache, offline outbox)
        │ supabase-js · Realtime · Storage · Edge Functions
Supabase
  Postgres + PostGIS   tables, SECURITY DEFINER RPCs for all writes, triggers, pg_cron sweeps
  Auth                 anonymous sign-in, optional email upgrade
  Storage              report photos (2 MB JPEG, EXIF stripped client-side)
  Realtime             flood_reports scoped by grid cell
  Edge Functions       route-safety (routing provider key), send-push
```

Business logic lives in two places only: Postgres functions (authoritative) and `src/lib` (pure TypeScript mirrors for offline display and unit tests). UI never computes trust on its own.

### Engineering themes

- **Geospatial queries**: PostGIS `geography` columns with GIST indexes; viewport-scoped and radius queries via `ST_DWithin`; route risk via a buffered `LineString` intersection.
- **Trust scoring**: an explainable, additive confidence formula (recency decay, independent confirmations, contradictions, photo evidence, damped reputation) implemented once in SQL and mirrored in TypeScript with shared fixtures.
- **Report lifecycle**: explicit states (active, stale, disputed, resolved) with severity-dependent staleness windows, driven by triggers and a cron sweep.
- **Offline-first**: one write path through a SQLite outbox with idempotent `client_id` retries; cached reads with visible staleness.
- **Realtime**: subscriptions scoped to grid cells covering the viewport, cleaned up on blur and background.
- **Privacy and security**: reporter identity split into a private table, RLS on every table, all mutations through rate-limited RPCs, EXIF stripped before upload.

## Getting started

Prerequisites: Node 20+, npm, Expo Go on your phone, a Supabase project (free tier is fine).

1. Install dependencies

   ```bash
   npm install
   ```

2. Configure Supabase

   ```bash
   cp .env.example .env
   # fill in EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npm run db:push
   ```

   Enable **anonymous sign-ins** in the Supabase dashboard under Authentication.

3. Run the app

   ```bash
   npx expo start
   ```

   Scan the QR code with Expo Go. Push notifications (Phase 11) will require an EAS development build; everything before that runs in Expo Go.

## Scripts

| Command | Purpose |
|---|---|
| `npm start` | Start the Expo dev server |
| `npm test` | Run unit tests (jest-expo) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint via `expo lint` |
| `npm run db:push` | Apply `supabase/migrations` to the linked project |
| `npm run db:reset` | Reset the local Supabase stack (requires Docker) |
| `npm run test:db` | Run pgTAP tests in `supabase/tests` against the local stack (requires Docker) |
| `npm run db:types` | Regenerate `src/lib/supabase/database.types.ts` from the local stack |

## Project structure

```
src/
  app/            routes (expo-router)
  components/ui/  shared UI primitives
  features/       feature modules
  lib/            pure logic and clients
  store/          zustand store
  constants/      theme tokens, thresholds
  db/             SQLite setup
supabase/
  migrations/     SQL migrations (extensions, schema, RPCs, RLS, cron)
  config.toml     local Supabase config
```

## Roadmap

1. Foundation
2. Authentication (anonymous first, optional email upgrade)
3. Map and location
4. Flood reporting through an offline outbox
5. Report details
6. Verification, confidence model, report lifecycle
7. Realtime updates
8. Offline read cache and sync polish
9. Route safety
10. Evacuation centers
11. Push notifications (EAS development build)
12. Testing, performance, polish

## Non-goals

Deliberately not built: flood prediction or forecasting, sensor integration, government dispatch, turn-by-turn navigation, social feed, chat, gamification, complex reputation systems, background location tracking, microservices.

## License

Private portfolio project. All rights reserved.
