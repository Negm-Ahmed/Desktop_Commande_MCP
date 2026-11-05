---
name: scheduled-task-standard
description: Quality standard and pre-flight checklist for writing or reviewing a Claude Code scheduled task (routine) prompt — idempotency register, outcome codes, delivery target, minimal connectors, no embedded secrets, timezone-correct cron. Use when creating a new scheduled task, rewriting one, or reviewing why one misbehaves.
---

# Scheduled Task Standard

A scheduled task runs unattended in a fresh cloud container. It must be **self-contained, idempotent, auditable and safe to re-run**.

## Pre-flight checklist (all items must pass)

### Environment
- [ ] The target environment's **Setup script** is empty or valid **bash**. A Windows `.cmd` or `.ps1` there fails every run with exit 127.
- [ ] Network policy allows every host the prompt calls, such as Google APIs or a messaging API.

### Connectors
- [ ] Attach **only** the connectors the prompt uses. Each extra connector is one more failure point and broadens what the task can reach.
  - ATP processing needs Google Drive and Gmail.
  - Site Pulse needs Microsoft 365.

### Secrets
- [ ] **No tokens, API keys or passwords in the prompt text.** Store them as environment variables on the environment and reference them as `$ULTRAMSG_TOKEN`.

### Schedule
- [ ] Write cron in local time with a prefix: `CRON_TZ=Asia/Riyadh 6 7 * * 0-4`.
- [ ] Avoid :00 and :30. Shift a few minutes earlier to escape peak load.
- [ ] Encode working days explicitly. The KSA week is Sun–Thu, so `0-4`, plus Saturday where site works (`0-4,6`).

### Prompt structure (mandatory sections)
1. **Scope**: the exact source (folder URL or mailbox) and "do not use anything outside it".
2. **Input selection**: deterministic rules for choosing the latest file, and exclusions such as `~$` files, zero-byte files and wrong extensions.
3. **Idempotency**: a Processing ID built from file ID, modified time and size, checked against a register sheet before any work. Use the states PROCESSING (with a 60-minute stale lock), SUCCESS, and FAILED (retryable).
4. **Validation**: open and check structure before analysing. On failure, record the exact error and **never send a summary built on bad data**.
5. **Delivery**: name the channel and recipient explicitly, for example "Email to X with subject Y". "Summary delivered" without a target is a defect.
6. **Outcome codes**: exactly one final status per job, such as `SUCCESS | NO ACTION | RETRY LATER | MISSING | FAILED`, plus the filenames, Processing ID and local timestamp.
7. **Failure behaviour**: never overwrite good data with empty data, and never invent values. Mark them UNCLEAR or NOT-FOUND with LOW confidence.

### Governance
- [ ] Use the naming convention `<Domain> · <Function> [ACTIVE|PAUSED]`.
- [ ] Turn on push notification for anything business-critical.
- [ ] Prefer creating the task from a Claude session (`create_trigger`) so agents can later maintain it. Tasks created in the web UI can only be edited by the user.
- [ ] Keep one prompt version per job. Retire superseded copies the same day.
- [ ] After creating it, use `fire_trigger` once and read the run's events before calling it done.

## Review output

When reviewing an existing task, return a table of check, PASS or FAIL, evidence, and fix. Close with the corrected prompt, ready to paste.
