# Flood Escape — agent instructions

## Expo has changed
This project runs **Expo SDK 57** (React Native 0.86, React 19.2, TypeScript 6, expo-router 57).
Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.
Do not import from `@react-navigation/*`; use `expo-router` and `expo-router/react-navigation` re-exports.

## Project rules
- Routes live in `src/app/` and stay thin; feature logic lives in `src/features/*`; pure, testable logic in `src/lib/*`.
- `src/lib` must not import React Native UI, Supabase client, or anything app-specific.
- Style with NativeWind `className` props only; tokens are defined in `tailwind.config.js`.
- All backend writes go through Supabase RPCs defined in `supabase/migrations`; never insert directly into report tables from the client.
- Every flood-information UI must show age and confidence; never state that a road is "safe".
- Architecture and phase plan: see the approved plan (Phase 1 in progress).
