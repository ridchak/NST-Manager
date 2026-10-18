-- AlterTable
ALTER TABLE "InsuranceInfo" ADD COLUMN "copay" REAL;

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN "balance" REAL;
ALTER TABLE "Patient" ADD COLUMN "balanceUpdatedAt" DATETIME;
ALTER TABLE "Patient" ADD COLUMN "nexhealthId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN "cellPhone" TEXT;
ALTER TABLE "User" ADD COLUMN "extension" TEXT;

-- CreateTable
CREATE TABLE "StaffMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "patientId" TEXT,
    "type" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "source" TEXT NOT NULL DEFAULT 'assistant',
    "callId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    CONSTRAINT "StaffMessage_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CallLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "callId" TEXT NOT NULL,
    "callerPhone" TEXT,
    "patientId" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "events" TEXT NOT NULL DEFAULT '[]',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CallLog_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "CallLog_callId_key" ON "CallLog"("callId");
