# 2026-11-05: putting the PWA online (D-033)

**Who:** Eugene, with Claude Code. **PR:** `infra/frontend-hosting`.

## Why now
Perfect's FB-1 to FB-4 are merged but only ran on laptops: the PLAN rows for fingerprint, voice notes, install and
offline start all say "needs https". The pipeline (D-030) deploys the API and call page but had nowhere to put the
frontend.

## What was built
- `infra/modules/frontend`: private S3 bucket (only CloudFront may read it), CloudFront (`PriceClass_200` for the
  African edges, TLS 1.2+, managed security headers, HTTP/3), ACM certificate in **us-east-1** through a second
  provider, a CloudFront Function that sends extensionless paths `index.html`.
- `ci.yml`: `deploy PWA` on merges that change `frontend/`: build, upload `assets/` (immutable, never deleted) then
  the rest (`no-cache`, `--delete`), invalidate `/*`, smoke-test `/`, `/login`, `/sw.js`, `/manifest.webmanifest`.
- Deploy role: `s3:ListBucket` on the bucket, `Put/DeleteObject` on its objects, `CreateInvalidation` on the one
  distribution.
- `.trivyignore.yaml`: WAF (AVD-AWS-0011) and CMK (AVD-AWS-0132) accepted with reasons.

## Choices
| Option | Why not |
|---|---|
| Serve `dist/` from the API containers | A frontend release would wait on an 8-minute server swap; servers spend time on files |
| Amplify Hosting | Second build system and build-minute charges for the same result |
| **S3 + CloudFront** | Chosen: ~$0 (free tier), no servers, edge in Lagos |

## Applied (Eugene's OK, 5 Nov)
- Certificate first, its CNAME at Hostinger, then `-target=module.frontend -target=module.cicd`: 8 added, 1 changed,
  0 destroyed (alarm-email subscriptions left out on purpose). `app-hc` CNAME → `d1k3ighjzsa8hl.cloudfront.net`.
- First upload by hand with the pipeline's commands. Checks in `evidence/cicd/outputs_pwa_hosting.txt`: routes 200,
  security headers, hashed files immutable, http → https, bucket 403 directly, TLS 1.1 refused, served from Lagos
  (LOS50), service worker active in Chrome.
- A missing file answers 403, not 404: CloudFront may read the bucket but not list it. Still never `index.html`.

## Still to do
- When the app leaves its mock server: CORS on the API for `app-hc`, or route `/api/*` through CloudFront.
