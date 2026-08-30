import { Prisma } from "@prisma/client";
import { db } from "../../../../../packages/db/src/client.js";
import type { GuildRuntimeSettings } from "../../../../../packages/shared/src/index.js";
import { publish } from "../../events.js";

type GuildSettingsInput = Omit<GuildRuntimeSettings, "guildId" | "lfgChannelId" | "lfgCategoryId" | "publicChannelId" | "dailyChannelId" | "leaderboardChannelId" | "reportChannelId"> & {
  lfgChannelId?: string | null;
  lfgCategoryId?: string | null;
  publicChannelId?: string | null;
  dailyChannelId?: string | null;
  leaderboardChannelId?: string | null;
  reportChannelId?: string | null;
};

export async function getGuildRuntimeSettings(): Promise<GuildRuntimeSettings> {
  const guildId = process.env.DISCORD_GUILD_ID ?? "default";
  const [identity, settings] = await Promise.all([
    db.botIdentity.upsert({ where: { id: 1 }, update: {}, create: { name: "Zark LFG System", tagline: "Zark LFG System — فريقك أقرب مما تتخيل" } }),
    db.guildSettings.upsert({
      where: { guildId },
      update: {},
      create: {
        guildId,
        lfgChannelId: process.env.DISCORD_LFG_CHANNEL_ID || null,
        lfgCategoryId: process.env.DISCORD_LFG_CATEGORY_ID || null,
        publicChannelId: process.env.DISCORD_PUBLIC_CHANNEL_ID || null,
        dailyChannelId: process.env.DISCORD_DAILY_CHANNEL_ID || null,
        reportChannelId: process.env.DISCORD_REPORT_CHANNEL_ID || "1467945220376363131",
        websiteUrl: process.env.PUBLIC_SITE_URL || "https://zark-ps.com",
      },
    }),
  ]);
  return {
    guildId,
    botName: identity.name,
    tagline: identity.tagline,
    lfgChannelId: settings.lfgChannelId ?? undefined,
    lfgCategoryId: settings.lfgCategoryId ?? undefined,
    publicChannelId: settings.publicChannelId ?? undefined,
    dailyChannelId: settings.dailyChannelId ?? undefined,
    leaderboardChannelId: settings.leaderboardChannelId ?? undefined,
    reportChannelId: resolveReportChannel(settings.reportChannelId ?? process.env.DISCORD_REPORT_CHANNEL_ID),
    websiteUrl: settings.websiteUrl || process.env.PUBLIC_SITE_URL || "https://zark-ps.com",
    dmNotificationsEnabled: settings.dmNotificationsEnabled,
    quickMatchEnabled: settings.quickMatchEnabled,
    ratingsEnabled: settings.ratingsEnabled,
    reportsEnabled: settings.reportsEnabled,
    autoCreateRoomChannels: settings.autoCreateRoomChannels,
    maxDmPerDay: settings.maxDmPerDay,
    notificationCooldownMinutes: settings.notificationCooldownMinutes,
    maxActiveRoomsPerUser: settings.maxActiveRoomsPerUser,
    defaultRoomDurationMinutes: settings.defaultRoomDurationMinutes,
    roomGraceMinutes: settings.roomGraceMinutes,
    aiChatEnabled: settings.aiChatEnabled,
    aiDailyMessagesPerUser: settings.aiDailyMessagesPerUser,
    aiGlobalDailyMessages: settings.aiGlobalDailyMessages,
    aiDailyTokenBudgetPerUser: settings.aiDailyTokenBudgetPerUser,
    aiGlobalDailyTokenBudget: settings.aiGlobalDailyTokenBudget,
    aiMaxOutputTokens: settings.aiMaxOutputTokens,
  };
}

export async function updateGuildRuntimeSettings(adminId: string, input: GuildSettingsInput) {
  const guildId = process.env.DISCORD_GUILD_ID ?? "default";
  await db.$transaction([
    db.botIdentity.upsert({ where: { id: 1 }, update: { name: input.botName, tagline: input.tagline }, create: { id: 1, name: input.botName, tagline: input.tagline } }),
    db.guildSettings.upsert({
      where: { guildId },
      update: {
        lfgChannelId: input.lfgChannelId ?? null,
        lfgCategoryId: input.lfgCategoryId ?? null,
        publicChannelId: input.publicChannelId ?? null,
        dailyChannelId: input.dailyChannelId ?? null,
        leaderboardChannelId: input.leaderboardChannelId ?? null,
        reportChannelId: input.reportChannelId ?? null,
        websiteUrl: input.websiteUrl,
        dmNotificationsEnabled: input.dmNotificationsEnabled,
        quickMatchEnabled: input.quickMatchEnabled,
        ratingsEnabled: input.ratingsEnabled,
        reportsEnabled: input.reportsEnabled,
        autoCreateRoomChannels: input.autoCreateRoomChannels,
        maxDmPerDay: input.maxDmPerDay,
        notificationCooldownMinutes: input.notificationCooldownMinutes,
        maxActiveRoomsPerUser: input.maxActiveRoomsPerUser,
        defaultRoomDurationMinutes: input.defaultRoomDurationMinutes,
        roomGraceMinutes: input.roomGraceMinutes,
        aiChatEnabled: input.aiChatEnabled,
        aiDailyMessagesPerUser: input.aiDailyMessagesPerUser,
        aiGlobalDailyMessages: input.aiGlobalDailyMessages,
        aiDailyTokenBudgetPerUser: input.aiDailyTokenBudgetPerUser,
        aiGlobalDailyTokenBudget: input.aiGlobalDailyTokenBudget,
        aiMaxOutputTokens: input.aiMaxOutputTokens,
        updatedBy: adminId,
      },
      create: {
        guildId,
        lfgChannelId: input.lfgChannelId,
        lfgCategoryId: input.lfgCategoryId,
        publicChannelId: input.publicChannelId,
        dailyChannelId: input.dailyChannelId,
        leaderboardChannelId: input.leaderboardChannelId,
        reportChannelId: input.reportChannelId,
        websiteUrl: input.websiteUrl,
        dmNotificationsEnabled: input.dmNotificationsEnabled,
        quickMatchEnabled: input.quickMatchEnabled,
        ratingsEnabled: input.ratingsEnabled,
        reportsEnabled: input.reportsEnabled,
        autoCreateRoomChannels: input.autoCreateRoomChannels,
        maxDmPerDay: input.maxDmPerDay,
        notificationCooldownMinutes: input.notificationCooldownMinutes,
        maxActiveRoomsPerUser: input.maxActiveRoomsPerUser,
        defaultRoomDurationMinutes: input.defaultRoomDurationMinutes,
        roomGraceMinutes: input.roomGraceMinutes,
        aiChatEnabled: input.aiChatEnabled,
        aiDailyMessagesPerUser: input.aiDailyMessagesPerUser,
        aiGlobalDailyMessages: input.aiGlobalDailyMessages,
        aiDailyTokenBudgetPerUser: input.aiDailyTokenBudgetPerUser,
        aiGlobalDailyTokenBudget: input.aiGlobalDailyTokenBudget,
        aiMaxOutputTokens: input.aiMaxOutputTokens,
        updatedBy: adminId,
      },
    }),
    db.auditLog.create({ data: { adminId, action: "guild.settings_updated", targetId: guildId, details: input } }),
  ]);
  const settings = await getGuildRuntimeSettings();
  publish({ type: "guild.settings_updated", adminId, settings });
  return settings;
}

export async function getAdminDashboard() {
  const [settings, users, openRooms, completedRooms, lfgGames, zarkGames, pendingReports, openBugs, botHeartbeat, activeRooms] = await Promise.all([
    getGuildRuntimeSettings(),
    db.user.count(),
    db.lfgRoom.count({ where: { status: { in: ["SCHEDULED", "OPEN", "FULL", "ACTIVE"] } } }),
    db.lfgRoom.count({ where: { status: "COMPLETED" } }),
    db.lfgGameCatalog.count({ where: { enabled: true } }),
    db.zarkGame.count({ where: { enabled: true } }),
    db.report.count({ where: { status: "PENDING" } }),
    db.bugReport.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } } }),
    db.serviceHeartbeat.findUnique({ where: { service: "discord-bot" } }),
    db.lfgRoom.findMany({
      where: { status: { in: ["SCHEDULED", "OPEN", "FULL", "ACTIVE"] } },
      include: { host: true, lfgGame: true, members: { where: { status: "ACTIVE" }, include: { user: true }, orderBy: { joinedAt: "asc" } } },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);
  const botOnline = Boolean(botHeartbeat && Date.now() - botHeartbeat.lastSeenAt.getTime() < 75_000);
  const aiProvider = process.env.GEMINI_API_KEY?.trim() ? "Gemini" : process.env.OPENAI_API_KEY?.trim() ? "OpenAI" : null;
  return {
    settings,
    system: { apiOnline: true, databaseOnline: true, botOnline, botLastSeenAt: botHeartbeat?.lastSeenAt.toISOString(), aiConfigured: Boolean(aiProvider), aiProvider },
    stats: { users, openRooms, completedRooms, lfgGames, zarkGames, pendingReports, openBugs },
    activeRooms: activeRooms.map((room) => ({
      id: room.id,
      gameName: room.lfgGame.name,
      gameIcon: room.lfgGame.icon,
      hostId: room.hostId,
      hostName: room.host.displayName,
      hostAvatarUrl: room.host.avatarUrl,
      status: room.status,
      currentPlayers: room.memberCount,
      maxPlayers: room.maxPlayers,
      durationMinutes: room.durationMinutes,
      members: room.members.map((member) => ({ id: member.userId, displayName: member.user.displayName, avatarUrl: member.user.avatarUrl })),
    })),
  };
}

export async function recordServiceHeartbeat(service: string, instanceId?: string, metadata?: Prisma.InputJsonValue) {
  return db.serviceHeartbeat.upsert({
    where: { service },
    update: { instanceId, metadata },
    create: { service, instanceId, metadata },
  });
}

export async function createLfgCategory(input: { slug: string; name: string; icon?: string; sortOrder?: number }) {
  return db.lfgGameCategory.create({ data: { slug: input.slug, name: input.name, icon: input.icon, sortOrder: input.sortOrder ?? 0 } });
}

export async function upsertLfgGame(input: { slug: string; name: string; description?: string; icon?: string; categorySlug?: string; minPlayers?: number; maxPlayers?: number; enabled?: boolean }) {
  const category = input.categorySlug ? await db.lfgGameCategory.findUnique({ where: { slug: input.categorySlug } }) : null;
  if (input.categorySlug && !category) throw new Error("تصنيف LFG غير موجود");
  const data = {
    name: input.name,
    description: input.description,
    icon: input.icon,
    category: category?.name,
    categoryId: category?.id,
    minPlayers: Math.max(2, input.minPlayers ?? 2),
    maxPlayers: Math.max(input.minPlayers ?? 2, input.maxPlayers ?? 10),
    enabled: input.enabled ?? true,
  };
  return db.lfgGameCatalog.upsert({ where: { slug: input.slug }, update: data, create: { slug: input.slug, ...data } });
}

export async function addGameQuestion(input: { gameSlug: string; prompt: string; acceptedAnswers: string[]; mediaUrl?: string; difficulty?: number }) {
  const game = await db.zarkGame.findUniqueOrThrow({ where: { slug: input.gameSlug } });
  if (!input.acceptedAnswers.length) throw new Error("يجب إضافة إجابة صحيحة واحدة على الأقل");
  return db.gameQuestion.create({ data: { gameId: game.id, prompt: input.prompt, acceptedAnswers: input.acceptedAnswers, mediaType: input.mediaUrl ? "IMAGE" : "TEXT", mediaUrl: input.mediaUrl, difficulty: Math.min(5, Math.max(1, input.difficulty ?? 1)) } });
}

export async function getAdminFeedback() {
  const [playerReports, bugReports] = await Promise.all([
    db.report.findMany({ include: { reporter: { select: { id: true, displayName: true, avatarUrl: true, submittedReportCount: true } }, reported: { select: { id: true, displayName: true, avatarUrl: true } }, _count: { select: { messages: true } } }, orderBy: { updatedAt: "desc" }, take: 100 }),
    db.bugReport.findMany({ include: { reporter: { select: { id: true, displayName: true, avatarUrl: true, submittedReportCount: true } }, _count: { select: { messages: true } } }, orderBy: { updatedAt: "desc" }, take: 100 }),
  ]);
  return { playerReports, bugReports };
}

function resolveReportChannel(value?: string | null) {
  return !value || value === "14681947897814058" ? "1467945220376363131" : value;
}
