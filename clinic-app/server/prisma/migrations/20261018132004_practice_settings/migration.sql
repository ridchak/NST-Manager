-- CreateTable
CREATE TABLE "PracticeSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "street" TEXT NOT NULL,
    "suite" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "zip" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "fax" TEXT,
    "timezone" TEXT NOT NULL,
    "hours" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);
