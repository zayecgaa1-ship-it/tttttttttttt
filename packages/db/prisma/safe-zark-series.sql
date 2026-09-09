DO $moderation_migration$
BEGIN
  IF to_regclass('"SecuritySettings"') IS NOT NULL THEN
    ALTER TABLE "SecuritySettings" ADD COLUMN IF NOT EXISTS "rolePolicies" JSONB NOT NULL DEFAULT '[]';
    ALTER TABLE "SecuritySettings" ADD COLUMN IF NOT EXISTS "profanityEnabled" BOOLEAN NOT NULL DEFAULT true;
    ALTER TABLE "SecuritySettings" ADD COLUMN IF NOT EXISTS "profanityNotifyOwner" BOOLEAN NOT NULL DEFAULT true;
    ALTER TABLE "SecuritySettings" ADD COLUMN IF NOT EXISTS "profanityLogEnabled" BOOLEAN NOT NULL DEFAULT true;
    ALTER TABLE "SecuritySettings" ADD COLUMN IF NOT EXISTS "profanityCustomWords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
  END IF;
  IF to_regclass('"AdminBroadcast"') IS NOT NULL THEN
    ALTER TABLE "AdminBroadcast" ADD COLUMN IF NOT EXISTS "targetChannelId" TEXT;
  END IF;
END
$moderation_migration$;

DO $zark_series_migration$
BEGIN
  IF to_regclass('"ZarkMatch"') IS NOT NULL THEN
    ALTER TABLE "ZarkMatch" ADD COLUMN IF NOT EXISTS "attemptedUserIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
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

-- Additive upgrade: existing rooms/preferences remain unclassified.
DO $lfg_platform_migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LfgPlatform') THEN
    CREATE TYPE "LfgPlatform" AS ENUM ('MOBILE', 'PC', 'PLAYSTATION');
  END IF;
  IF to_regclass('"LfgRoom"') IS NOT NULL THEN
    ALTER TABLE "LfgRoom" ADD COLUMN IF NOT EXISTS "platform" "LfgPlatform";
  END IF;
  IF to_regclass('"UserGamePreference"') IS NOT NULL THEN
    ALTER TABLE "UserGamePreference" ADD COLUMN IF NOT EXISTS "platform" "LfgPlatform";
    CREATE INDEX IF NOT EXISTS "UserGamePreference_lfgGameId_platform_interestStatus_notifi_idx"
      ON "UserGamePreference"("lfgGameId", "platform", "interestStatus", "notificationsEnabled");
  END IF;
  IF to_regclass('"LfgGameCatalog"') IS NOT NULL THEN
    ALTER TABLE "LfgGameCatalog" ADD COLUMN IF NOT EXISTS "platforms" "LfgPlatform"[] NOT NULL DEFAULT ARRAY[]::"LfgPlatform"[];
    UPDATE "LfgGameCatalog" SET "name" = 'PUBG Steam' WHERE "slug" = 'pubg' AND "name" = 'PUBG: Battlegrounds';
  END IF;
END
$lfg_platform_migration$;

-- Extend the existing availability system with presence, privacy and guild controls.
DO $availability_presence_migration$
BEGIN
  IF to_regclass('"User"') IS NOT NULL THEN
    ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "timezone" TEXT NOT NULL DEFAULT 'Asia/Jerusalem';
    ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "timezoneConfigured" BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastActiveAt" TIMESTAMP(3);
    ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "voiceActive" BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "showFreeTime" BOOLEAN NOT NULL DEFAULT TRUE;
    ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "showStudyTime" BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "showSleepTime" BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "showLastActive" BOOLEAN NOT NULL DEFAULT TRUE;
    ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "showCurrentStatus" BOOLEAN NOT NULL DEFAULT TRUE;
    ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mentionStatusEnabled" BOOLEAN NOT NULL DEFAULT TRUE;
    ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "dndDuringSleep" BOOLEAN NOT NULL DEFAULT TRUE;
    ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "dndDuringStudy" BOOLEAN NOT NULL DEFAULT TRUE;
    ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "dndDuringBusy" BOOLEAN NOT NULL DEFAULT FALSE;
    CREATE INDEX IF NOT EXISTS "User_lastActiveAt_idx" ON "User"("lastActiveAt");
  END IF;
  IF to_regclass('"GuildSettings"') IS NOT NULL THEN
    ALTER TABLE "GuildSettings" ADD COLUMN IF NOT EXISTS "autoMentionStatusEnabled" BOOLEAN NOT NULL DEFAULT TRUE;
    ALTER TABLE "GuildSettings" ADD COLUMN IF NOT EXISTS "mentionStatusCooldownMinutes" INTEGER NOT NULL DEFAULT 30;
    ALTER TABLE "GuildSettings" ADD COLUMN IF NOT EXISTS "activityActiveMinutes" INTEGER NOT NULL DEFAULT 10;
    ALTER TABLE "GuildSettings" ADD COLUMN IF NOT EXISTS "mentionStatusChannelIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
    ALTER TABLE "GuildSettings" ADD COLUMN IF NOT EXISTS "mentionStatusExcludedIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
    ALTER TABLE "GuildSettings" ADD COLUMN IF NOT EXISTS "activityTrackingEnabled" BOOLEAN NOT NULL DEFAULT TRUE;
    ALTER TABLE "GuildSettings" ADD COLUMN IF NOT EXISTS "availabilityLfgIntegration" BOOLEAN NOT NULL DEFAULT TRUE;
  END IF;
END
$availability_presence_migration$;

-- Teams extend the existing User identity and LFG history without duplicating accounts.
DO $teams_migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TeamMemberRole') THEN
    CREATE TYPE "TeamMemberRole" AS ENUM ('OWNER', 'CAPTAIN', 'MEMBER');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TeamInviteStatus') THEN
    CREATE TYPE "TeamInviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRED');
  END IF;
  IF to_regclass('"User"') IS NOT NULL THEN
    CREATE TABLE IF NOT EXISTS "Team" (
      "id" TEXT PRIMARY KEY, "slug" TEXT NOT NULL UNIQUE, "name" TEXT NOT NULL,
      "description" TEXT, "logoUrl" TEXT, "accentColor" TEXT NOT NULL DEFAULT '#e50914',
      "ownerId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
      "maxMembers" INTEGER NOT NULL DEFAULT 20, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL
    );
    CREATE TABLE IF NOT EXISTS "TeamMember" (
      "id" TEXT PRIMARY KEY, "teamId" TEXT NOT NULL REFERENCES "Team"("id") ON DELETE CASCADE,
      "userId" TEXT NOT NULL UNIQUE REFERENCES "User"("id") ON DELETE CASCADE,
      "role" "TeamMemberRole" NOT NULL DEFAULT 'MEMBER', "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "TeamMember_teamId_userId_key" UNIQUE ("teamId", "userId")
    );
    CREATE TABLE IF NOT EXISTS "TeamInvite" (
      "id" TEXT PRIMARY KEY, "teamId" TEXT NOT NULL REFERENCES "Team"("id") ON DELETE CASCADE,
      "inviterId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
      "invitedUserId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
      "status" "TeamInviteStatus" NOT NULL DEFAULT 'PENDING', "expiresAt" TIMESTAMP(3) NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "TeamInvite_teamId_invitedUserId_key" UNIQUE ("teamId", "invitedUserId")
    );
    CREATE INDEX IF NOT EXISTS "Team_ownerId_idx" ON "Team"("ownerId");
    CREATE INDEX IF NOT EXISTS "Team_createdAt_idx" ON "Team"("createdAt");
    CREATE INDEX IF NOT EXISTS "TeamMember_teamId_role_idx" ON "TeamMember"("teamId", "role");
    CREATE INDEX IF NOT EXISTS "TeamInvite_invitedUserId_status_expiresAt_idx" ON "TeamInvite"("invitedUserId", "status", "expiresAt");
  END IF;
END
$teams_migration$;

-- Restore only legacy entries disabled by the retired-game seed. After the
-- catalogue assigns descriptive categories, subsequent deploys preserve edits.
DO $restore_game_catalog$
BEGIN
  IF to_regclass('"ZarkGame"') IS NOT NULL THEN
    UPDATE "ZarkGame" SET "enabled" = TRUE
    WHERE "category" = 'RACE' AND "slug" IN ('emoji-guess','movies','series','music','car-logos','company-logos');
  END IF;
END
$restore_game_catalog$;

DO $loyalty_shop_migration$
BEGIN
  IF to_regclass('"User"') IS NOT NULL THEN
    ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "loyaltyDoubleUntil" TIMESTAMP(3);
    ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "vipUntil" TIMESTAMP(3);
    ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lfgPriorityUntil" TIMESTAMP(3);
    ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "loyaltyBadge" TEXT;
    UPDATE "User"
    SET "vipUntil" = CURRENT_TIMESTAMP + INTERVAL '3 days'
    WHERE "vipUnlocked" = TRUE AND "vipUntil" IS NULL;
    CREATE INDEX IF NOT EXISTS "User_vipUntil_idx" ON "User"("vipUntil");
    CREATE INDEX IF NOT EXISTS "User_lfgPriorityUntil_idx" ON "User"("lfgPriorityUntil");
  END IF;
END
$loyalty_shop_migration$;
