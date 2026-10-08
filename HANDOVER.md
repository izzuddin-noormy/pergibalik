# PergiBalik — handover guide

Internal shuttle-van tracker. Riders see live vans (with a 10-minute trail); drivers sign in with
mobile number + 6-digit PIN, share location while on shift, and can view their own timeline.

## How it fits together

| Part | What it is | Where it runs |
|---|---|---|
| Web app + API | Next.js 15 (`app/`, `lib/`, `components/`) — every screen plus `/api/*` | **Vercel** |
| Database | Postgres tables `vans`, `drivers`, `van_pings`, `place_cache` | **Supabase** |
| Android app | Capacitor 8 shell (`android/`) that opens the Vercel URL and adds location permission, background tracking and native HTTP | APK on phones |
| Map | MapLibre GL + OpenFreeMap tiles (free, no key) | — |

The phone never talks to Supabase directly: only the Vercel API holds the database key.

## What you must change (everything else works as is)

| # | Setting | Where | Change to |
|---|---|---|---|
| 1 | `SUPABASE_URL` | Vercel env var | your Supabase project URL |
| 2 | `SUPABASE_SERVICE_ROLE_KEY` | Vercel env var | your Supabase service_role key |
| 3 | `AUTH_SECRET` | Vercel env var | new random value: `openssl rand -hex 32` |
| 4 | `server.url` | `capacitor.config.json` | your Vercel production URL, e.g. `https://pergibalik.vercel.app` |
| 5 | (optional) `appId` | `capacitor.config.json` + `android/app/build.gradle` (`applicationId`, `namespace`) | keep `com.sdguthrie.shuttle` unless you want a new app identity |

See `.env.example` for the three variables.

## Requirements

- Node.js 22 or newer, npm
- A Vercel account and a Supabase account
- For the APK: Android Studio (it bundles the JDK 21 and the Android SDK; install SDK Platform 36)

## Step 1 — Database (Supabase)

1. Create a new project (region: Southeast Asia / Singapore).
2. Open **SQL Editor** and run the files in `supabase/migrations/` **in order**:
   1. `20261008000000_init.sql` (vans)
   2. `20261008010000_drivers.sql` (driver accounts)
   3. `20261008020000_history.sql` (location history + place-name cache)
3. Copy **Project URL** and the **service_role** key from Project Settings → API.

> Want to keep the existing drivers and history instead of starting empty? The current owner can
> transfer their Supabase project to your organisation (Project Settings → General → Transfer project).
> Then skip steps 1–2 and use that project's URL and key.

## Step 2 — Web app + API (Vercel)

```bash
npm install
npx vercel login
npx vercel link            # create a new project, e.g. "pergibalik"
npx vercel env add SUPABASE_URL production
npx vercel env add SUPABASE_SERVICE_ROLE_KEY production --sensitive
npx vercel env add AUTH_SECRET production --sensitive
npx vercel deploy --prod
```

(Or push the folder to a Git repo and use **Add New → Project → Import** in the Vercel dashboard, then add the
three environment variables there and redeploy.)

Check it works: open `https://YOUR-URL/api/vans` → should return `{"vans":[],...}`.
Open `https://YOUR-URL/` in a phone browser → welcome screen with **Find rides**.

If visitors are asked to log in to Vercel, turn off **Settings → Deployment Protection** for production.

## Step 3 — Android APK

1. Set `server.url` in `capacitor.config.json` to your Vercel URL.
2. Build:
   ```bash
   npm install                       # if not done yet
   npx cap sync android              # copies config into the Android project
   cd android && ./gradlew assembleDebug
   # APK: android/app/build/outputs/apk/debug/app-debug.apk
   ```
   If Gradle can't find the SDK, open the `android` folder once in Android Studio (it writes `local.properties`),
   or create `android/local.properties` with `sdk.dir=/path/to/Android/sdk`.
3. **Phones that already have the old PergiBalik installed must uninstall it first.** A build from a different
   computer is signed with a different key, so Android refuses to update over it.

For a proper rollout, create a release key once (Android Studio → Build → Generate Signed App Bundle/APK),
keep the `.jks` file and passwords safe, and sign every future build with it so updates install over each other.

## Day-to-day

- **UI or API change** → `npx vercel deploy --prod`. Phones pick it up next time the app opens; no new APK.
- **New APK needed only for:** app name/icon, permissions, background tracking settings, or a new `server.url`.
- **Reset a driver's PIN:** delete their row in Supabase table `drivers`; they register again.
- **Block a driver:** set `disabled = true` on their row.
- **History** is kept 90 days (old rows are trimmed automatically).

## Project map

```
app/                 screens (page.js) and API routes (app/api/*)
  api/vans           rider list + 10-min trails
  api/location       driver position (sign-in required)
  api/offline        driver goes offline
  api/driver/*       register, login, me, timeline
  api/geocode        street names for timeline stops (OpenStreetMap)
components/LiveMap.js  map, markers, trails, routes
lib/                 db, auth (PIN hashing, tokens), track (stops/drives), location (native/web GPS)
supabase/migrations/ database schema — run in order
android/             Capacitor Android project (icons, splash, permissions already set)
cap-shell/           tiny offline page shown if the server can't be reached
scripts/patch-android.mjs  re-applies permissions/strings if you regenerate android/
```
