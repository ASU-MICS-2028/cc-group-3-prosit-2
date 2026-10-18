# Evidence

Proof for each lab deliverable. Capture it **while** you do the work, not afterwards.

| Kind | Name | Example |
|---|---|---|
| Terminal output | `labN/outputs_<part>_<what>.txt` | `lab5/outputs_A_routes.txt` |
| Screenshot | `labN/<part>-<what>.png` | `lab5/B-targets-after-failover.png` |
| Script you ran | `labN/<script>.sh` | `lab5/test_load_balancer.sh` |

Save terminal output with `<command> 2>&1 | tee evidence/lab5/outputs_A_routes.txt`.

Before committing, check that no output contains a password, secret ARN value, access key or real personal data.
Account IDs and resource IDs are fine.
