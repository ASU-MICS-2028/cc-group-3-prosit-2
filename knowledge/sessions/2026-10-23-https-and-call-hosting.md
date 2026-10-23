# 2026-10-23 · HTTPS for HealthConnect and hosting the Lab 7 call page

**Who:** Eugene, with Claude Code. **Summary of the session, not a transcript.**

## Goal

Pick up Perfect's merged `webrtc-spike/` (PR #8), make it reachable over HTTPS from any phone, and finish S5 (HTTPS) on the way.

## What we found

- The "frontend" that exists is the Lab 7 call spike, not the CHV app: `frontend/` (S9) still doesn't exist.
- **The signaling server keeps rooms in memory.** Behind the API's two servers, two callers could land on different servers and never meet, so it needs exactly one server.
- **Nothing kept the signaling socket alive.** A load balancer closes connections silent for 60 s; a patient waiting for the doctor is silent. Confirmed by design, fixed with a 25 s heartbeat, then tested: a caller idle for 90 s through the load balancer was still in the room.
- The API already sends HSTS (`helmet`), one of L6-B1's four items.
- The running API image (built from PR #2's branch) is identical in code to `main`; no redeploy needed.

## What we decided

- **D-022:** `api-hc.agroconnect.space` and `call-hc.agroconnect.space`, one ACM certificate, DNS at Hostinger.
- **D-023 (proposed, Perfect to confirm):** the call page runs on one dedicated `t3.micro` behind the shared load balancer; heartbeat in the signaling server; torn down after Lab 7.

## What changed

- `infra/`: certificate with both names, HTTPS listener (TLS 1.3) + HTTP→HTTPS redirect, new `modules/call/`, reusable `modules/ecr/`. Applied: 13 added, 2 changed, 0 destroyed; a second plan shows no changes.
- Hostinger DNS (`agroconnect.space`): `api-hc`, `call-hc` and two validation CNAMEs added; existing records untouched.
- `webrtc-spike/`: `Dockerfile`, `.dockerignore`, heartbeat + `heartbeat.test.ts` (10 tests pass).
- Evidence: `evidence/lab7/outputs_C_signaling_hosted.txt` and the two scripts that produced it.
- Docs: D-022, D-023, `learnings/infra.md`, `learnings/lab7-webrtc.md`, `infra/README.md`, PLAN (S5 ✅, L6-B1 ready), README, `knowledge/README.md` (live addresses).

## Open questions / next steps

1. Perfect: review D-023 and the heartbeat; run L7-C1's phone + camera test on `https://call-hc.agroconnect.space`.
2. Eugene: L6-A1 (least-privilege role) and L6-B1 (KMS, `rds.force_ssl`, HTTPS-only bucket policy) before Lab 6 is due on 25 October.
3. Elise (L6-B2): the HTTPS commands for `outputs_B_tls.txt` are in `learnings/infra.md` §4.
4. Old AgroConnect `api` / `app` DNS records point at deleted resources; remove them when convenient.
5. Tear the call server down after Lab 7 (`call_hostname = ""`).
