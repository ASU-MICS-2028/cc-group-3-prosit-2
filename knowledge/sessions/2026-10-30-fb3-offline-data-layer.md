# 2026-10-30: FB-3, offline patient records

**Goal:** a CHV can add patients and record vitals with no signal; nothing is lost, nothing is duplicated, and the data is safe on the phone.

**What we found**
- The database already has rules (consent first, plausible ranges, corrections not deletes). Copying them to the phone catches mistakes before they reach the queue.
- A 4 to 6 digit PIN only has 10,000 possibilities, so it is weak protection for stored data. A long passphrase typed rarely is much stronger and still usable.
- A fingerprint can't recreate the data key after a restart.

**What we decided**
- D-031 (Proposed): a 10+ character passphrase locks the data; the PIN only guards the 5-minute screen lock; five wrong tries wipe that person's local data until the real login service can restore it.
- Build the data layer and its tests first, screens second. It follows D-011, D-012, D-013, D-014, D-016 and D-029.
- After each build round, the test steps for the phone are given in the chat (Perfect's request).

**What changed:** `frontend/src/data/` (vault, db, model, repo, sync, mock server, provider, wipe), `src/auth/passphrase.ts`, the CHV screens, a sync screen with test tools and a conflict screen; 157 tests. Branch `feat/fb3-offline-records` (built on the FB-2 branch, so its PR should be opened after FB-2 is merged).

**Later the same day:** photo capture (shrunk to about 100 KB on the phone), voice notes (up to 2 minutes), the service worker and install icons. A test found that photos over about 100 KB crashed the vault's text encoding; fixed with a regression test. Offline start was checked in a real browser with the network off (reload and a deep link both opened the app, with fonts).

**Open:** turning a voice note into text, editing a patient, downloading records onto a new phone, the real sync API and login service. Voice, offline start and fingerprint need an https address to test on a phone.
