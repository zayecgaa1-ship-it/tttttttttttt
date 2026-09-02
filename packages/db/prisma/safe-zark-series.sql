DO $zark_series_migration$
BEGIN
  IF to_regclass('"ZarkMatch"') IS NOT NULL THEN
    ALTER TABLE "ZarkMatch" ADD COLUMN IF NOT EXISTS "seriesId" TEXT;
    ALTER TABLE "ZarkMatch" ADD COLUMN IF NOT EXISTS "channelId" TEXT;
    ALTER TABLE "ZarkMatch" ADD COLUMN IF NOT EXISTS "activeChannelKey" TEXT;
    ALTER TABLE "ZarkMatch" ADD COLUMN IF NOT EXISTS "roundNumber" INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE "ZarkMatch" ADD COLUMN IF NOT EXISTS "totalRounds" INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE "ZarkMatch" ADD COLUMN IF NOT EXISTS "lockExpiresAt" TIMESTAMP(3);

    UPDATE "ZarkMatch" SET "seriesId" = "id" WHERE "seriesId" IS NULL;

    CREATE UNIQUE INDEX IF NOT EXISTS "ZarkMatch_activeChannelKey_key" ON "ZarkMatch"("activeChannelKey");
    DROP INDEX IF EXISTS "ZarkMatch_seriesId_roundNumber_idx";
    CREATE UNIQUE INDEX IF NOT EXISTS "ZarkMatch_seriesId_roundNumber_key" ON "ZarkMatch"("seriesId", "roundNumber");
    CREATE INDEX IF NOT EXISTS "ZarkMatch_channelId_startedAt_idx" ON "ZarkMatch"("channelId", "startedAt");
  END IF;
END
$zark_series_migration$;

-- Early deployments used five minutes for an empty Voice channel. The room
-- contract is now ten minutes, matching the website leave flow and the member
-- warning shown by Zark. Preserve any custom value that is not the old default.
DO $zark_room_grace_migration$
BEGIN
  IF to_regclass('"GuildSettings"') IS NOT NULL AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'GuildSettings' AND column_name = 'voiceEmptyGraceMinutes'
  ) THEN
    UPDATE "GuildSettings"
    SET "voiceEmptyGraceMinutes" = 10
    WHERE "voiceEmptyGraceMinutes" = 5;
  END IF;
END
$zark_room_grace_migration$;
