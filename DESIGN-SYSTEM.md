# HealthConnect Ghana — Design System (PWA)

**Owner:** Application/PWA Lead · **Status:** v0.2 (added components required by the PROSIT 2 brief: labelled nav, voice, photo, vitals, video call, referral priority, prescription, emergency)
**For Claude Code:** this file defines how everything looks. It does **not** define which screens exist; that comes from the HealthConnect brief. Do not invent screens or features from this file.

---

## 0. How to use this file

1. Read the whole file before writing any UI code.
2. First build (after approval): `src/styles/tokens.css` plus a **component gallery page** (`/dev/gallery`) showing every component below, in every state. No product screens until the gallery is approved on a real phone.
3. Every colour, size, radius and font must come from the tokens in section 9. **No hard-coded hex values or pixel sizes in components.**
4. If something isn't covered here, ask. Don't improvise a new style.

---

## 1. Design direction

**Reference:** "Care Made Simple" mobile concept (soft lavender, cream, near-black ink, serif headlines, friendly flat character).

**The feeling:** calm, warm, human. Health is stressful; the app should feel like a kind nurse, not a hospital system or a fintech dashboard.

### What we take from the reference
- Four-colour palette: lavender, ink, mist grey, cream.
- Large **serif** headlines ("Care Made Simple", "Hi Nicholas") next to a clean sans for everything else.
- **Black pill buttons**, including the "Get started" pill with a white circle and arrow at the right end.
- Very rounded cards, pale lavender category tiles with a duotone icon and a label at the bottom-left.
- White **circular icon buttons** (search, notifications, back, more).
- Pill chips for filters and symptoms; a horizontal date strip and time-slot pills.
- A **floating dark bottom nav** with the active tab in a filled circle.
- A flat, friendly **mascot** with simple eyes, used on onboarding and empty states.
- Soft lavender-to-white gradient at the top of onboarding screens.

### What we change, and why
| Reference does | We do | Why |
|---|---|---|
| White text/icons on lavender (selected chip, active nav, "8:00 am") | **Ink** text/icons on lavender | White on `#B9B4F2` is 1.9:1, unreadable in sunlight. Ink on lavender is 10.4:1. |
| Light grey secondary text | Muted text no lighter than `#5E5873` | Must pass 4.5:1 outdoors on low-end screens. |
| Large doctor photos everywhere | **Initials avatars** by default; small cached photos optional | 2G and paid data. Photos are the heaviest thing on the screen. |
| Their head-mirror character, "Go Premium" banner | Our **own** mascot and copy (section 3) | Inspiration, not copying another designer's work. |
| Crimson font | **EB Garamond** | Crimson can't display Twi/Ewe/Ga/Dagbani letters (ɛ ɔ ɖ ƒ ɣ ʋ ʒ). EB Garamond is the classic Garamond Crimson was modelled on, and it supports them. |

---

## 2. Principles (apply to every screen)

1. **One primary action per screen**, in the black pill. Everything else is secondary.
2. **Never wait for the network.** Every form saves on the phone first. Sync status is always visible (section 7.10).
3. **Privacy by default.** Health information is sensitive (section 8).
4. **Readable outdoors.** Body text 16px minimum, 4.5:1 contrast minimum, touch targets 48×48px minimum.
5. **Light on data.** No decorative photos, no icon fonts, no web-font CDNs, no heavy animation libraries.
6. **Plain language.** "Book a visit", not "Schedule an encounter". Assume labels may be translated and grow by 30%.

---

## 3. Brand

### Name
`HealthConnect` (confirm with the team; the brief may say "HealthConnect Ghana").

### Logo: the "talk bubble" mark
Generic health logos (heart, cross, stethoscope, pulse line, hand holding a heart) are **banned**: every clinic in the world uses them.

**Concept:** HealthConnect is about *connecting people to someone who can help*. The mark is a **speech bubble with a face**: a soft rounded bubble with a small tail at the bottom-left and two eyes. It reads as "someone you can talk to".

- **Mark:** bubble silhouette in ink `#090124`, two eyes as cream dots with a tiny ink pupil. No mouth at small sizes.
- **Full-colour version:** cream body `#FAE7C8`, 2px ink outline, ink eyes with white highlights, small tan smile `#C9A36A`.
- **Wordmark:** "HealthConnect" in EB Garamond 500, ink, tracking −0.01em. Mark sits to the left, its height = cap height × 1.6.
- **Minimum size:** 16px (favicon uses the ink silhouette only).
- **App icon:** lavender `#B9B4F2` background, cream bubble with ink eyes, centred, 20% padding.
- Deliver as hand-written SVG (simple paths, under 2KB). No raster logos, no gradients in the logo.

### Mascot
The bubble character, in the same flat style as the reference character but a different shape and role.

- Body: cream bubble; outline: none at large sizes (soft shape on a lavender or white field).
- Eyes: white ovals, ink pupils, white catch-light. Smile: tan curve.
- **Moods (only these):** welcoming (onboarding), thinking (loading/sync), resting (empty state), concerned (error, not sad or crying), celebrating (success, small confetti dots in lavender/cream).
- Accessories allowed: a small lavender headband or a cream mug. Not medical props.
- **Never** use the mascot on screens with bad news (test results, emergencies, payment failures). Those screens are calm and plain.
- SVG only, under 6KB each, inlined or cached by the service worker.

---

## 4. Colour

All text pairs below were contrast-checked.

### Core palette (from the reference)
| Token | Hex | Use |
|---|---|---|
| `--lavender` | `#B9B4F2` | Brand surface: promo cards, selected chip/slot, active nav circle, illustrations. **Never** behind white text. |
| `--ink` | `#090124` | Text, primary buttons, bottom nav, icons. |
| `--mist` | `#EAE9EE` | Dividers, input backgrounds, disabled surfaces. |
| `--cream` | `#FAE7C8` | Mascot, onboarding lower half, warm highlight cards. |

### Supporting colours (added)
| Token | Hex | Use | Contrast |
|---|---|---|---|
| `--canvas` | `#F7F6FA` | Page background | — |
| `--surface` | `#FFFFFF` | Cards, inputs, icon buttons | — |
| `--lavender-tint` | `#E9E7FC` | Category tiles, date strip, subtle cards | Ink on it: 16.6:1 |
| `--violet` | `#4B42B8` | Links ("View all"), focus ring, interactive text | 7.6:1 on white |
| `--text` | `#090124` | Main text | 20:1 on white |
| `--text-muted` | `#5E5873` | Secondary text, timestamps | 6.2:1 on canvas |
| `--on-ink` | `#FFFFFF` | Text/icons on ink | 20:1 |
| `--tan` | `#C9A36A` | Mascot smile only | decorative |

### Status colours (functional only, never decorative)
| Token pair | Text / Background | Use |
|---|---|---|
| `--ok-fg` / `--ok-bg` | `#1F6B3A` / `#E5F4EA` | Sent, confirmed, normal | 5.7:1 |
| `--warn-fg` / `--warn-bg` | `#8A5A00` / `#FFF4DB` | Saved on phone, pending, reminder | 5.4:1 |
| `--danger` | `#B42318` on white | Errors, **emergency only** | 6.6:1 |
| `--danger-bg` | `#FDECEA` | Error message background | — |

**Rule:** red is reserved for errors and emergencies. Never use it for decoration, promotions or "important" badges.

### Gradients
Only one: onboarding header, `linear-gradient(180deg, #D9D6F8 0%, #FFFFFF 55%)`. Nowhere else.

---

## 5. Typography

### Fonts
| Role | Font | Weights | File (provided) |
|---|---|---|---|
| Display & headlines | **EB Garamond** | 400–600 (variable) | `fonts/EBGaramond-subset.woff2` (40KB) |
| UI & body | **Overpass** | 100–900 (variable; use 400, 600, 700) | `fonts/Overpass-subset.woff2` (38KB) |

Both are open-source (OFL, licence files included) and are **not** the usual AI-default fonts (Inter, Poppins, DM Sans, Plus Jakarta, Space Grotesk, Playfair, Fraunces).

**Why these two:** both were tested and display every letter needed for Twi, Ga, Ewe, Dagbani and Hausa (ɛ ɔ ŋ ɖ ƒ ɣ ʋ ʒ ɓ ɗ ƙ ƴ), plus tone marks and the cedi ₵ and naira ₦ signs. Most popular fonts, including Crimson, fail this test and would show boxes in local languages.

**Self-host only.** The subset files already include Latin, Latin-1, the Ghanaian and Hausa letters, combining tone marks (U+0300–0304, U+0308, U+030C), smart quotes, dashes, arrows, ₵ and ₦. Do not load from Google Fonts' CDN; the service worker must cache the files for offline use.

```css
@font-face { font-family: "EB Garamond"; src: url("/fonts/EBGaramond-subset.woff2") format("woff2");
  font-weight: 400 600; font-display: swap; }
@font-face { font-family: "Overpass"; src: url("/fonts/Overpass-subset.woff2") format("woff2");
  font-weight: 100 900; font-display: swap; }
```

### Type scale
| Token | Font | Size / line height | Weight | Use |
|---|---|---|---|---|
| `display` | EB Garamond | 40 / 44 | 500 | Onboarding title ("Care Made Simple" level) |
| `title-1` | EB Garamond | 32 / 36 | 500 | Screen titles, greeting ("Hi Ama") |
| `title-2` | EB Garamond | 26 / 30 | 500 | Promo card title, detail screen name |
| `heading` | Overpass | 19 / 26 | 700 | Section headers ("Categories", "Appointment slot") |
| `body` | Overpass | 16 / 24 | 400 | Body text, inputs |
| `body-strong` | Overpass | 16 / 24 | 600 | Names in lists, button labels |
| `label` | Overpass | 14 / 20 | 600 | Chip text, tile labels, nav labels |
| `caption` | Overpass | 14 / 20 | 400 | Subtitles, times, "General Practitioner" |

Rules:
- **EB Garamond never below 22px.** It has a small x-height and gets hard to read when small. Everything under 22px is Overpass.
- Headlines: sentence case, letter-spacing −0.01em. No all-caps anywhere except the tiny `OVERLINE` label (Overpass 12/16, 700, +0.08em), used sparingly.
- Numbers in times and dates use `font-variant-numeric: tabular-nums` so columns line up.
- No text smaller than 14px. Body copy never smaller than 16px.

---

## 6. Layout, spacing, shape, elevation

**Spacing scale (4px base):** `--space-1` 4 · `--space-2` 8 · `--space-3` 12 · `--space-4` 16 · `--space-5` 20 · `--space-6` 24 · `--space-8` 32 · `--space-10` 40 · `--space-12` 48.

- Screen side padding: 20px. Gap between sections: 32px. Gap inside cards: 16px.
- Design for **360px wide** first (common low-end Android), then check 320px and 412px.
- Bottom nav floats 16px above the bottom safe area; page content gets 104px bottom padding so nothing hides behind it.

**Radius:** `--radius-sm` 12 (inputs, small tiles) · `--radius-md` 20 (cards, list rows) · `--radius-lg` 28 (promo cards, sheets) · `--radius-pill` 999 (buttons, chips, nav, avatars).

**Elevation (keep it flat):**
- `--shadow-1`: `0 1px 2px rgba(9,1,36,.06), 0 4px 12px rgba(9,1,36,.06)` (cards on canvas, icon buttons)
- `--shadow-nav`: `0 8px 24px rgba(9,1,36,.18)` (floating nav, primary pill)
- No other shadows. No glassmorphism, no blur effects (expensive on low-end phones).

---

## 7. Components

Each component must be built once, used everywhere, and shown in the gallery with all states: default, pressed, focused, disabled, loading, error.

### 7.1 Primary button (black pill)
- Ink background, white Overpass 16/600 label, height 56px, full pill, `--shadow-nav`.
- **Arrow variant** (onboarding, "Continue"): label left-aligned with 24px padding; on the right, a 44px white circle with an ink → arrow, inset 6px.
- **Full-width variant** ("Book now", "Save"): label centred.
- Pressed: background `#241B45`, scale 0.98. Disabled: `--mist` background, `--text-muted` label, no shadow. Loading: label replaced by three small white dots.
- **Only one per screen.**

### 7.2 Secondary button
White background, 1.5px ink border, ink label, height 52px, pill. For "Cancel", "Skip", "Not now".

### 7.3 Text button / link
Violet `--violet` Overpass 14/600, e.g. "View all". Minimum touch area 48×48 even if the text is small.

### 7.4 Icon button (circle)
48px white circle, `--shadow-1`, 22px ink icon. For back, search, notifications, more. A notification dot is 8px `--danger` with a 2px white ring, top-right, **only** for unread items that need action.

### 7.5 Chips
- Height 40px, pill, 16px horizontal padding, Overpass 14/600.
- **Default:** white background, 1px `--mist` border, ink text.
- **Selected:** `--lavender` background, **ink** text (not white), no border.
- Use for: filters ("All", "GP"), symptoms (multi-select, show a small ✓ when selected), languages.
- Rows of chips scroll horizontally with a 20px start padding; the last chip is partly visible to hint at scrolling.

### 7.6 Category tile
- Square-ish (min 104×112px), `--lavender-tint`, `--radius-md`.
- Duotone icon top-left (28px, violet + lavender), label bottom-left in Overpass 14/600 ink.
- Horizontal scroll row, like "Cardiology / Check-up / Dental" in the reference.

### 7.7 Promo / info card
- `--lavender` background, `--radius-lg`, 20px padding, min height 140px.
- Title in EB Garamond `title-2`, ink. Small ink pill button ("Learn more") below it.
- Mascot or illustration on the right, partly cropped by the card edge.
- Use for health tips, campaign messages (vaccination days, clinic outreach), not upsells.

### 7.8 Person / provider row
- White card, `--radius-md`, 16px padding.
- Left: 56px avatar. **Default avatar = initials** (Overpass 18/700 ink on `--lavender-tint`, rounded square `--radius-sm`). Photos only if the backend provides a small one (≤20KB), lazy-loaded and cached.
- Middle: name (`body-strong`), role (`caption`), hours (`caption`, tabular numbers).
- Right/top: rating or status chip if the brief needs it. Don't add ratings unless required.

### 7.9 Date strip and time slots
- Date strip: `--lavender-tint` band, `--radius-md`. Each day: weekday letter (`caption`) above date number (`body-strong`). Selected day: 44px `--lavender` circle with ink number and a short ink underline below.
- Time slots: chips (7.5) with tabular numbers, e.g. "08:00", "10:00". Selected = lavender with ink text. Unavailable = `--mist` background, muted text, strike-through, not tappable.
- Use **12-hour times with am/pm** ("8:00 am"), as Ghanaians commonly read and say times. Store all times in UTC and display in the device's time zone, so appointments still work for specialists outside Ghana (the brief asks for multiple time zones, p.3).

### 7.10 Sync status badge (offline-first)
Small pill (height 28px, Overpass 13/600, with an icon):
| Status | Style | Copy |
|---|---|---|
| Saved on phone | `--warn-fg` on `--warn-bg`, phone icon | "Saved on phone" |
| Sending | violet on `--lavender-tint`, animated dots | "Sending…" |
| Sent | `--ok-fg` on `--ok-bg`, check icon | "Sent" |
| Needs attention | `--danger` on `--danger-bg`, alert icon | "Needs attention" |

### 7.11 Offline banner
Full-width strip under the header: ink background, white Overpass 14/600, cloud-off icon: "You're offline. Changes are saved on this phone." Disappears with a 200ms fade when back online, replaced for 3 seconds by "Back online, sending…".

### 7.12 Inputs
- Height 56px, `--surface` background, 1.5px `--mist` border, `--radius-sm`, Overpass 16.
- Label **above** the field (never placeholder-only labels). Helper/error text below in 14px.
- Focus: 2px `--violet` border + 3px `rgba(75,66,184,.2)` outer ring. Error: 2px `--danger` border, error text with an icon.
- Search field: pill shape, search icon left, `--surface` with `--shadow-1`.
- Phone inputs show a fixed "+233" prefix.

### 7.13 Bottom navigation (floating)
- Ink pill, height 72px, inset 16px from the screen edges, `--shadow-nav`.
- Icons 24px with a **label underneath by default** (Overpass 12/16, 600). The brief's users have mixed literacy (p.2, p.6), so icons alone are not enough. Inactive: white at 70% opacity.
- **Active tab:** 44px `--lavender` circle behind the icon, with an **ink** icon; its label turns full white.
- Maximum 5 tabs. Every tab also has an `aria-label`.

### 7.14 Header
- Home: greeting in EB Garamond `title-1` ("Hi Ama"), subtitle in `caption` ("How are you feeling today?"), icon buttons right.
- Inner screens: back icon button left, title centred in EB Garamond `title-2` with an optional `caption` line below (e.g. a date), more-button right.

### 7.15 Sheets and dialogs
- Bottom sheet: white, top corners `--radius-lg`, 4px × 36px mist grab handle, 24px padding. Preferred over centred dialogs.
- Confirm dialogs only for destructive or irreversible actions. Buttons: secondary left, primary right.

### 7.16 Empty, loading and error states
- **Empty:** resting mascot (120px), one sentence in `body`, one secondary or primary action.
- **Loading:** skeleton blocks in `--mist` with a gentle shimmer; for longer waits the thinking mascot. Never a spinner alone on a blank screen.
- **Error:** concerned mascot (except on sensitive screens, section 3), what happened in plain words, and what to do next.

### 7.17 Toast
Ink pill at the bottom above the nav, white 14/600 text, auto-hides after 4 seconds. One at a time.

### 7.18 Voice: listen and speak
Required by the brief: voice-to-text for limited-literacy health workers and voice/visual interfaces for patients (p.2, p.6).
- **Listen button:** 40px circle, `--lavender-tint`, violet speaker icon, placed next to any instruction, consent text or health message. Plays recorded audio in the chosen language. Playing state: violet ring + animated bars.
- **Mic button (voice note):** inside text fields as a trailing 40px icon button. Recording state: `--danger` dot + timer + waveform in a pill; tap again to stop. Saved as an audio note **offline** (works with no signal); transcription happens later on the server when available, shown with a "Transcribing…" badge.
- Never make voice the only way to complete a step; typing and tapping always remain possible.

### 7.19 Photo capture
For wound/skin photos (p.2) and medical image sharing (p.3).
- Capture tile: dashed 2px `--violet` border, `--lavender-tint` background, `--radius-md`, camera icon, label "Take photo".
- After capture: thumbnail (`--radius-sm`), file size after compression ("84 KB"), retake and delete icon buttons, and a sync badge (7.10).
- Optional guide overlay (a simple frame) so photos are taken at a consistent distance.
- Photos are never shown in lists or notifications; only on the patient's record behind the app lock.

### 7.20 Vitals entry and display
For BP, temperature, weight, height (p.2).
- Large numeric inputs (56px, `inputmode="decimal"`), unit shown inside the field on the right ("mmHg", "°C", "kg", "cm"). BP is two fields: systolic / diastolic.
- Display card: value in Overpass 28/700 tabular numbers, unit in `caption`, time taken below.
- **Range flag:** a small pill "Check" (`--warn-fg` on `--warn-bg`) or "Urgent" (`--danger` on `--danger-bg`) with an icon and text, never colour alone. **Thresholds are configuration supplied and signed off by the team's medical partner, never hard-coded guesses.**

### 7.21 Video call screen
For low-bandwidth WebRTC consultations (p.3, Lab 7).
- Remote video full-screen on ink; your own preview 96×128px, `--radius-md`, top-right, draggable.
- Controls in a floating ink pill at the bottom: mute, camera on/off, switch to **audio only**, end call (56px `--danger` circle, white icon; the only red control).
- **Connection indicator** (top-left pill): Good / Weak / Audio only, with bars icon and text. On weak networks offer "Switch to audio" as a toast.
- **Recording indicator** (only if recording is built, for quality assurance p.3): red dot + "Recording" pill, visible to both sides at all times, and consent asked before the call starts.
- Pre-call screen: camera/mic check, network check, provider name and time.

### 7.22 Referral and priority
For CHV referrals (p.6) and specialist referrals with automatic prioritisation (p.3).
- **Priority badge:** "Emergency" (`--danger` filled, white text), "Urgent" (`--danger` on `--danger-bg`), "Soon" (`--warn-fg` on `--warn-bg`), "Routine" (ink on `--mist`). Always text + icon.
- Referral form: bottom sheet with reason, linked vitals/photos (thumbnails), priority (suggested automatically from danger signs, CHV can raise it, never lower an automatic Emergency), destination facility.
- Referral inbox rows (7.8) sorted by priority, then waiting time.

### 7.23 Prescription card
For digital prescriptions with verification (p.3).
- White card, `--radius-md`: medicine name (`body-strong`), dose and schedule (`body`), duration, prescriber name and licence number (`caption`).
- Verification block at the bottom: a short **verification code** in tabular numbers and a QR code (generated on the device, works offline) the pharmacy scans or types to verify.
- Status pill: Issued / Dispensed / Cancelled.

### 7.24 Emergency
The brief says emergency protocols with automatic escalation **must** be implemented (p.3).
- **Emergency button:** full-width, 56px, `--danger` background, white Overpass 16/700 label with an alert icon, `--radius-pill`. Placed in the same position on every CHV patient screen. It's the only filled red button in the app.
- Tap opens a confirmation sheet ("Mark as emergency?") with the danger signs as chips, then shows an escalation status timeline: Raised → Notified (who) → Acknowledged (who, time). If not acknowledged within the configured time, the next level is notified automatically and the timeline shows it.
- Works offline as far as possible: if there's no data, it offers **Call** and **SMS** buttons to the configured emergency number immediately.
- No mascot, no animation beyond a subtle pulse on the "waiting for acknowledgement" step.

---

## 8. Health-specific rules

1. **Lock screen and notifications:** never show health details. Notifications say "You have a new message from HealthConnect", not "Your malaria test result is ready".
2. **App lock:** PIN unlock after 5 minutes in the background. The PIN screen uses the bubble mark, not personal details.
3. **Sensitive fields** (diagnoses, test results, medication) are collapsed by default behind a "Show" control on shared-screen contexts (e.g. a health worker showing a list).
4. **No health data in URLs, page titles or analytics events.**
5. **Emergency:** required by the brief (see 7.24). It is the only element that uses `--danger` as a filled background (white text, 6.6:1), placed consistently and never hidden in a menu. The end-call button (7.21) is the only other red control.
6. **Consent** screens use plain language, one idea per screen, and an explicit "I agree" primary button, never a pre-ticked box.
7. **Tone:** calm and factual on results and bad news. No exclamation marks, no mascot, no celebration colours.

---

## 9. Tokens (copy into `src/styles/tokens.css`)

```css
:root {
  /* core */
  --lavender: #B9B4F2;
  --ink: #090124;
  --mist: #EAE9EE;
  --cream: #FAE7C8;
  /* supporting */
  --canvas: #F7F6FA;
  --surface: #FFFFFF;
  --lavender-tint: #E9E7FC;
  --violet: #4B42B8;
  --text: #090124;
  --text-muted: #5E5873;
  --on-ink: #FFFFFF;
  --tan: #C9A36A;
  /* status */
  --ok-fg: #1F6B3A;   --ok-bg: #E5F4EA;
  --warn-fg: #8A5A00; --warn-bg: #FFF4DB;
  --danger: #B42318;  --danger-bg: #FDECEA;
  /* type */
  --font-display: "EB Garamond", Georgia, "Times New Roman", serif;
  --font-ui: "Overpass", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  /* spacing */
  --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px; --space-5: 20px;
  --space-6: 24px; --space-8: 32px; --space-10: 40px; --space-12: 48px;
  /* radius */
  --radius-sm: 12px; --radius-md: 20px; --radius-lg: 28px; --radius-pill: 999px;
  /* elevation */
  --shadow-1: 0 1px 2px rgba(9,1,36,.06), 0 4px 12px rgba(9,1,36,.06);
  --shadow-nav: 0 8px 24px rgba(9,1,36,.18);
  /* motion */
  --ease: cubic-bezier(.2,.8,.2,1);
  --dur-fast: 120ms; --dur-base: 200ms; --dur-slow: 320ms;
  /* touch */
  --touch-min: 48px;
}
@media (prefers-reduced-motion: reduce) {
  :root { --dur-fast: 0ms; --dur-base: 0ms; --dur-slow: 0ms; }
}
```

**Dark mode:** not in v0.1. Don't build it unless the team decides to.

---

## 10. Icons, illustration, motion

- **Icons:** Phosphor Icons (open-source), imported per icon as inline SVG, **not** an icon font. Regular weight for UI; **Duotone** for category tiles (violet + lavender). 24px default, 22px in icon buttons.
- **Illustration:** flat shapes, the four core colours plus tan, no outlines thicker than 2px, no gradients, no realistic people. All SVG.
- **Motion:** 120–320ms with `--ease`. Allowed: press scale (0.98), sheet slide-up, chip selection colour fade, skeleton shimmer, mascot blink every ~6 seconds on onboarding. Nothing that loops forever on content screens. Respect reduced-motion.

---

## 11. Accessibility checklist

- [ ] All text ≥4.5:1, large text and icons ≥3:1 (use the pairs in section 4).
- [ ] Touch targets ≥48×48px.
- [ ] Every icon-only button has an `aria-label`.
- [ ] Every instruction and consent text has a Listen button once audio exists.
- [ ] Focus ring visible on every interactive element (2px violet).
- [ ] Works at 200% browser text size without breaking layout.
- [ ] Never use colour alone to show status (badges always have text + icon).
- [ ] Test strings render in every language file: "Ɛyɛ, ɔhaw, ŋ, ɖ, ƒ, ɣ, ʋ, ʒ, ɓ, ɗ, ƙ, ƴ, ₵ 25.00".

---

## 12. Do and don't

**Do**
- Use lavender as a surface and ink for anything that must be read.
- Keep screens airy: one main idea, one main action.
- Use initials avatars and SVG illustrations.
- Show sync status wherever data is created.

**Don't**
- Put white text or icons on lavender.
- Use a heart, cross, stethoscope or pulse line as a logo or decoration.
- Copy the reference's character, banner copy ("Go Premium for Better Care") or doctor photos.
- Add gradients other than the one onboarding header.
- Load fonts or icons from a CDN.
- Use red for anything except errors and emergencies.
- Use EB Garamond under 22px.
- Add features or screens not in the HealthConnect brief.
