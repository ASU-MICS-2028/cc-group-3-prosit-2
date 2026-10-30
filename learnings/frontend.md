# HealthConnect PWA: design tokens and component gallery (FB-1)

**Owner:** Perfect · **Last updated:** 2026-10-30 · **Status:** working on a laptop; phone check still to do

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
