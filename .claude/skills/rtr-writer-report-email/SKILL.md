---
name: rtr-writer-report-email
description: Fix spec and runbook for the "RTR T&C Writer - batch report" email flood from the Power Automate flow "RTR - T&C Tracker Writer (PROD)" — gate the Send email step on the script's sendEmail flag or a failed run, use the script's subject and HTML body, and confirm Flow B queue-file idempotency. Use when the user reports RTR Writer emails flooding Outlook, raw JSON/HTML in RTR Writer emails, duplicate RTR queue processing, or asks to apply or explain the RTR Writer email fix.
---

# RTR Writer Report Email — Fix Spec

Project: KSIA RTR (ICAD contractor, TABCOMM CxA, Parsons–SAPL). Production asset.

## 0. Production guard (read first)

- **RTR - T&C Tracker Writer (PROD)**, the live T&C tracker and the production Office Scripts are **read-only**.
- Apply this fix only after the user writes the exact words **"Apply the email fix"** and names who operates production (Claude or GPT). Otherwise deliver the steps in section 4 and stop.
- Before editing: take a rollback point. **Version history** is only available for flows stored in a Solution (new designer → Version history; versions are timestamps). The Writer flow is not assumed to be in a Solution, so the rollback point is an **exported package**: flow details page → **Export ▾ → Package (.zip)** → name `RTR_Writer_PROD_Backup_<yyyymmdd>` → Export → keep the ZIP. Record the ZIP name in the change log. To roll back: Import → Package (.zip) → *Update* the existing flow.

## 1. Symptom

Outlook receives about 15 emails a day titled `RTR T&C Writer - batch report`. Each body is a raw `Script result: {…}` dump of JSON and HTML.

## 2. Root cause

| # | Finding | Evidence |
|---|---|---|
| 1 | The Writer flow's **Send an email** step runs after **every** `Run script` call, unconditionally. | Email count matches the number of runs. |
| 2 | **Flow C** calls the Writer once per correspondence event, so every event produces an email. | One email per event in the inbox timestamps. |
| 3 | The script already returns `sendEmail:false` when there is nothing to report, plus a ready `subject` and `htmlBody`. The flow ignores all three and sends `string(body)`. | Body text starts `Script result: {"sendEmail":false,…}`. |

## 3. Fix (flow design)

Insert a **Condition** between `Run_script` and `Send_an_email_(V2)`. Put the email in the **If yes** branch; leave **If no** empty.

Condition (advanced mode expression):

```
@or(equals(outputs('Run_script')?['body/result']?['sendEmail'], true), not(equals(outputs('Run_script')?['statusCode'], 200)))
```

Configure the Condition's **Run after** to: is successful, has failed, has timed out. A failed script must still reach the email.

Send email fields:

| Field | Expression |
|---|---|
| Subject | `coalesce(outputs('Run_script')?['body/result']?['subject'], 'RTR T&C Writer - FAILED run')` |
| Body (Is HTML = Yes) | `coalesce(outputs('Run_script')?['body/result']?['htmlBody'], string(outputs('Run_script')?['body']))` |

Result: an email is sent only when the script asks for one, or when the run failed. A failure email still carries the raw body for diagnosis.

## 4. Steps for the operator

1. Power Automate → **RTR - T&C Tracker Writer (PROD)** → details page → **Export ▾ → Package (.zip)** named `RTR_Writer_PROD_Backup_<yyyymmdd>`. This ZIP is the rollback point.
2. Edit → under `Run script`, **+ New step → Condition** → Edit in advanced mode → paste the expression in section 3.
3. Set the Condition's Run after (section 3).
4. Drag `Send an email (V2)` into **If yes**.
5. Replace Subject and Body with the section 3 expressions. Set Is HTML = Yes.
6. Save. Do not change the script, the tracker or the trigger.
7. Test: run once with a no-change event. Expect **no** email and a green run. Then run a real batch. Expect **one** formatted email.
8. Record in the change log: date, operator, flow version, test result.

## 5. Flow B idempotency (open item, confirm before commit = Yes)

Flow B processed queue file `B_20261105_1705.json` twice (17:05 and 17:30 on 5-Nov-2026).

Before any run with commit = Yes:
- [ ] Confirm Flow B records each processed queue filename (register list or moved to a `processed/` folder) **before** commit.
- [ ] Confirm a second pickup of the same file returns NO ACTION and writes nothing to the tracker.
- [ ] Check the tracker for duplicate rows from the 17:30 run of `B_20261105_1705.json` and report them; do not delete without the user's approval.
- [ ] If no guard exists, raise it as a separate production change with its own authorisation.

## 6. Done when

- Inbox receives only actionable or failure emails, formatted as HTML.
- Run history shows green runs with the email step skipped on `sendEmail:false`.
- Flow B duplicate pickup is confirmed guarded or logged as an open risk with an owner.
