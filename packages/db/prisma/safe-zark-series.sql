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
