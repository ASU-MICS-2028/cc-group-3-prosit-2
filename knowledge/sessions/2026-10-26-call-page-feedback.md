# 2026-10-26 · Call page feedback: mirror, call code, names

**Who:** Perfect, with Claude Code. **Summary of the session, not a transcript.**

## Goal

Act on feedback from the first real calls: the self-view looked flipped, "Room name" was confusing, and the other tile said "Other person" instead of a name.

## What we found

- The self-view wasn't mirrored, so a left hand looked like a right hand to the person on camera. Zoom and Teams mirror only the self-view and leave the sent video alone. We copied that: flipping the other person's video would show the wrong side of a patient's body and reverse any writing.
- Showing a name needed no server change: the name rides inside the offer and answer messages the two browsers already exchange.
- A prefilled shared value ("test-room") was the real confusion: the field is a shared secret both people must type, not a setting.

## What we decided

No new ADR: this is a UI change inside the D-023 setup. The mirror applies to the self-view only (a checkbox turns it off).

## What changed

- `webrtc-spike/`: mirrored self-view tile + "Mirror my video" checkbox; "Call code" field (empty, Generate button, case/space-insensitive via `lib/callCode.ts`); "Your name" field; names sent in offer/answer and shown on the tiles; `signaling.ts` accepts an optional name (text, max 40 chars).
- Tests: 16 pass (was 10): name accepted/absent/too long/wrong type, code normalising and generating. Checked through a running server: a valid name and a missing name are relayed, an oversized and a non-text name are dropped.
- Docs: `learnings/lab7-webrtc.md` (section 2 step 7, section 6).

## Open questions / next steps

1. **Eugene must rebuild and redeploy the call image** before the hosted address shows any of this (see `learnings/infra.md`).
2. Not yet tried with a real camera on a phone after the change: the mirror and the name labels need a quick look by a person.
3. Re-take the C1 screenshot after redeploy if the old screen is not wanted in the report.
