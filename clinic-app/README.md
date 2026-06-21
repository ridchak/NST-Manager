# LifeStart Weight Loss Clinic Management System

A full-stack web application for managing weight loss clinic operations.

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

### Default Login Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@clinic.com | admin123 |
| Provider | provider@clinic.com | provider123 |

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
