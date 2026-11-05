---
name: atp-report-processor
description: Run the RAC/KSP Daily ATP Report processing on demand — select the latest Daily ATPs Report and T&C ATP Log from the ATP Google Drive folder, enforce the ATP Processing Register (idempotency), validate, summarise, and optionally adjudicate an open RAC Verification Request against the ATP log. Use when the user says "run ATP processing", "process today's ATP report", "check the ATP register", "answer the RAC verification request", or when the scheduled ATP task failed and needs a manual run.
---

# ATP Report Processor (manual / on-demand)

This mirrors the scheduled task **ATP · Daily Report Processor** so the job can be run interactively when the scheduled run fails. The register prevents double processing, so a manual run is always safe.

## Fixed parameters

- **Source folder (only this one):** https://drive.google.com/drive/folders/1bImP_0F2Q6YraIEQi1M8SOUMG2QnmDV1
- **Timezone:** Asia/Riyadh
- **Register:** the Google Sheet `ATP Processing Register` in the same folder
- **Connectors:** Google Drive (read and write), and Gmail (only for delivery)

## Job 1: Daily ATP processing

1. **Select inputs.**
   - Daily report: match `Daily ATPs Report*` case-insensitively, with extension `.xlsx`, `.xlsm` or `.xls`. Exclude `~$*` and zero-byte files. Take the latest **filename date** that is not in the future; break ties by Drive modified time.
   - Log: match `T&C ATP Log.xlsx` case-insensitively. Take the latest modified time.
2. **Build the Processing ID.**
   `DAILY_ID|DAILY_MTIME|DAILY_SIZE|LOG_ID|LOG_MTIME|LOG_SIZE`
3. **Check the register.**
   - If the ID shows SUCCESS and SENT, return **NO ACTION**.
   - If it shows PROCESSING and is less than 60 minutes old, return **RETRY LATER**.
   - If it shows PROCESSING and is more than 60 minutes old, or shows FAILED, retry.
   - If the ID is new, insert a row with Status = PROCESSING and the start time.
4. **Validate** that both workbooks open with openpyxl or pandas, are non-empty, and contain the expected sheets and columns. On failure, set Status = FAILED and Summary = NOT SENT, record the exact error, and stop.
5. **Process** the pair and produce the summary: stage progress, new approvals and rejections (A/B/C/UR), overdue items, and changes since the last SUCCESS row.
6. **Deliver**, then complete the register. Set SUCCESS and SENT only after delivery is confirmed. If delivery fails, set FAILED / FAILED with the exact error.

Report the outcome as **SUCCESS | NO ACTION | RETRY LATER | MISSING | FAILED**. Include both filenames, the Processing ID, and the Riyadh timestamp. Never report a file MISSING unless the folder was actually listed.

## Job 2: RAC verification cross-check (optional; run when requested or when a request file exists)

1. Find the latest `RAC Verification Request*.txt`. If none exists, return **NO REQUEST**.
2. If the response CSV named in the request already exists, return **ALREADY ANSWERED**. Never overwrite it.
3. For each `REF | AFFECTED_RECORDS | ATP_STAGE | BUILDING | SUBCON | MASTER_SAYS -> OTHER_LIST_SAYS` line, Priority 1 first:
   - Match exactly first. Fall back to a match that ignores case, whitespace and revision suffixes (`-00`, `-01`), and note the fallback in Notes with lower confidence.
   - Report the **recorded** A/B/C/UR code. Never infer an outcome from a date alone.
   - Count revisions, and report the latest outcome separately. A reversal (rejected then approved, or the reverse) must be stated explicitly.
   - Use `NOT-FOUND` when the reference appears nowhere, and `NO-REFERENCE` for `(no ref)`.
4. Write the CSV with these columns:
   `Ref,Priority,AtpLogOutcome,OutcomeDate,RevisionsFound,LaterResubmission,LaterOutcome,LaterDate,Confidence,Notes`
   End with a `BATCH-SUMMARY` row.
5. Email the Priority 1 table and the summary counts to negm.ahmed.bl@gmail.com with the subject `RAC ATP Verification — batch <id> — <n> refs adjudicated`.

Report the outcome as **ANSWERED | ALREADY ANSWERED | NO REQUEST | BLOCKED | FAILED**.

## Integrity rule

These outputs decide whether commissioning progress is credited. An honest **UNCLEAR / LOW confidence** beats a confident guess, every time.
