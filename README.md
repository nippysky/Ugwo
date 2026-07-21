# Ụgwọ — Owed. Remembered. Settled.

A private IOU / personal debt tracker by **NIPPYSKY**. Sibling product to
[Akù](https://aku.nippysky.com) — same DNA: self-logged data, zero bank
connections, end-to-end encrypted, local-first, reminder-driven.

**We can't see your debts. Nobody can.**

## Layout

```
.
├── src/                 # Expo app (SDK 57, expo-router, TypeScript strict)
│   ├── app/             #   screens (tabs: Home · History · More, person ledger, onboarding, auth)
│   ├── components/      #   UI kit + ledger components (sheets, celebration)
│   ├── lib/             #   crypto, sqlite (drizzle), sync engine, notifications, pdf export
│   ├── store/           #   zustand stores (auth, ledger, sync, ui, notif)
│   └── theme/           #   indigo/amber design tokens (Fraunces + Plus Jakarta Sans)
├── server/              # ugwo-api (Hono + Drizzle + Postgres + Redis + Resend)
│   ├── src/             #   auth (magic link + OTP), sync, DEK escrow, push tokens, WS
│   ├── public/          #   marketing site ugwo.nippysky.com (+ privacy/terms/delete-account)
│   ├── nginx-ugwo.conf  #   nginx site (API on :3001 + static site)
│   ├── ecosystem.config.cjs
│   └── DEPLOY.md        #   step-by-step droplet deployment
└── assets/              # icons, splash, fonts (generated brand assets)
```

## Architecture in one paragraph

The SQLite database on the phone is the source of truth. Every record is
encrypted on-device (AES-256-GCM) with a per-account DEK before sync; the
server stores ciphertext plus the DEK wrapped by a server master key, so a
returning user on a new device restores by email sign-in alone. Reminders are
Expo local notifications scheduled on-device — the server can't read due
dates. Real-time cross-device sync rides a WebSocket nudge (Redis pub/sub on
the server), with foreground pull as the safety net.

## Development

```bash
npm install
cp .env.example .env        # set EXPO_PUBLIC_API_URL
npx expo start              # app (use a dev build — expo-sqlite etc. need native code)

cd server
npm install
cp .env.example .env        # dev values
npm run dev                 # API on :3001
```

## Builds & stores

- `npx eas init` once, paste the project ID into `app.config.js` (two spots).
- `eas build --profile production` — profiles are in `eas.json`.
- Store URLs: privacy `https://ugwo.nippysky.com/privacy`, deletion
  `https://ugwo.nippysky.com/delete-account`.
- iOS export compliance is pre-answered (`ITSAppUsesNonExemptEncryption=false`
  — standard encryption only).
- A reviewer demo login is supported via `DEMO_EMAIL`/`DEMO_OTP` server env.

## Deployment

See [server/DEPLOY.md](server/DEPLOY.md) — same droplet as aku-api, own
Postgres DB (`ugwo_db`), own PM2 process (`ugwo-api`, port 3001), own nginx
site (`ugwo.nippysky.com`).

---

Ụgwọ · A venture by NIPPYSKY · By the makers of Akù
