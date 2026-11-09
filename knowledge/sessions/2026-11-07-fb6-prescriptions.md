# 2026-11-07: FB-6 prescriptions

Joseph, with Claude Code. Task FB-6 (SVC-6, D-038).

- Built issue, verify, one-time dispense and cancel, four fraud flags, migration `008`, and the doctor, pharmacist and patient screens, plus the doctor's image viewer.
- The screens use the real API in live mode and a test-mode stand-in otherwise.
- Driving the flow in a browser found a broken image: `useObjectUrl` freed its address when React re-ran the effect. Fixed in the shared function. Also fixed a wrapping checkbox and a mislabelled tab.
- A misdirected install briefly changed `frontend/package.json` and its lock file; both were restored before anything was committed.
- API tested locally; screens in Test mode. The live run waits for E1 and P2.
