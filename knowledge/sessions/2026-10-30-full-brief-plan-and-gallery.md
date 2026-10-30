# 2026-10-30: full-brief plan and the component gallery

**Goal:** turn the whole brief (Weeks 1–4) into a plan, then build the first step: tokens and the gallery.

**What we found**
- The brief's PDF names two "must implement" items we had left out: prescription fraud checks and emergency escalation (p.3).
- The brief says "HIPAA-compliant" (p.2, p.7, p.9) and the rubric scores it.
- Prosit 1's payments are votex365 in test mode, not Flutterwave.
- The database allows six roles; the brief needs eight.

**What we decided** (both Proposed until the team agrees)
- D-028: Act 843 is the law; HIPAA Security Rule safeguards are the design framework. Replaces D-005.
- D-029: the full brief is in scope, built breadth first, with a mock mode for partner systems. Replaces D-008.
- Synthetic data only (D-004 stands). Payments through votex365.

**What changed**
- `PLAN.md`: new scope table, eight roles, Phase 6 (FB-0 to FB-11), sixteen backend services to split.
- `docs/decisions.md`: D-028, D-029. `README.md`: open items. Notes for Eugene (hosting cost) and the backend lead (new roles and tables).
- `frontend/`: tokens, gallery, 31 tests. [`learnings/frontend.md`](../../learnings/frontend.md).

**Next:** Perfect checks the gallery on a phone; then FB-2 (auth for all roles).
