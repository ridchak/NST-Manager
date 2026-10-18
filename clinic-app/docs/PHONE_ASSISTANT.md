# AI Phone Assistant

An AI voice assistant that answers the clinic's calls (AT&T Office@Hand), uses the
NexHealth Synchronizer API for patient and scheduling data, and hands work to staff
through the **Messages** page of this app.

## How the pieces fit

```
Patient ──► Office@Hand number ──► (forward / SIP) ──► Voice-AI platform
                                                         │  speech ⇄ text, follows the system prompt
                                                         ▼
                                   POST /api/assistant/tools/<tool>   (header x-assistant-key)
                                                         │
                          ┌──────────────────────────────┴─────────────┐
                          ▼                                            ▼
                NexHealth Synchronizer API                  Clinic app database
          (patients, balance, visits, slots, booking)   (staff messages, call log, copays)
```

This app is the **brain and the rules**. It does not do speech itself. You need a voice-AI
platform (Vapi, Retell, Twilio, or similar) to answer the call, listen, talk, and call the tools
below. The platform must sign a HIPAA BAA with you.

## What the assistant does

| Caller need | Behavior |
|---|---|
| Identity | Verifies date of birth against the caller-ID number's patient record. 3 failed tries → front desk. Nothing is disclosed before verification. |
| Check-in | Finds today's appointment and sends a "checked in" message to staff. |
| Balance / copay | Reads the **recorded** balance and copay. Says it may not include recent payments. **Never collects payment.** |
| Schedule new / follow-up | Offers up to 3 open times, books in NexHealth. |
| Refill, office open | Seen ≤14 days ago **and** has a follow-up → message to staff, patient told it was sent. Otherwise, if the next visit is more than 21 days away or none: asks if it is a GLP-1; if yes → offers a new visit or moving the existing one sooner, or books one if none exists. |
| Refill, office closed | Recorded and queued for staff. |
| Side effects | Emergency wording → tells caller to call 911 (and flags staff urgently). Office open → message to staff. Office closed → mild known symptoms get over-the-counter advice; anything else → book a visit or go to urgent care. |
| Prior authorization | Message to staff (and an email notification if SMTP is set). |
| Medication clarification | Transfers to the prescriber's extension (office open) or cell (office closed). |
| Voicemail trouble | Texts the caller via Office@Hand and notes a text preference for staff. |

### Rules I had to assume (please review)
1. **Refill, seen >2 weeks ago but the next visit is within 3 weeks** → sent to staff (not asked about GLP-1).
2. **Non-GLP-1 refill that falls into the "far or no appointment" case** → sent to staff.
3. **Refill after hours** → queued for the next business day.
4. **OTC advice wording** (`MILD_SYMPTOMS` in `server/src/services/protocol.ts`) is generic; the prescribing physician should edit or approve it.
5. **Emergency keyword list** (`EMERGENCY_PATTERNS`, same file) should be reviewed clinically. The assistant errs toward "call 911".
All rules live in `protocol.ts` and are covered by tests (`npm test`).

## Setup

1. **Server env** (`server/.env`, see `.env.example`): `ASSISTANT_API_KEY` (long random string),
   `OFFICE_HOURS`, `OFFICE_TZ`, `FRONT_DESK_NUMBER`, `CLINIC_NAME`.
2. **NexHealth**: `NEXHEALTH_API_KEY`, `NEXHEALTH_SUBDOMAIN`, `NEXHEALTH_LOCATION_ID`,
   `NEXHEALTH_PROVIDER_IDS`, `NEXHEALTH_APPT_TYPE_NEW`, `NEXHEALTH_APPT_TYPE_FOLLOWUP`.
   Leave blank to run on the app's own database for testing.
3. **Prescriber transfers**: set an extension and cell on each provider user, or use
   `PRESCRIBER_TRANSFERS` (JSON keyed by NexHealth provider id).
4. **Voice platform**: create an assistant, paste the text from `GET /api/assistant/prompt`
   as its system prompt, register the tools from `GET /api/assistant/tools`, and point each
   tool at `POST https://<your-domain>/api/assistant/tools/<name>` with header
   `x-assistant-key: <ASSISTANT_API_KEY>`. Pass the call's unique id as `callId` and the
   caller-ID as `callerPhone`.
5. **Office@Hand**: forward the main line (or an after-hours/overflow rule) to the voice
   platform's number. Texting uses `RC_*` credentials plus `RC_SMS_FROM`.
6. Staff work the **Messages** page; every assistant call appears in **Assistant call log**.

## Before real patients call: verify these

- **NexHealth endpoints.** `server/src/services/nexhealth.ts` was written from NexHealth's public
  documentation and tested only against a stub. Run each call in the NexHealth sandbox
  (patient search by phone, balance field, appointments, slots, booking, cancel) and fix any
  field-name differences. Confirm with NexHealth that bookings write back to eClinicalWorks on your plan.
- **Balance.** The assistant reads NexHealth's recorded balance; it does not update or post payments.
- **eCW refill requests.** Not created in eCW automatically (not possible through NexHealth).
  Staff enter them from the message. If you have eCW API access, this is the place to add it.
- **Check-in** notifies staff; it does not mark the patient arrived in eCW.
- **HIPAA.** Need signed BAAs with NexHealth, the voice platform, and the hosting provider; encrypted
  database/backups; a managed (not SQLite-file) database; staff roles and audit logging in this app.
  The staff email notification intentionally contains no clinical details.
- **Run it in production with one server instance.** Call sessions (verification state) are kept in memory.
- **Clinical review.** Have the physician test call every scenario and sign off on the wording.

## Testing

```
cd server
npm test          # protocol rules + NexHealth adapter (stubbed)
npm run test:int  # 18 end-to-end call scenarios on a throwaway database
```
