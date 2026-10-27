# 2026-10-27 · HealthConnect architecture diagram (L8-A1)

**Who:** Perfect, with Claude Code. **Summary of the session, not a transcript.**

## Goal

Draw the current HealthConnect architecture, including the new event/serverless layer, for next week's Lab 8 peer review.

## What we found

- The diagram has to show what is **built**, not the plan: the CHV PWA (`frontend/`) does not exist, there is no TURN relay, and the reminders only log (no real SMS). These are drawn as dashed boxes.
- The load balancer's TLS policy accepts TLS 1.2 as well as 1.3, so the diagram says "1.3 preferred, 1.2 allowed" rather than "TLS 1.3".
- Checked in Terraform: the database is encrypted at rest and not publicly accessible; only the API role can read the two secrets.
- The call (video and audio) goes directly between the two browsers; our servers only do signaling. The STUN server is how each browser learns its public address.
- TURN would cost about $0 to $135 a month at 50 calls a day of 15 minutes, all relayed, depending on the vendor (details in `learnings/lab7-webrtc.md`).

## What we decided

No new ADR. The known weak points (one call server, no outbox if publishing fails, one NAT instance) were deliberately **left off** the diagram so it can be the "before" picture for Lab 8 round 3 (L8-B2).

## What changed

- `docs/architecture-healthconnect.png` and `docs/architecture-healthconnect.drawio` (the PNG and the draw.io file come from the same layout; open the .drawio to edit).
- `PLAN.md`: L8-A1 done; L8-A2 and L8-A3 now Ready. `README.md`: those two rows added, L8-A1 removed.
- `docs/ai-tools-usage.md`: one line.
- Lab 5 evidence is untouched (`evidence/lab5/fig1-architecture.png` and the submitted PDF stay as they are).

## Open questions / next steps

1. Joseph: L8-A2, the 5-minute walkthrough script, using this diagram.
2. Everyone: L8-A3, answers to the four review questions; the weak points above are good material.
3. After the peer review (L8-B1): Perfect makes the "before" and "after" versions (L8-B2).
4. If the infrastructure changes (for example the PWA gets hosted), update the diagram.
