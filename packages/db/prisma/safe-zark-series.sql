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

-- ZarkGame already contains the 40 built-in games in production. Prisma cannot
-- add a required @updatedAt column to those rows unless they are backfilled
-- first. This migration is idempotent and preserves every existing record.
DO $zark_game_updated_at_migration$
BEGIN
  IF to_regclass('"ZarkGame"') IS NOT NULL THEN
    ALTER TABLE "ZarkGame" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);
    UPDATE "ZarkGame" SET "updatedAt" = CURRENT_TIMESTAMP WHERE "updatedAt" IS NULL;
    ALTER TABLE "ZarkGame" ALTER COLUMN "updatedAt" SET NOT NULL;
  END IF;
END
$zark_game_updated_at_migration$;

-- Preserve all existing questions while making legacy duplicate source keys
-- compatible with the new uniqueness guarantee. PostgreSQL permits multiple
-- NULL values in a unique index, and the canonical (oldest) key remains intact
-- so the built-in question synchronizer continues to recognize it.
DO $game_question_source_key_migration$
BEGIN
  IF to_regclass('"GameQuestion"') IS NOT NULL THEN
    ALTER TABLE "GameQuestion" ADD COLUMN IF NOT EXISTS "sourceKey" TEXT;

    WITH ranked_keys AS (
      SELECT "id", ROW_NUMBER() OVER (
        PARTITION BY "gameId", "sourceKey"
        ORDER BY "createdAt" ASC, "id" ASC
      ) AS duplicate_number
      FROM "GameQuestion"
      WHERE "sourceKey" IS NOT NULL
    )
    UPDATE "GameQuestion" AS question
    SET "sourceKey" = NULL
    FROM ranked_keys
    WHERE question."id" = ranked_keys."id"
      AND ranked_keys.duplicate_number > 1;

    -- A legacy non-unique index with Prisma's target name would make
    -- CREATE INDEX IF NOT EXISTS a no-op. Remove only that incompatible index.
    IF EXISTS (
      SELECT 1
      FROM pg_class AS index_class
      JOIN pg_namespace AS index_namespace ON index_namespace.oid = index_class.relnamespace
      JOIN pg_index AS index_metadata ON index_metadata.indexrelid = index_class.oid
      WHERE index_namespace.nspname = current_schema()
        AND index_class.relname = 'GameQuestion_gameId_sourceKey_key'
        AND index_metadata.indisunique = FALSE
    ) THEN
      DROP INDEX "GameQuestion_gameId_sourceKey_key";
    END IF;

    CREATE UNIQUE INDEX IF NOT EXISTS "GameQuestion_gameId_sourceKey_key"
      ON "GameQuestion"("gameId", "sourceKey");
  END IF;
END
$game_question_source_key_migration$;

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
-- Keeps onboarding completion with the Discord account across browsers/devices.
DO $user_tutorial_migration$
BEGIN
  IF to_regclass('"User"') IS NOT NULL THEN
    ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "tutorialCompleted" BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "tutorialCompletedAt" TIMESTAMP(3);
    ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "tutorialVersion" INTEGER NOT NULL DEFAULT 0;
  END IF;
END
$user_tutorial_migration$;
