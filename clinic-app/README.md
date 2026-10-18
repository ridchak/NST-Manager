# Premier Weight Management and Lifestyle

Practice management system

A full-stack web application for running a weight-management practice.

## Features

- **Patient Management** — Demographics, medical history, search/filter
- **Progress Tracking** — Weight, BMI, measurements, blood work with trend charts  
- **Appointment Scheduling** — Calendar view, booking, status management
- **Intake Forms** — Digital intake, medical history, consent, HIPAA forms
- **Insurance Authorization** — Auth requests, status tracking, expiry alerts
- **Phone System** — RingCentral Office@Hand call log, SMS, voicemail
- **eClinicalWorks Integration** — Patient and appointment sync

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS |
| Backend | Express.js + TypeScript |
| Database | SQLite (via Prisma ORM) |
| Charts | Recharts |
| Calendar | React Big Calendar |
| Auth | JWT |

## Quick Start

### Prerequisites
- Node.js 18+

### Setup

```bash
cd clinic-app

# Install dependencies
cd server && npm install
cd ../client && npm install

# Configure server
cd server
cp .env.example .env
# Edit .env and set JWT_SECRET at minimum

# Initialize database
npx prisma generate
npx prisma migrate dev --name init
npm run db:seed

# Start development servers (in separate terminals)
npm run dev          # server on :4000
cd ../client && npm run dev   # client on :5173
```

### Demo logins (development only)

| Access level | Email | Password |
|-------|-------|----------|
| Superuser | admin@premier-demo.example | admin123 |
| Admin (prescriber) | dr.smith@premier-demo.example | provider123 |
| User | frontdesk@premier-demo.example | frontdesk123 |

These exist only in the demo seed, which refuses to run when `NODE_ENV=production`.
For a real deployment create your own superuser instead:

```bash
cd server
SUPERUSER_PASSWORD="a-long-passphrase" npm run create-superuser -- you@yourclinic.com "Your Name"
```

## Access levels and sign-in lockout

| Level | Can do |
|-------|--------|
| **User** | View records and add new ones. Cannot edit existing records or delete. (May cancel an appointment and mark staff messages done.) |
| **Admin** | Everything a user can do, plus edit existing records, including insurance authorizations. |
| **Superuser** | Full control: delete records, add/deactivate accounts, change access levels, reset passwords, unlock accounts. |

- The rules live in one short file, `server/src/services/access.ts`, and are enforced on every API request.
- Access levels are checked against the database on each request, so a change or deactivation takes effect immediately.
- **5 failed sign-ins lock the account for 30 minutes** (`LOGIN_MAX_ATTEMPTS`, `LOGIN_LOCK_MINUTES`). A locked account refuses even the correct password. A superuser can unlock it at **Settings → Users**.
- Passwords must be at least 10 characters. Sessions last 12 hours.
- Manage accounts at **Settings → Users** (superuser only). Accounts with appointment history are deactivated rather than deleted.

## Practice details and staff numbers

A superuser edits the practice's address, phone, fax, time zone and **office hours** at **Settings → Practice**, and each
provider's extension and cell number at **Settings → Users → Phone numbers**. Nothing personal is kept in the code.

> **Keep this repository private.** It was forked from a public project, so check it under GitHub → Settings → Danger Zone →
> *Change visibility*. Never commit `.env` files, staff phone numbers, or exports from the audit log.

## Branding

- **Logo:** the icon mark only (no wordmark), as vector files in `client/public/`: `logo.svg` (full color, for light
  backgrounds), `logo-reversed.svg` (white, for the navy sidebar) and `favicon.svg` (browser tab). Replace those files
  to change the logo; nothing else needs editing.
- **Colors:** from the brand sheet: navy `#075DA9`, light blue `#078ACB`, magenta `#C9427E`, yellow `#FDCB41`.
  They are defined once in `client/tailwind.config.js`; the app's blue is mapped to the brand blues, so buttons,
  links and highlights follow automatically.
- **Name:** `CLINIC_NAME` (server) and `VITE_CLINIC_NAME` (web app).

## Audit log

Superusers can see who viewed or changed which patient's record, and when, at **Audit Log**. It stores no
patient details, cannot be edited or deleted, and can prove it has not been tampered with. See
[docs/AUDIT_LOG.md](docs/AUDIT_LOG.md) for exactly what is and is not covered.

## Integrations

### RingCentral Office@Hand
Set in `server/.env`:
```
RC_CLIENT_ID=your_client_id
RC_CLIENT_SECRET=your_client_secret
RC_SERVER_URL=https://platform.ringcentral.com
RC_USERNAME=your_username
RC_PASSWORD=your_password
RC_EXTENSION=your_extension
```

### eClinicalWorks (eCW)
Set in `server/.env`:
```
ECW_BASE_URL=https://your-ecw-instance.com
ECW_USERNAME=your_username
ECW_PASSWORD=your_password
```

> Both integrations fall back to realistic mock data when not configured.

## Project Structure

```
clinic-app/
├── client/          # React frontend
│   └── src/
│       ├── pages/   # Dashboard, Patients, Schedule, etc.
│       ├── components/
│       └── lib/     # API client, utilities
└── server/          # Express backend
    ├── src/
    │   ├── routes/  # REST API endpoints
    │   └── services/ # RingCentral, eCW integrations
    └── prisma/      # Database schema & seed
```

## Phone assistant

See [docs/PHONE_ASSISTANT.md](docs/PHONE_ASSISTANT.md).

## Production (single server)

```bash
cd client && npm ci && npm run build      # builds the web app
cd ../server && npm ci && npx prisma migrate deploy && npm run build
JWT_SECRET=... DATABASE_URL=... ASSISTANT_API_KEY=... npm start
```
The server serves the web app and the API on one port. `GET /api/health` is the health check.
