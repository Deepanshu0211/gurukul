# Building an installable app

## The one thing that broke the first build

`EXPO_PUBLIC_*` variables are read at **build** time and inlined into the JS
bundle. They come from `.env` on a developer machine — and `.env` is gitignored,
so it does not exist on an EAS builder.

The first build therefore shipped with `createClient(undefined, undefined)`
compiled into it. That throws `supabaseUrl is required.` while the bundle is
still being evaluated, before React mounts, so the app died on the splash
screen with nothing on screen to explain it. `expo start` worked the whole
time, because locally `.env` is loaded.

You can see it for yourself:

```bash
EXPO_NO_DOTENV=1 npx expo export --platform android --no-bytecode --output-dir /tmp/noenv
```

then grep the emitted bundle for `createClient` — it reads `createClient(void 0, void 0)`.

## The fix

Two halves, both already applied:

1. **`eas.json`** carries the two public values in an `env` block for every
   build profile, so a build has them whether or not `.env` exists.
2. **`src/lib/supabase.js`** no longer throws when they are missing. It exports
   `supabaseConfigError`, and `App.js` renders `ConfigError` — a screen that
   says what is missing — instead of the process going away.

## What may and may not go into a build

| Variable | In a build? | Why |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | yes | Public. Already visible in every network request. |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | yes | Public by design. Every row it can reach is gated by RLS — verified: an anonymous request to `students`, `staff`, `attendance`, `duties`, `alert_resolutions`, `audit_log` and `staff_requests` returns `[]`. |
| `SUPABASE_SERVICE_ROLE_KEY` | **never** | Bypasses every RLS policy. Anything inlined into the bundle can be read by anyone holding the APK. |
| `SUPABASE_DB_URL` | **never** | Direct database credentials. |

Keeping the anon key in `eas.json` exposes nothing that the installed app does
not already contain. If you would rather not have it in git, use EAS
environment variables instead and delete the `env` blocks:

```bash
eas env:create --name EXPO_PUBLIC_SUPABASE_URL --value https://ofuvjzxjbgsityacukva.supabase.co --environment production
eas env:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <anon key> --environment production
```

## Building

```bash
npx eas build --platform android --profile preview
```

`preview` produces an APK you can install directly; `production` produces an
AAB for Play. Check the build log for the line that lists the environment
variables in scope — if `EXPO_PUBLIC_SUPABASE_URL` is not in it, the app will
show the "not set up yet" screen instead of the login.
