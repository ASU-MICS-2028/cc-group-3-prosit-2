# 2026-10-26 · Why Perfect's call-page update didn't show, and the redeploy

**Who:** Eugene, with Claude Code. **Summary of the session, not a transcript.**

## Goal

Perfect couldn't see her PR #15 changes (mirrored self-view, call code, display names) on `https://call-hc.agroconnect.space`. Find out why and fix it; tidy the README items that were done.

## What we found

- **Merging doesn't deploy.** The call server still ran the image built on 23 Oct (`6b0571d`). The live page's script was `index-U4bfuAOc.js`; a fresh build of `main` produces `index-DByWwqhl.js`.
- PR #15's signaling change is backward-compatible: the display name is optional and capped at 40 characters. All 5 hosted signaling checks still pass.
- The first image build failed in `npm ci` and the retry succeeded: a transient download failure, not the code.
- The Lab 6 lab environment in `us-east-1` is fully gone (no Aurora cluster or instance, no EC2 server).

## What changed

- New call image from `main` (`248ea83`), checked locally (the new features are in the bundle), then `terraform apply -replace='module.call[0].aws_instance.call'` (2 replaced, nothing else touched). Live in about 2 minutes.
- README: the Lab 6 teardown row removed (done). `learnings/lab7-webrtc.md` and `learnings/infra.md`: how to tell which version is live, and that a merge needs a redeploy.

## Open questions / next steps

1. Until the Week 9 deploy workflow exists, whoever merges a change to `webrtc-spike/`, `backend/` or `functions/` should tell Eugene.
2. PR #13 (Joseph) asks for the RDS baseline, which is already done; it can be closed.
