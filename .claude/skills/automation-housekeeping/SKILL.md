---
name: automation-housekeeping
description: Audit and clean up Claude Code scheduled tasks (routines) and remote sessions — find failing or duplicate scheduled tasks, diagnose failed runs, archive stale sessions, and produce a management-ready status report. Use when the user asks to "organize automation", "clean up sessions", "check my scheduled tasks", "why did my routine fail", or wants a periodic automation health check.
---

# Automation Housekeeping

Goal: a lean, traceable automation estate. Every scheduled task has an owner, a purpose and a working last run. Every open session is still live work.

## 1. Inventory (read-only)

Run these in parallel:
- `list_triggers` with `include_completed: true`, `limit: 100`. Page with `cursor` until `has_more` is false.
- `list_sessions` with `mine: true`, `limit: 100`.
- `list_environments`.

Record for each scheduled task: id, name, enabled, cron (and its timezone), `created_via`, `last_run.status`, connectors, and model.

## 2. Diagnose every failing scheduled task

For any `last_run.status` of FAILED or ABANDONED, call `list_events` on `last_run.session_id`.

| Symptom in events | Root cause | Owner of fix |
|---|---|---|
| `Setup script failed`, `exit_code 127`, `@echo: command not found` | Windows `.cmd` pasted into the cloud environment's **Setup script** field (it runs bash on Linux) | User: environment menu → Edit → Setup script → clear it |
| `init_script` with any other exit code | Broken setup script | User, same place |
| Connector or 401/403 errors | Connector not authorised, or removed from the scheduled task | User: claude.ai → Connectors |
| `computer_unreachable` | Bridge PC offline | User: start Claude Desktop / Remote Control |
| ABANDONED with no error | Run exceeded limits or was superseded | Review the prompt's scope |

Never report a run as "failed" without quoting the exact error line.

## 3. Classify scheduled tasks

- **ACTIVE**: enabled, and the last run succeeded or the failure is understood.
- **PAUSED**: disabled but still needed. Rename with a `[PAUSED]` suffix.
- **SUPERSEDED**: a duplicate name, or an older prompt version of another task. Delete it once you confirm the newer one carries all its logic.
- **FIRED ONE-SHOT**: `ended_reason = run_once_fired`. These are hidden from the default list. Leave them: deleting one also deletes the sessions it ran in, which can include a live conversation.

Naming convention: `<Domain> · <Function> [STATE]`. For example: `RTR · T&C Tracker Writer Monitor [ACTIVE]`.

**Project scope rule.** Only RTR (KSIA RTR — ICAD contractor, TABCOMM CxA, Parsons–SAPL) is active. KSP-RAC is **on hold**: classify every KSP-RAC scheduled task as PAUSED or SUPERSEDED, report it, and do not run, edit or re-enable it until the user releases KSP-RAC. Date cut-off for mixed material: anything dated before 25-Sep-2026 is KSP-RAC; from 25-Sep-2026 onward it is RTR.

## 4. Platform constraints (check these before promising an action)

- Agents can **update** only scheduled tasks created by an agent (`created_via: meta_mcp`). Tasks created in the web UI (`http_api`) must be edited by the user at `https://claude.ai/code/routines/<trig_id>`.
- `delete_trigger` may be blocked by the auto-mode classifier. If it is, give the user the exact list to delete and the URLs.
- Sessions cannot be deleted, only **archived**. Archiving can be undone with `unarchive_session`.

## 5. Session archive rules

Archive when ANY of these is true:
- The status bucket is COMPLETED and the session is idle for more than 24 h.
- It is a `(fork)` of work that continued elsewhere.
- It is BLOCKED on a question that a later session overtook (same workstream, newer `updated_at`).
- It is older than 30 days with no pending user action.

Keep when ANY of these is true:
- It is this session, or a session updated in the last 24 h.
- Its `needs_action` is still the user's open decision. List these in the report.
- It is the latest session of an active workstream.

## 6. Production guard (RTR)

RTR production Power Automate flows (for example **RTR - T&C Tracker Writer (PROD)**), the live T&C tracker and the production Office Scripts are **read-only**. Diagnose and write the fix spec; apply it only after the user gives exact authorising words (for example "Apply the email fix"). Record who operates production for that change.

## 7. Security sweep

Grep every scheduled-task prompt for `token=`, `apikey`, `password`, `Bearer `, and long hex or base64 strings. Any hit is a **finding**: tell the user to rotate the credential and move it to an environment variable or secret.

## 8. Report format (management-ready)

1. **Executive summary**: 3 bullets covering estate health, the critical issue, and the decision needed.
2. **Actions completed**: a table of item, action, reversible (Y/N).
3. **Actions required from user**: a numbered list, each with a URL and a time estimate.
4. **Risks**: severity, impact, and mitigation.
5. **Final state**: scheduled tasks by state, and the open session count.
