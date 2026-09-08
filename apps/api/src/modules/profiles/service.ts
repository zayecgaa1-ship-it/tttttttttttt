import { db } from "../../../../../packages/db/src/client.js";
import { filterScheduleForPrivacy, isValidTimeZone, resolveAvailability, validateSchedule, type SchedulePeriod } from "../../../../../packages/shared/src/availability.js";
import { claimOnce } from "../../events.js";
import { getGuildRuntimeSettings } from "../admin/service.js";

const publicRatingTags = new Set(["تعاوني", "محترف", "ممتع", "تنافسي"]);

export async function getUnifiedProfile(userId: string, includePrivate = false) {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
      gameProfiles: { include: { game: true }, orderBy: { xp: "desc" } },
      preferences: { where: { interestStatus: "INTERESTED" }, include: { game: true } },
      weeklyAvailability: { orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }] },
    },
  });
  if (!user) throw new Error("الملف الشخصي غير موجود");
  const [rating, tags, engagement, completed, activeMemberships, voiceMemberships, teammateRows, hostedCompleted] = await Promise.all([
    db.rating.aggregate({ where: { ratedId: userId }, _avg: { stars: true }, _count: true }),
    db.rating.findMany({ where: { ratedId: userId }, select: { tags: true } }),
    db.engagementPoint.aggregate({ where: { userId }, _sum: { points: true } }),
    db.lfgMember.findMany({ where: { userId, status: "COMPLETED" }, select: { room: { select: { lfgGameId: true, lfgGame: { select: { name: true, icon: true } } } } } }),
    db.lfgMember.findMany({ where: { userId, status: "ACTIVE", room: { status: { in: ["SCHEDULED", "OPEN", "FULL", "ACTIVE"] } } }, select: { room: { select: { id: true, status: true, hostId: true, lfgGame: { select: { name: true, icon: true } } } } } }),
    db.lfgMember.findMany({ where: { userId }, select: { voiceSeconds: true, voiceJoinedAt: true } }),
    db.lfgMember.findMany({ where: { userId: { not: userId }, status: "COMPLETED", room: { members: { some: { userId, status: "COMPLETED" } } } }, distinct: ["userId"], select: { userId: true } }),
    db.lfgRoom.count({ where: { hostId: userId, status: "COMPLETED" } }),
  ]);
  const now = Date.now();
  const voiceSeconds = voiceMemberships.reduce((sum, membership) => sum + membership.voiceSeconds + (membership.voiceJoinedAt ? Math.max(0, Math.floor((now - membership.voiceJoinedAt.getTime()) / 1000)) : 0), 0);
  const gameCounts = new Map<string, { name: string; icon?: string; sessions: number }>();
  for (const membership of completed) {
    const current = gameCounts.get(membership.room.lfgGameId) ?? { name: membership.room.lfgGame.name, icon: membership.room.lfgGame.icon ?? undefined, sessions: 0 };
    current.sessions += 1;
    gameCounts.set(membership.room.lfgGameId, current);
  }
  const tagCounts = new Map<string, number>();
  for (const row of tags) for (const tag of row.tags) if (publicRatingTags.has(tag)) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
  const activityExpired = Boolean(user.activityUntil && user.activityUntil.getTime() <= Date.now());
  const publicSchedule = includePrivate ? user.weeklyAvailability : filterScheduleForPrivacy(user.weeklyAvailability as SchedulePeriod[], { showFreeTime: user.showFreeTime, showStudyTime: user.showStudyTime, showSleepTime: user.showSleepTime });
  const statusVisible = includePrivate || (user.activityVisible && user.showCurrentStatus);
  return {
    userId: user.id,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    settings: {
      bio: user.bio,
      profileAccent: user.profileAccent,
      activityVisible: statusVisible,
      rivalNotificationsEnabled: user.rivalNotificationsEnabled,
      currentActivity: statusVisible && !activityExpired ? user.currentActivity : "AWAY",
      activityUntil: statusVisible && !activityExpired ? user.activityUntil?.toISOString() : undefined,
      activityNote: statusVisible && !activityExpired ? user.activityNote : undefined,
      mentionPolicy: user.mentionPolicy,
      weeklyAvailability: publicSchedule.map((slot) => ({ id: slot.id, dayOfWeek: slot.dayOfWeek, startMinute: slot.startMinute, endMinute: slot.endMinute === 1440 ? 0 : slot.endMinute, activity: slot.activity })),
    },
    zark: { xp: user.xp, wins: user.wins, streak: user.streak, level: levelFromXp(user.xp), games: user.gameProfiles.map((profile) => ({ slug: profile.game.slug, name: profile.game.name, xp: profile.xp, wins: profile.wins, losses: profile.losses, streak: profile.streak })) },
    loyalty: { points: user.loyaltyPoints, lifetimePoints: user.lifetimeLoyaltyPoints, vipUnlocked: Boolean(user.vipUntil && user.vipUntil.getTime() > now), vipUntil: user.vipUntil?.toISOString(), badge: user.loyaltyBadge },
    lfg: {
      engagement: engagement._sum.points ?? 0,
      completedSessions: completed.length,
      hostedCompleted,
      uniqueTeammates: teammateRows.length,
      voiceSeconds,
      activeRooms: (statusVisible ? activeMemberships : []).map((membership) => ({
        id: membership.room.id,
        gameName: membership.room.lfgGame.name,
        gameIcon: membership.room.lfgGame.icon,
        status: membership.room.status,
        isHost: membership.room.hostId === userId,
      })),
      favoriteGames: Array.from(gameCounts.values()).sort((a, b) => b.sessions - a.sessions).slice(0, 5),
      interests: user.preferences.map((preference) => ({ slug: preference.game.slug, name: preference.game.name, icon: preference.game.icon, notificationsEnabled: preference.notificationsEnabled })),
      rating: { average: rating._avg.stars ? Number(rating._avg.stars.toFixed(2)) : null, count: rating._count, topTags: Array.from(tagCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([tag, count]) => ({ tag, count })) },
    },
  };
}

export async function getAvailability(userId: string) {
  const [user, settings] = await Promise.all([db.user.findUniqueOrThrow({ where: { id: userId }, include: { weeklyAvailability: { orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }] } } }), getGuildRuntimeSettings()]);
  const expired = user.activityUntil && user.activityUntil.getTime() <= Date.now();
  if (expired && user.currentActivity !== "AWAY") {
    await db.user.update({ where: { id: userId }, data: { currentActivity: "AWAY", activityUntil: null, activityNote: null } });
  }
  const snapshot = resolveAvailability({ timeZone: user.timezone, periods: user.weeklyAvailability as SchedulePeriod[], manualActivity: expired ? "AWAY" : user.currentActivity, manualUntil: expired ? null : user.activityUntil, voiceActive: user.voiceActive, lastActiveAt: user.lastActiveAt, activeWindowMinutes: settings.activityActiveMinutes });
  return {
    currentActivity: expired ? "AWAY" : user.currentActivity,
    activityUntil: expired ? undefined : user.activityUntil?.toISOString(),
    activityNote: expired ? undefined : user.activityNote ?? undefined,
    mentionPolicy: user.mentionPolicy,
    timezone: user.timezone,
    timezoneConfigured: user.timezoneConfigured,
    lastActiveAt: user.lastActiveAt?.toISOString(),
    voiceActive: user.voiceActive,
    snapshot,
    privacy: { showFreeTime: user.showFreeTime, showStudyTime: user.showStudyTime, showSleepTime: user.showSleepTime, showLastActive: user.showLastActive, showCurrentStatus: user.showCurrentStatus, mentionStatusEnabled: user.mentionStatusEnabled },
    doNotDisturb: { sleep: user.dndDuringSleep, study: user.dndDuringStudy, busy: user.dndDuringBusy },
    weeklyAvailability: user.weeklyAvailability.map((slot) => ({ id: slot.id, dayOfWeek: slot.dayOfWeek, startMinute: slot.startMinute, endMinute: slot.endMinute === 1440 ? 0 : slot.endMinute, activity: slot.activity })),
  };
}

export async function updateAvailability(userId: string, input: {
  currentActivity: "FREE" | "PLAYING" | "STUDYING" | "WORKING" | "BUSY" | "SLEEPING" | "AWAY";
  activityUntil?: Date | null;
  activityNote?: string | null;
  mentionPolicy: "EVERYONE" | "INTERESTED_ONLY" | "NOBODY";
  weeklyAvailability?: Array<{ dayOfWeek: number; startMinute: number; endMinute: number; activity: "FREE" | "PLAYING" | "STUDYING" | "WORKING" | "BUSY" | "SLEEPING" | "AWAY" }>;
  timezone?: string;
  privacy?: { showFreeTime: boolean; showStudyTime: boolean; showSleepTime: boolean; showLastActive: boolean; showCurrentStatus: boolean; mentionStatusEnabled: boolean };
  doNotDisturb?: { sleep: boolean; study: boolean; busy: boolean };
}) {
  const slots = input.weeklyAvailability ?? [];
  if (input.weeklyAvailability) validateSchedule(slots as SchedulePeriod[]);
  if (input.timezone && !isValidTimeZone(input.timezone)) throw new Error("المنطقة الزمنية غير صحيحة");
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: {
      currentActivity: input.currentActivity,
      activityUntil: input.currentActivity === "AWAY" ? null : input.activityUntil,
      activityNote: input.activityNote?.trim() || null,
      mentionPolicy: input.mentionPolicy,
      timezone: input.timezone,
      timezoneConfigured: input.timezone ? true : undefined,
      ...(input.privacy ? { showFreeTime: input.privacy.showFreeTime, showStudyTime: input.privacy.showStudyTime, showSleepTime: input.privacy.showSleepTime, showLastActive: input.privacy.showLastActive, showCurrentStatus: input.privacy.showCurrentStatus, mentionStatusEnabled: input.privacy.mentionStatusEnabled } : {}),
      ...(input.doNotDisturb ? { dndDuringSleep: input.doNotDisturb.sleep, dndDuringStudy: input.doNotDisturb.study, dndDuringBusy: input.doNotDisturb.busy } : {}),
    } });
    if (input.weeklyAvailability) {
      await tx.userAvailability.deleteMany({ where: { userId } });
      if (slots.length) await tx.userAvailability.createMany({ data: slots.map((slot) => ({ userId, ...slot })) });
    }
  });
  return getAvailability(userId);
}

export async function trackActivity(input: { userId: string; displayName: string; avatarUrl?: string; kind: "DISCORD_MESSAGE" | "DISCORD_INTERACTION" | "VOICE_JOIN" | "VOICE_LEAVE" | "WEBSITE" }) {
  const voiceActive = input.kind === "VOICE_JOIN" ? true : input.kind === "VOICE_LEAVE" ? false : undefined;
  const mayWriteActivity = await claimOnce("activity-write", input.userId, 180);
  if (!mayWriteActivity && voiceActive === undefined) return { tracked: false, throttled: true };
  const settings = await getGuildRuntimeSettings();
  if (!settings.activityTrackingEnabled) return { tracked: false };
  const now = new Date();
  await db.user.upsert({
    where: { id: input.userId },
    update: { displayName: input.displayName, avatarUrl: input.avatarUrl, ...(mayWriteActivity ? { lastActiveAt: now } : {}), ...(voiceActive === undefined ? {} : { voiceActive }) },
    create: { id: input.userId, displayName: input.displayName, avatarUrl: input.avatarUrl, lastActiveAt: now, voiceActive: voiceActive ?? false },
  });
  return { tracked: true, lastActiveAt: now.toISOString() };
}

export async function syncVoicePresence(userIds: string[]) {
  const settings = await getGuildRuntimeSettings();
  if (!settings.activityTrackingEnabled) return { active: 0, tracked: false };
  await db.$transaction([
    db.user.updateMany({ where: { voiceActive: true, id: { notIn: userIds } }, data: { voiceActive: false } }),
    ...(userIds.length ? [db.user.updateMany({ where: { id: { in: userIds } }, data: { voiceActive: true, lastActiveAt: new Date() } })] : []),
  ]);
  return { active: userIds.length };
}

export async function getMentionAvailability(input: { userId: string; guildId: string; channelId: string }) {
  const settings = await getGuildRuntimeSettings();
  if (!settings.autoMentionStatusEnabled) return { allowed: false, reason: "disabled" as const };
  if (settings.mentionStatusExcludedIds.includes(input.channelId)) return { allowed: false, reason: "excluded-channel" as const };
  if (settings.mentionStatusChannelIds.length && !settings.mentionStatusChannelIds.includes(input.channelId)) return { allowed: false, reason: "channel-not-enabled" as const };
  const user = await db.user.findUnique({ where: { id: input.userId }, include: { weeklyAvailability: { orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }] } } });
  if (!user) return { allowed: false, reason: "not-configured" as const };
  if (!user.mentionStatusEnabled || !user.activityVisible || !user.showCurrentStatus) return { allowed: false, reason: "private" as const, displayName: user.displayName };
  const claimed = await claimOnce("mention-status", `${input.guildId}:${input.channelId}:${input.userId}`, settings.mentionStatusCooldownMinutes * 60);
  if (!claimed) return { allowed: false, reason: "cooldown" as const };
  const snapshot = resolveAvailability({ timeZone: user.timezone, periods: user.weeklyAvailability as SchedulePeriod[], manualActivity: user.currentActivity, manualUntil: user.activityUntil, voiceActive: user.voiceActive, lastActiveAt: user.lastActiveAt, activeWindowMinutes: settings.activityActiveMinutes });
  const visiblePeriods = filterScheduleForPrivacy(user.weeklyAvailability as SchedulePeriod[], { showFreeTime: user.showFreeTime, showStudyTime: user.showStudyTime, showSleepTime: user.showSleepTime });
  return { allowed: true, displayName: user.displayName, timezone: user.timezone, snapshot: { ...snapshot, currentPeriod: visiblePeriods.some((period) => period.id === snapshot.currentPeriod?.id) ? snapshot.currentPeriod : undefined, nextFree: user.showFreeTime ? snapshot.nextFree : undefined, today: snapshot.today.filter((period) => visiblePeriods.some((item) => item.id === period.id)), tomorrow: snapshot.tomorrow.filter((period) => visiblePeriods.some((item) => item.id === period.id)), lastActiveAt: user.showLastActive ? snapshot.lastActiveAt : undefined } };
}

export async function updateProfileSettings(userId: string, input: { bio?: string | null; profileAccent: string; activityVisible: boolean; rivalNotificationsEnabled: boolean }) {
  const user = await db.user.update({
    where: { id: userId },
    data: {
      bio: input.bio?.trim() || null,
      profileAccent: input.profileAccent.toLowerCase(),
      activityVisible: input.activityVisible,
      rivalNotificationsEnabled: input.rivalNotificationsEnabled,
    },
  });
  return {
    bio: user.bio,
    profileAccent: user.profileAccent,
    activityVisible: user.activityVisible,
    rivalNotificationsEnabled: user.rivalNotificationsEnabled,
  };
}

export async function getTopLfgPlayers(metric: "engagement" | "sessions" | "rating" = "engagement", limit = 10) {
  const [engagementRows, sessionRows, ratings] = await Promise.all([
    db.engagementPoint.groupBy({ by: ["userId"], _sum: { points: true } }),
    db.lfgMember.groupBy({ by: ["userId"], where: { status: "COMPLETED" }, _count: { _all: true } }),
    db.rating.groupBy({ by: ["ratedId"], _avg: { stars: true }, _count: { _all: true } }),
  ]);
  const participantIds = new Set([...engagementRows.map((row) => row.userId), ...sessionRows.map((row) => row.userId), ...ratings.map((row) => row.ratedId)]);
  if (!participantIds.size) return [];
  const users = await db.user.findMany({ where: { id: { in: [...participantIds] } }, select: { id: true, displayName: true, avatarUrl: true } });
  const engagementByUser = new Map(engagementRows.map((row) => [row.userId, row._sum.points ?? 0]));
  const sessionsByUser = new Map(sessionRows.map((row) => [row.userId, row._count._all]));
  const ratingsByUser = new Map(ratings.map((rating) => [rating.ratedId, rating]));
  const rows = users.map((user) => {
    const rating = ratingsByUser.get(user.id);
    return { userId: user.id, displayName: user.displayName, avatarUrl: user.avatarUrl, engagement: engagementByUser.get(user.id) ?? 0, completedSessions: sessionsByUser.get(user.id) ?? 0, rating: rating?._avg.stars ?? 0, ratingCount: rating?._count._all ?? 0 };
  });
  const score = (row: typeof rows[number]) => metric === "sessions" ? row.completedSessions : metric === "rating" ? (row.ratingCount >= 2 ? row.rating : 0) : row.engagement;
  return rows.sort((a, b) => score(b) - score(a)).slice(0, Math.min(50, limit));
}

function levelFromXp(xp: number) {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1;
}
