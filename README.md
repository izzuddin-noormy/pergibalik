# PergiBalik — company shuttle van tracker

Internal Uber-style tracker for company shuttle vans. Two roles, no sign-in:

- **Rider** – live map of vans, distance + rough ETA, list sorted by nearest.
- **Driver** – enter van number (+ optional name/route), Go online. In the Android app the location keeps
  sending with the screen off (foreground service + notification). Go offline stops it.

## Stack
- Next.js (App Router) on Vercel: web app + API (`/api/vans`, `/api/location`, `/api/offline`)
- Supabase Postgres table `public.vans` (RLS on, only the server's service-role key can access)
- Android: Capacitor 8 shell that loads the Vercel URL, with native location permission,
  `@capacitor-community/background-geolocation` for drivers and native HTTP posting.

## Env (Vercel)
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

## Rebuild the APK
```
npm install
npx cap add android   # first time only
node scripts/patch-android.mjs
npx cap sync android
cd android && ./gradlew assembleDebug   # -> app/build/outputs/apk/debug/app-debug.apk
```
UI/API changes only need a Vercel redeploy — the APK loads the live site.
