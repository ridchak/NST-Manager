# Audit Log

A record of who accessed or changed what, and when. Open it as a superuser at **Audit Log** in the
menu, or from a patient's chart ("Who accessed this chart?").

## What is recorded

| Event | Recorded |
|---|---|
| Sign-in | success, wrong password (with the running count), lockout, attempts on a locked or deactivated account, unknown emails, sign-out, password changes |
| Viewing records | every authenticated request: who, what kind of record, which patient (for single records and filtered lists), when, from which address and browser |
| Changes | create / edit / delete / cancel, plus the **names** of the fields changed |
| Refused requests | someone tried something their access level does not allow |
| Account management | account created, level changed, deactivated, password reset, unlocked, deleted |
| Voice assistant | every tool call, by call id, with the patient it was verified as; wrong-key attempts |
| The audit log itself | viewing, verifying and exporting it |

## What is deliberately NOT recorded

No patient details, ever: no field values, search text, notes, request or response bodies, phone numbers,
passwords, or anything said on a call. The log says *"Dr. Smith edited the notes field on Jennifer
Martinez's chart at 11:54"*, not what the note said. Because of this the log is safe to export and share
with an auditor. (The patient's name on screen is looked up live from the patient record.)

## How it is protected

- **Append-only.** Database triggers reject any edit or delete of an entry (tested).
- **Tamper-evident.** Each entry stores a fingerprint covering the previous entry's fingerprint. "Verify integrity"
  recomputes the chain and names the first entry that was altered or removed (tested for both cases).
- **Superuser-only**, and reading it is itself logged.
- CSV export neutralises spreadsheet-formula tricks.

## Limits you should know about

- **A determined database administrator could rewrite history.** The triggers and the chain stop casual or
  accidental edits and make tampering detectable, but someone with full control of the database could drop the
  triggers and recompute every fingerprint. Defences: use a managed database with restricted roles, and keep
  periodic off-site copies of the CSV export. Comparing a saved copy to the live log reveals any rewrite.
- **Deleting the newest entries is not detectable by the chain alone** (nothing follows them). Off-site exports cover this too.
- **It logs what happens through this application.** Anyone reading the database file directly, or the
  hosting provider's backups, is outside what the app can see.
- **List screens** record that a list was viewed and which filters were used (names only), not every
  patient who appeared on it. Opening a single chart is recorded against that patient.
- If an audit write fails, the user's action still completes but the failure is printed to the server log
  (`AUDIT WRITE FAILED`). Watch your hosting logs for that line.
- **Retention.** Nothing is ever purged automatically. HIPAA generally expects security documentation to be kept for
  6 years; confirm the exact requirement with your compliance advisor.
- **Hosting.** Behind a proxy set `TRUST_PROXY=1` so the real client address is recorded. When you move from SQLite to
  PostgreSQL, recreate the append-only protection (revoke UPDATE/DELETE on `"AuditLog"`, or use a trigger); the SQLite
  triggers in the migration do not carry over.
- This is a technical control, not a compliance certificate. HIPAA compliance also depends on your policies, training,
  hosting agreements and how the system is operated.
