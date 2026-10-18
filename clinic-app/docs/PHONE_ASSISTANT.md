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
| Schedule (existing patients) | Offers up to 3 open times and books a new or follow-up visit in NexHealth. If none suit the caller, or they want something sooner, to **reschedule**, or to see a **different provider** than the one booked, it connects **scheduling (ext 102)**. It never moves or cancels an existing appointment itself. |
| New patient | Collects name, date of birth and best phone number, records a "new patient" request for the scheduling team, and offers a live transfer to **scheduling (ext 102)** during office hours. |
| Refill, office open | Seen ≤14 days ago **and** has a follow-up → message to staff, patient told it was sent. Otherwise, if the next visit is more than 21 days away or none: asks if it is a GLP-1; if yes → offers an additional sooner visit (it books it) or connecting scheduling to move the existing one, and books one if none exists. |
| Refill, office closed | Recorded and queued for staff. |
| Side effects | Emergency wording → tells caller to call 911 (and flags staff urgently). Office open → message to staff. Office closed → mild known symptoms get over-the-counter advice; anything else → book a visit or go to urgent care. |
| Prior authorization | Always records the request for staff (plus an email notice if configured). During office hours it also offers to connect **medications and prior authorization (ext 103)**. |
| Medication question | Office open: transfers to **medications and prior authorization (ext 103)**. Office closed: transfers to the prescriber's **cell phone**. |
| Billing question | Reads the recorded balance and copay (never takes payment). For anything more, office open: transfers to **billing (ext 104)**; closed: records a call-back. |
| Anything else / asks for a person | Office open: transfers to the **front desk (ext 101)**; closed: records a call-back. |
| Voicemail trouble | Texts the caller via Office@Hand and notes a text preference for staff. |

### Call routing

| Department | Extension | Gets |
|---|---|---|
| Front desk | 101 | general questions, anything else, someone who asks for a person |
| Scheduling | 102 | new patients, a sooner appointment than the times offered, rescheduling, a different provider |
| Medications and prior authorization | 103 | medication questions, prior authorizations |
| Billing | 104 | billing questions |

During office hours the assistant transfers to the extension. **After hours nobody can answer, so it records a call-back message** for that
department (shown in **Messages**) and tells the caller when the office reopens. The extensions are edited at **Settings → Practice**.

### Rules I had to assume (please review)
1. **Refill, seen >2 weeks ago but the next visit is within 3 weeks** → sent to staff (not asked about GLP-1).
2. **Non-GLP-1 refill that falls into the "far or no appointment" case** → sent to staff.
3. **Refill after hours** → queued for the next business day.
4. **Medication questions during office hours go to ext 103**, not to the individual prescriber's extension. After hours they go to the
   prescriber's cell. The providers' own extensions (106, 107, 108) are stored but not currently used for transfers.
5. **New patients are not booked directly.** The assistant collects their details and hands them to scheduling (ext 102). Booking a brand-new
   patient needs a patient record created in NexHealth first, which should be verified in the NexHealth sandbox before it is automated.
6. **OTC advice wording** (`MILD_SYMPTOMS` in `server/src/services/protocol.ts`) is generic; the prescribing physician should edit or approve it.
7. **Emergency keyword list** (`EMERGENCY_PATTERNS`, same file) should be reviewed clinically. The assistant errs toward "call 911".
All rules live in `protocol.ts` and are covered by tests (`npm test`).

## Setup

1. **Practice details.** Address, phone, fax, time zone and office hours are managed in the app by a superuser at
   **Settings → Practice** (they are pre-filled for Premier Weight Management and Lifestyle: Lombard, IL, Central time).
   The assistant uses the hours to decide whether the office is open, so update them for holidays and schedule changes.
   The **call-routing extensions** (101 front desk, 102 scheduling, 103 medications and prior authorization, 104 billing) and the
   notification email are set on the same screen. **Server env** (`server/.env`, see `.env.example`): `ASSISTANT_API_KEY` (a long random string).
   The voice platform must be able to transfer a call to an office extension (for example a warm transfer to an Office@Hand extension).
2. **NexHealth.** The Synchronizer API does not use a login or password. It needs an **API key**, your **subdomain**, and your **location ID**
   from NexHealth. Ask NexHealth support (or your account manager) for Synchronizer API access, then put the values in `server/.env` as
   `NEXHEALTH_API_KEY`, `NEXHEALTH_SUBDOMAIN`, `NEXHEALTH_LOCATION_ID`, plus `NEXHEALTH_PROVIDER_IDS` (the three providers) and
   `NEXHEALTH_APPT_TYPE_NEW` / `NEXHEALTH_APPT_TYPE_FOLLOWUP`. **Never** paste the key or any password into chat, email or GitHub.
   Leave them blank to run against the app's own database for testing.
3. **Staff accounts and numbers.** At **Settings → Users** add each provider (their work email is their login), mark them as a prescriber,
   and use **Phone numbers** to enter their office extension and cell phone. After hours, medication questions go to the prescriber's cell phone.
   Cell numbers are stored in the database, never in the code.
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
- **HIPAA.** Your agreement with NexHealth covers that vendor. You still need signed BAAs with the voice platform
  and the hosting provider, and an encrypted managed database with backups (not the SQLite file). Staff access
  levels, sign-in lockout and an audit log (including every assistant call) are built; see the README and
  `docs/AUDIT_LOG.md`. The staff email notification intentionally contains no clinical details.
- **Run it in production with one server instance.** Call sessions (verification state) are kept in memory.
- **Clinical review.** Have the physician test call every scenario and sign off on the wording.

## Testing

```
cd server
npm test          # protocol rules + NexHealth adapter (stubbed)
npm run test:int  # 18 end-to-end call scenarios on a throwaway database
```
