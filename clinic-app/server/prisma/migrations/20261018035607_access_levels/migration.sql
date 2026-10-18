-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'user',
    "isProvider" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "failedLogins" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" DATETIME,
    "extension" TEXT,
    "cellPhone" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Map the old roles onto the new access levels: admin -> superuser, provider -> admin (+ prescriber flag), staff/other -> user.
INSERT INTO "new_User" ("cellPhone", "createdAt", "email", "extension", "id", "name", "password", "role", "isProvider")
SELECT "cellPhone", "createdAt", "email", "extension", "id", "name", "password",
  CASE "role" WHEN 'admin' THEN 'superuser' WHEN 'provider' THEN 'admin' ELSE 'user' END,
  CASE WHEN "role" = 'provider' THEN 1 ELSE 0 END
FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
