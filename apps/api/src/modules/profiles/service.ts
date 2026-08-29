import { db } from "../../../../../packages/db/src/client.js";

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
  return {
    userId: user.id,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    settings: {
      bio: user.bio,
      profileAccent: user.profileAccent,
      activityVisible: user.activityVisible,
      rivalNotificationsEnabled: user.rivalNotificationsEnabled,
      currentActivity: user.activityUntil && user.activityUntil.getTime() <= Date.now() ? "AWAY" : user.currentActivity,
      activityUntil: user.activityUntil?.toISOString(),
      activityNote: user.activityNote,
      mentionPolicy: user.mentionPolicy,
      weeklyAvailability: user.weeklyAvailability.map((slot) => ({ id: slot.id, dayOfWeek: slot.dayOfWeek, startMinute: slot.startMinute, endMinute: slot.endMinute, activity: slot.activity })),
    },
    zark: { xp: user.xp, wins: user.wins, streak: user.streak, level: levelFromXp(user.xp), games: user.gameProfiles.map((profile) => ({ slug: profile.game.slug, name: profile.game.name, xp: profile.xp, wins: profile.wins, losses: profile.losses, streak: profile.streak })) },
    lfg: {
      engagement: engagement._sum.points ?? 0,
      completedSessions: completed.length,
      hostedCompleted,
      uniqueTeammates: teammateRows.length,
      voiceSeconds,
      activeRooms: (includePrivate || user.activityVisible ? activeMemberships : []).map((membership) => ({
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
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, include: { weeklyAvailability: { orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }] } } });
  const expired = user.activityUntil && user.activityUntil.getTime() <= Date.now();
  if (expired && user.currentActivity !== "AWAY") {
    await db.user.update({ where: { id: userId }, data: { currentActivity: "AWAY", activityUntil: null, activityNote: null } });
  }
  return {
    currentActivity: expired ? "AWAY" : user.currentActivity,
    activityUntil: expired ? undefined : user.activityUntil?.toISOString(),
    activityNote: expired ? undefined : user.activityNote ?? undefined,
    mentionPolicy: user.mentionPolicy,
    weeklyAvailability: user.weeklyAvailability.map((slot) => ({ id: slot.id, dayOfWeek: slot.dayOfWeek, startMinute: slot.startMinute, endMinute: slot.endMinute, activity: slot.activity })),
  };
}

export async function updateAvailability(userId: string, input: {
  currentActivity: "FREE" | "PLAYING" | "STUDYING" | "WORKING" | "BUSY" | "AWAY";
  activityUntil?: Date | null;
  activityNote?: string | null;
  mentionPolicy: "EVERYONE" | "INTERESTED_ONLY" | "NOBODY";
  weeklyAvailability?: Array<{ dayOfWeek: number; startMinute: number; endMinute: number; activity: "FREE" | "PLAYING" | "STUDYING" | "WORKING" | "BUSY" | "AWAY" }>;
}) {
  const slots = input.weeklyAvailability ?? [];
  for (const slot of slots) {
    if (slot.dayOfWeek < 0 || slot.dayOfWeek > 6 || slot.startMinute < 0 || slot.startMinute >= 1440 || slot.endMinute <= slot.startMinute || slot.endMinute > 1440) throw new Error("وقت التوفر الأسبوعي غير صحيح");
  }
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: {
      currentActivity: input.currentActivity,
      activityUntil: input.currentActivity === "AWAY" ? null : input.activityUntil,
      activityNote: input.activityNote?.trim() || null,
      mentionPolicy: input.mentionPolicy,
    } });
    if (input.weeklyAvailability) {
      await tx.userAvailability.deleteMany({ where: { userId } });
      if (slots.length) await tx.userAvailability.createMany({ data: slots.map((slot) => ({ userId, ...slot })) });
    }
  });
  return getAvailability(userId);
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
  const [users, ratings] = await Promise.all([
    db.user.findMany({ include: { points: true, memberships: { where: { status: "COMPLETED" }, select: { roomId: true } } } }),
    db.rating.groupBy({ by: ["ratedId"], _avg: { stars: true }, _count: { _all: true } }),
  ]);
  const ratingsByUser = new Map(ratings.map((rating) => [rating.ratedId, rating]));
  const rows = users.map((user) => {
    const rating = ratingsByUser.get(user.id);
    return { userId: user.id, displayName: user.displayName, avatarUrl: user.avatarUrl, engagement: user.points.reduce((sum, point) => sum + point.points, 0), completedSessions: user.memberships.length, rating: rating?._avg.stars ?? 0, ratingCount: rating?._count._all ?? 0 };
  });
  const score = (row: typeof rows[number]) => metric === "sessions" ? row.completedSessions : metric === "rating" ? (row.ratingCount >= 2 ? row.rating : 0) : row.engagement;
  return rows.sort((a, b) => score(b) - score(a)).slice(0, Math.min(50, limit));
}

function levelFromXp(xp: number) {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1;
}
