CREATE TABLE "BotChatRegion" (
    "botChatId" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    CONSTRAINT "BotChatRegion_pkey" PRIMARY KEY ("botChatId", "regionId")
);

CREATE INDEX "BotChatRegion_regionId_idx" ON "BotChatRegion"("regionId");

ALTER TABLE "BotChatRegion"
ADD CONSTRAINT "BotChatRegion_botChatId_fkey"
FOREIGN KEY ("botChatId") REFERENCES "BotChat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BotChatRegion"
ADD CONSTRAINT "BotChatRegion_regionId_fkey"
FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE CASCADE ON UPDATE CASCADE;
