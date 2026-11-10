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

---

---

# FB-3: offline patient records (data layer, security, CHV screens)

## In one sentence
A CHV can add patients, record permission and vitals with no signal; everything is saved first on the phone, encrypted, queued, and sent when there is a signal; clashes are shown and settled by a person.

## What I did, step by step
**Data layer (`src/data/`)**
1. **Vault** (`vault.ts`): a random key encrypts every record; that key is locked with the person's **passphrase** (10+ characters, 600,000 rounds of PBKDF2). Each sealed record is tied to its own id.
2. **Database** (`db.ts`): IndexedDB, one per person. Only the FHIR record is secret; the id, type and sent-or-not state sit beside it.
3. **Records** (`model.ts`): Patient, Consent, Observation, Media as FHIR R4. LOINC codes and plausible ranges are copied from `db/migrations/002_loinc_reference.sql`.
4. **Rules on the phone** (`repo.ts`), the same as the database's: no reading without active clinical-care consent (D-012, D-014); withdrawing marks a consent inactive, never deletes it (D-013); typing errors like 368 for 36.8 refused; blood pressure is two linked readings; a wrong reading is marked "entered in error", never deleted.
5. **One write, one transaction:** the record, its "to send" entry and its audit entry are saved together or not at all.
6. **Audit:** every create, read and search is logged with ids only. Asking for a patient that doesn't exist is logged, then reported as "not found".
7. **Sync** (`sync.ts`, `mockServer.ts`): oldest first; a retry is recognised, so a lost reply makes no duplicate (D-011); if the other side changed the same record nothing is overwritten and a person chooses "keep mine" or "use theirs".

**Security (decision D-031)**
8. **Two tiers:** the **passphrase** is typed when the app starts cold (after a restart). The **PIN** (4 to 6 digits) only opens the 5-minute screen lock while the key is still in memory. Fingerprint works only for that screen lock.
9. **Five tries, one count:** wrong PINs and wrong passphrases share it. The fifth wipes that person's local data (`data/wipe.ts`) and signs them out. Unsent records are lost, until the real login service can restore them.
10. **Signing out locks the data key,** so the next sign-in needs the passphrase.

**Screens (`src/screens/chvData.tsx`, `syncScreens.tsx`, a `DataProvider`)**
11. Today (what is waiting to send), Patients (search), Add patient, Permission (one idea per screen, a separate step for SMS reminders), Patient (permission, latest readings with Check/Urgent flags, history, "mark as a mistake", withdraw), Record vitals, Waiting to send, and a conflict screen that lists what differs.
12. **Sending** happens by itself: after every save, when the signal returns, and every 20 seconds.
13. **Flags use example ranges** in `src/config/thresholds.ts`, labelled on screen, until a clinician signs them off.

## Why we did it this way
- **Encrypt on the phone:** a lost or shared phone must not expose patients.
- **Passphrase plus PIN:** a PIN alone has only 10,000 possibilities; a long passphrase typed rarely is both safe and usable.
- **A mock server with the real rules:** the PWA can be built and tested before the real sync API exists; `SyncApi` is the interface the real one will implement.

## How to check it works
```bash
cd frontend && npm test    # 176 tests
npm run dev                # open the Network URL on your phone
```
Phone steps are given in the chat after each round. The Sync screen has "Test tools" (pretend offline, pretend another phone edited, lose the next reply, empty the test server) that only exist for testing.

## Photos, voice notes and starting with no signal
14. **Photo** (`src/media/image.ts`, `screens/media.tsx`): the phone's camera is opened with a file picker (`capture`), then the photo is shrunk on the phone to about 100 KB (it tries high quality first, lowers quality, then shrinks the picture; never above 300 KB). It is encrypted and saved like any other record. A photo is only shown on the patient's own page.
15. **Voice note** (`src/media/recorder.ts`): the microphone records up to 2 minutes at a low bit rate, the note is saved on the phone, and a player appears. Written text will be added later when there is a signal (not built). Leaving the page turns the microphone off. The microphone needs an **https** page and the person's permission; each way it can fail has its own plain message.
16. **Mistakes:** a photo or voice note is "marked as a mistake", never deleted (D-013).
17. **Service worker** (`public/sw.js`): on first visit it saves the app's own files, so the app opens with no signal, including deep links. It only runs in the real build, and browsers only allow it on **https** (or localhost). Patient data never goes through it. Change `VERSION` in `sw.js` when its behaviour changes.
18. **Install:** `manifest.webmanifest` and the icons let a phone add HealthConnect to the home screen.
19. **A bug a test found:** the vault turned a photo into text by passing the whole file to one function call, which crashes above about 100 KB ("Maximum call stack size exceeded"). It now works in chunks, and a test seals a 1 MB value so it can't come back.

## What can go wrong / known limits
- **Forgot the passphrase:** nobody can reset it. Five wrong tries (or forgetting) means the unsent records on that phone are gone. Records already sent are safe on the server.
- **Fingerprint can't unlock after a restart:** it can't recreate the data key.
- **The passphrase protects stored data, not a phone that is already unlocked and in use.**
- **Photos and voice notes** are stored inside the record (limits 300 KB and 2 MB). Voice needs https; the written text of a voice note is not built yet.
- **After an app update** a phone keeps running the saved copy until the app is opened again with a signal, then the new copy is used (the service worker saves the new files and takes over).
- **Test mode:** the "server" is a mock kept in the browser's storage; the real sync API is SVC-0.

## Not done yet
Editing a patient; turning a voice note into text; the real sync API; the real login service; downloading a patient's records from the server onto a new phone.

---

# FB-4 part 1: the video call, inside the app

## In one sentence
Two people open the same call code in the app and see and hear each other; on a weak connection the call offers (then switches to) audio only.

## What I did, step by step (`src/call/`, `src/components/live.tsx`, `src/screens/call.tsx`)
1. **Ported the Lab 7 call** (`webrtc-spike/`) into the app. It uses the **same signaling server**, hosted at `call-hc.agroconnect.space` (D-023). `src/call/signaling.ts` is a copy of the spike's message list; keep the two in step. To use another server, set `VITE_CALL_WS` when building.
2. **Low-bandwidth video:** the camera is asked for 320 by 240 at about 15 frames a second, and the video is capped at about 150 kbit/s (usable on 3G).
3. **Quality indicator** (`quality.ts`): every 2 seconds the browser's stats (packet loss, delay, frame rate) are judged good or weak. Two weak readings in a row (4 s) suggest **"Switch to audio?"**; five in a row (10 s) switch to audio by themselves. These limits are settings from the Lab 7 throttling tests, not facts about every network.
4. **Audio only:** the camera is switched off and nothing is sent, which saves most of the bandwidth. The other person sees your name instead of a black box. You can go back to video at any time. A call that starts audio-only keeps a video line reserved, so switching later needs no new setup.
5. **Before the call** (`network.ts`, `screens/call.tsx`): a check page looks at the secure-page rule, the signal, whether the call server can be reached, and the microphone; the phone's own connection hint makes "audio only" the first choice when it says 2G or slow.
6. **Full-screen call** above the bottom navigation, with mute, camera, audio-only and end (red). The screen is kept awake during a call where the phone allows it. Leaving the page ends the call and releases the camera and microphone.
7. **After the call:** why it ended and how long it lasted, then "Call again".
8. **Codes:** "Clinic 1" and "clinic-1" are the same room. Make a code, then share it by the phone's Share button.

## Why we did it this way
- **Reuse, not rewrite:** the call already worked in Lab 7; the new work is the screens, the weak-network behaviour and the checks around it.
- **A fake engine in tests:** the screens are written against a small interface (`CallApi`), so every state (waiting, weak, ended, error) is tested without two phones. The real engine was tested separately with two real browsers.

## How I checked it (a real call, not only unit tests)
Two separate browsers with fake cameras joined the same code through the new screens against a local copy of the signaling server. Both connected, each received video at 320 by 240, audio-only hid the picture and showed the name on the other side, switching back restored it, mute worked, and ending showed the right message on both sides. A layout bug found this way (the bottom nav covered the call buttons) was fixed.

## What can go wrong / known limits
- **Needs a secure page** (https, or localhost) for the camera and microphone.
- **Two different mobile networks may not connect:** only a public STUN server is used. If it fails, the app says so. This is the Lab 7 TURN finding. A TURN relay can be added with `VITE_TURN_URL`, `VITE_TURN_USERNAME` and `VITE_TURN_CREDENTIAL` (these end up in the app, so use short-lived ones).
- **No code check:** anyone who knows a code can join if the room has a free place (two people at most). Codes made from an appointment will be hard to guess; the hand-typed ones are only as private as the code you choose.
- **If the connection drops** the call waits 10 seconds to recover, then ends with a plain message. It does not restart the connection by itself yet.
- **Not built yet:** booking appointments, recording with both people's consent, the quality-assurance list, the consultation fee (Joseph integrates the existing payments code).

---

# FB-4 part 2: appointments, and downloading records

## In one sentence
A CHV books a 30-minute video visit for a patient with a doctor; it is saved on the phone, sent when there is a signal, and the doctor's phone downloads it, so both see the same visit and can join the same call.

## What I did, step by step
1. **Visit records** (`data/model.ts`, `data/repo.ts`): an Appointment (FHIR-shaped) with the patient, the doctor, a start and end in UTC. Rules copied from the database: a visit needs permission for care, can't be in the past or more than 90 days ahead, and a doctor (or a patient) can't have two booked visits at overlapping times (D-017). Cancelling marks it cancelled; nothing is deleted.
2. **Times** (`config/people.ts`): clinic hours (08:00 to 16:00 UTC, 30-minute slots, Sunday closed) are settings. Times are saved in UTC and shown in the phone's own time zone, so a doctor in another country sees the right local time (brief p.3).
3. **Booking screen** (`screens/visits.tsx`): pick the patient, a day (a week ahead), and a time. Times already booked are greyed out; with no signal it says it will check again when there is one.
4. **Visits list**: coming up, earlier and cancelled, with sync state, "Join call" (which opens the Lab 7 call with a code made from the visit, so both people land in the same room) and "Cancel visit". It also says whether an **SMS reminder** will go out: only with permission for reminders and a phone number (D-014). In test mode the reminder is only a note; the real reminder comes from the existing event pipeline once the PWA talks to the real API.
5. **Two phones, one time:** if another phone booked the same doctor and time first, the server refuses it for good. Your phone keeps the visit, shows "Needs attention", explains, and offers "Choose another time" or "Cancel this visit". Nothing is lost.
6. **Downloading** (`data/sync.ts`, `data/mockServer.ts`, D-032): after sending, the phone downloads what its person may see that others created, from a bookmark so nothing repeats. A doctor gets the visits booked with them and those patients' records (read only). A person's own records come back after a wipe or a new phone. A record with unsent changes is never overwritten by a download.
7. **Doctor screens:** Today (visits booked with you, "Check for new visits", "Join call"), Patients, and a read-only patient page with no buttons that change anything.

## Why we did it this way
- **The server decides who sees what.** The app only hides things.
- **Booking offline is allowed:** a rural CHV with no signal can still book, and gets told afterwards if the time was lost.

## How I checked it
266 tests: the booking rules, double booking across two phones, who downloads what, repeated downloads, a wiped phone getting its records back, and the screens end to end including a CHV booking and then switching to the doctor in the same browser. Three bugs were found and fixed on the way:
- a record saved while a send was running waited up to 20 seconds for the next round;
- a send asked for just as an offline round ended was dropped;
- after a download the screens did not refresh (the doctor's list stayed empty).
Each has a test that fails if the fix is removed.

## What can go wrong / known limits
- **Needs the real download endpoint** for two real phones to see each other's records (Joseph); today the "server" is a mock in the browser, so two roles on one phone (Switch account) is the way to test.
- **Patient-role screens are still basic:** a patient doesn't yet have their own view of their visits.
- **No real SMS in the PWA:** the reminder line is a promise, not a message.
- **Recording with consent and the QA list:** not built yet.

## FB-4 fixes after the phone check (31 Oct)
- **Field validation** (`src/data/validate.ts`): every form box now checks its value and shows a message under it: names (letters only, 2 to 100 characters, any Ghanaian letters allowed), village, year of birth (4 digits, 1900 to this year), Ghana phone number (digits only, 9 after +233; spaces, dashes and a leading 0 are forgiven), vitals (digits and one decimal point; comma accepted; each reading checked against its plausible range), and call codes. The same rules run again inside the repository, so a bad value can't get in even if a form is skipped. **Bug fixed:** the phone box used to throw away letters silently and accept what was left.
- **Duplicate patients:** registering a name that is already saved (ignoring case and extra spaces) asks first: "Open that patient" or "No, add a new patient". When two saved patients share a name, lists add a short record tag (for example "record 4f2a") so they can be told apart. Two different people with the same name are still allowed.
- **Confirm sheet:** the "are you sure" box is now a bottom sheet with full-width buttons, the main one on top (before, a button label wrapped onto two lines). The cancel-visit sheet names the patient, the time and the doctor. Escape or a tap outside closes it without doing anything.
- **Offline booking notice:** when the times can't be checked, a yellow notice sits above the times: "You're offline. We'll check the times are still free when you have a signal. If someone else took your time, the visit will show 'Needs attention' and you can choose another."
- **Test hygiene:** a send still running at the end of one test could write into the next test's data. Tests now wait for sends to finish, and wiping a person's data does too (`whenSyncIdle`). 342 tests, 10 clean runs in a row.

## Running the frontend tests: use Node 24
CI runs Node 24, and `main` now has jsdom 30 and vitest 5, which don't start on Node 20 ("Cannot read properties of undefined (reading 'bind')"). On a Mac with nvm: `nvm install 24 && nvm use 24`, then `cd frontend && npm install && npm test`. Without changing your Node, this also works: `npx -y node@24 node_modules/vitest/vitest.mjs run`.

## FB-4b: call recording and the QA list (10 Nov)
- **Consent:** only the doctor's phone can ask, and only on a call opened from a booked visit (`appt-<id>` code). The doctor's yes is saved on the server, then the other person is asked, their yes is saved, then recording starts. A new id each time: consent never carries over.
- **Stopping:** either side, at once, and the sound is thrown away. A dropped connection also stops it (a "stop" could no longer get through) but keeps what was recorded, as does the call ending. Resuming needs a fresh yes.
- **The sound stays on the doctor's phone.** Sound only (both voices mixed, 16 kbit/s, one-hour limit), sealed with the vault key in the `meta` store. Never put it in `records`: everything there is queued for upload. The server (`backend/src/routes/recordings.ts`, migration 013) holds only consent times, length and reviews. Wiping the phone loses the sound. Moving it to S3 needs SVC-2.
- **Who reviews:** a health centre admin, for finished recordings by doctors at their own facility. A doctor sees their own and can't review them. Withdrawn recordings never reach the list. A reviewer can only hear the sound on the doctor's phone.
- **Limit:** consent is enforced by the app; nothing can stop a tampered phone recording on its own. Test mode can't store the other phone's yes, so its list shows "No" for the patient's side on unfinished ones.
- **Checked** with two real Chrome browsers and fake microphones: ask, no, yes, withdraw, end of call, encrypted row, playback.
