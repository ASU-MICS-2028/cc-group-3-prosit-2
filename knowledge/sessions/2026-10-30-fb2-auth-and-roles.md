# 2026-10-30: FB-2, sign-in, PIN lock and screens for every role

**Goal:** the second build step of Phase 6: sign in as any of the eight roles, lock the app, and see a screen for every role.

**What we found**
- Fingerprint unlock (WebAuthn) only works on https or localhost, so a phone on the plain Wi-Fi address can't use it. A tunnel gives an https address.
- A tester needs to see who they are signed in as, and to move between roles.

**What we decided**
- Test-mode sign-in with synthetic accounts and no phone numbers, behind the interface the real auth-service (SVC-1) will use.
- PINs belong to the person, not the phone; five wrong tries wipe that person's PIN.
- "Switch account" shows only in test mode, so it disappears with the real login. No new ADR: it follows D-029 (breadth first, mock mode).

**What changed:** `frontend/src/auth/`, `router.ts`, `screens/`, `shell/`, 72 tests; the role name shows under the name on every screen. [`learnings/frontend.md`](../../learnings/frontend.md).

**Next:** phone check; then FB-3, patient records that work offline (encrypted on the phone, sync with conflicts).
