# Evidence

Proof for each lab deliverable. Capture it **while** you do the work, not afterwards.

| Kind | Name | Example |
|---|---|---|
| Terminal output | `labN/outputs_<part>_<what>.txt` | `lab5/outputs_A_routes.txt` |
| Screenshot | `labN/<part>-<what>.png` | `lab5/B-targets-after-failover.png` |
| Script you ran | `labN/<script>.sh` | `lab5/test_load_balancer.sh` |

Save terminal output with `<command> 2>&1 | tee evidence/lab5/outputs_A_routes.txt`.

What each lab needs, file by file, is in that lab's **"Deliverables checklist" in [`PLAN.md`](../PLAN.md)**. Use those exact names.

## Screenshot rules

- Show the **page title, the resource name and the region** (`af-south-1`, top right of the AWS console), so a grader can tell what it is.
- Crop to the relevant part, but keep enough to show context.
- Full-screen the terminal for command output, and include the command itself, not just its result. Save the text version too (`outputs_*.txt`).
- Take "before" and "after" shots for anything that changes (failover, redirects, denied actions).
- **Nothing secret on screen:** no secret values, passwords, access keys or session tokens. Close any tab that shows one first.

Before committing, check that no output contains a password, secret ARN value, access key or real personal data.
Account IDs and resource IDs are fine.
