CREATE TABLE "ServiceCenter" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServiceCenter_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ServiceCenter_code_key" ON "ServiceCenter"("code");

CREATE TABLE "UserServiceCenter" (
    "userId" TEXT NOT NULL,
    "serviceCenterId" TEXT NOT NULL,
    CONSTRAINT "UserServiceCenter_pkey" PRIMARY KEY ("userId", "serviceCenterId")
);

CREATE INDEX "UserServiceCenter_serviceCenterId_idx" ON "UserServiceCenter"("serviceCenterId");

CREATE TABLE "BotChatServiceCenter" (
    "botChatId" TEXT NOT NULL,
    "serviceCenterId" TEXT NOT NULL,
    CONSTRAINT "BotChatServiceCenter_pkey" PRIMARY KEY ("botChatId", "serviceCenterId")
);

CREATE INDEX "BotChatServiceCenter_serviceCenterId_idx" ON "BotChatServiceCenter"("serviceCenterId");

INSERT INTO "ServiceCenter" ("id", "code", "name")
VALUES ('00000000-0000-4000-8000-000000000001', 'UNASSIGNED', 'Unassigned legacy sites')
ON CONFLICT ("code") DO NOTHING;

ALTER TABLE "Site" ADD COLUMN "serviceCenterId" TEXT;
UPDATE "Site"
SET "serviceCenterId" = (SELECT "id" FROM "ServiceCenter" WHERE "code" = 'UNASSIGNED')
WHERE "serviceCenterId" IS NULL;
ALTER TABLE "Site" ALTER COLUMN "serviceCenterId" SET NOT NULL;

CREATE INDEX "Site_serviceCenterId_siteIdText_idx" ON "Site"("serviceCenterId", "siteIdText");

ALTER TABLE "UserServiceCenter" ADD CONSTRAINT "UserServiceCenter_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserServiceCenter" ADD CONSTRAINT "UserServiceCenter_serviceCenterId_fkey"
FOREIGN KEY ("serviceCenterId") REFERENCES "ServiceCenter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BotChatServiceCenter" ADD CONSTRAINT "BotChatServiceCenter_botChatId_fkey"
FOREIGN KEY ("botChatId") REFERENCES "BotChat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BotChatServiceCenter" ADD CONSTRAINT "BotChatServiceCenter_serviceCenterId_fkey"
FOREIGN KEY ("serviceCenterId") REFERENCES "ServiceCenter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Site" ADD CONSTRAINT "Site_serviceCenterId_fkey"
FOREIGN KEY ("serviceCenterId") REFERENCES "ServiceCenter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

DROP TABLE "BotChatRegion";
