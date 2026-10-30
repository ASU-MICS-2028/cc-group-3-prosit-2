# HealthConnect PWA: design tokens and component gallery (FB-1)

**Owner:** Perfect · **Last updated:** 2026-10-30 · **Status:** FB-1 checked on a phone; FB-2 working on a laptop, phone check still to do

> Written for a teammate who will never open the code. Short sentences, no unexplained jargon.

## 1. In one sentence

`frontend/` is the phone app. Right now it holds the design tokens (one file with every colour, size and font) and a gallery page that shows every building block of the app in every state.

## 2. What I did, step by step

1. Created `frontend/` with Vite (a tool that builds and serves the app), React and TypeScript.
2. Put every colour, size, radius and font in `src/styles/tokens.css`. Components may only use those names (for example `var(--lavender)`), never a hex colour or a pixel number.
3. Built each component once in `src/components/` (buttons, chips, inputs, bottom nav, sheets, sync badges, voice, photo capture, vitals, referral priority, prescription card with a QR code, emergency button, video-call screen).
4. Built `/dev/gallery` (`src/gallery/Gallery.tsx`), which shows them all. "Pressed" and "focused" are forced with a class so you can see them without a finger.
5. Icons are Phosphor icons, imported one by one as inline SVG (no icon font). The two fonts are self-hosted in `public/fonts/`.
6. Wrote 31 tests and looked at the page in Chrome at 360 px wide.

## 3. Why we did it this way

- **Tokens only:** one change in one file restyles the whole app, and a test stops anyone sneaking in a hard-coded colour.
- **Ink on lavender, never white:** white on `#B9B4F2` is 1.9:1; the test proves ink on it passes 4.5:1.
- **QR drawn on the phone** (`qrcode-generator`, about 20 KB), so prescription verification works offline.
- **Three extra tokens** beyond the design system's list: `--ink-pressed`, `--focus-ring`, `--on-ink-dim` (the design system names those values but not the variables).

## 4. How to check it works

```bash
cd frontend
npm install
npm test            # 31 tests
npm run build
npm run dev         # prints a Network URL; open <that>/dev/gallery on your phone (same Wi-Fi)
```

You should see every section, no sideways scrolling at 360 px, and the Twi test line "Ɛyɛ, ɔhaw, ŋ…" with no boxes.

## 5. What can go wrong

- **Boxes instead of letters:** the font files are missing from `public/fonts/`.
- **Headless Chrome ignores narrow windows** (it won't go below about 500 px), so it can look cut off. Test in a 360 px frame or on a real phone.
- **Fixed in testing:** a loading button had no accessible name (now says "Save, loading" to screen readers); person rows squeezed their text next to a badge; blood-pressure fields overflowed.

## 6. What is not done yet

Phone check by me; service worker and offline storage (FB-3); every product screen (FB-2 onwards); no real audio, camera or microphone yet (the gallery only shows how those controls look).

---

# FB-2: sign-in, PIN lock, fingerprint, screens for every role

## In one sentence
Anyone can open the app, pick a made-up account (test mode), set a PIN, and land on a home screen with only the tabs for their role; the app locks itself after 5 minutes in the background.

## What I did, step by step
1. **Roles table** (`src/auth/roles.ts`): the eight roles, their tabs (at most five), and `canOpen(role, screen)`. A screen id looks like `chv.today`; the part before the dot is the role family. `me` and `sync` are shared.
2. **Test-mode sign-in** (`src/auth/mockApi.ts`): eight synthetic accounts, no phone numbers (the repo is public). It follows the `AuthApi` interface in `types.ts`, so the real auth-service (SVC-1) can replace it without touching the screens.
3. **PIN** (`src/auth/pin.ts`): 4 to 6 digits, saved only as a salted PBKDF2 hash on the phone, under the person's own id, so two people sharing a phone have separate PINs and it works offline. Five wrong tries wipe that person's PIN and sign them out.
4. **App lock** (`src/auth/lock.ts`, `Session.tsx`): when the app comes back after 5 minutes hidden, it shows the lock screen (the bubble mark only, no name). Restarting the app with a saved session also asks for the PIN.
5. **Fingerprint** (`src/auth/webauthn.ts`): staff roles can turn on fingerprint unlock using the phone's own sensor (WebAuthn). Patients use the PIN only, because a fingerprint on a shared phone isn't reliable (the report's design note). It only works on an https page.
6. **Screens** (`src/screens/`): about 60 basic screens with made-up data, one set per role, all built from the gallery components. The CHV's emergency button sits at the bottom of every CHV patient screen.
7. **Shell** (`src/shell/`): offline banner, the right header, and the labelled bottom nav.

## Why we did it this way
- **A hidden screen is not a protected screen.** The UI only hides things; the API must check the role again (the eight-role table is for the server too).
- **Test mode on purpose:** the login API doesn't exist yet, so everything is labelled "Test mode".
- **Not done yet:** fingerprint is checked by the phone only; a server must verify the signature. Roles are not yet in the database (see the notes in PLAN Phase 6).

## How to check it works
```bash
cd frontend && npm test        # 66 tests
npm run dev                    # open the Network URL on your phone
```
- Pick each account in turn. Check the tabs differ per role.
- Set a PIN, press Home, wait 5 minutes (or change `LOCK_AFTER_MS` in `lock.ts` to 10 seconds to test), come back: the PIN screen appears.
- Fingerprint needs https. Install a tunnel (`brew install cloudflared`), run `cloudflared tunnel --url http://localhost:5173`, and open the https address it prints on the phone. Then Me, "Turn on fingerprint unlock".

## What can go wrong
- **"Fingerprint needs a secure page":** you opened the http Network address. Use the https tunnel address.
- **"This phone has no fingerprint set up":** add one in the phone's settings first.
- **Five wrong PINs:** you are signed out, that account's PIN is wiped, and you set a new one (by design).
- **Switching accounts:** press "Switch account" in the strip under the header (test mode only: a live account has one role, so the button disappears by itself when the real auth-service signs people in). Each account keeps its own PIN; coming back to one asks for it.
- **Cleared browser data:** the PIN and session go with it; sign in again.
