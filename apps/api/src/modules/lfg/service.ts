import { Prisma } from "@prisma/client";
import { db } from "../../../../../packages/db/src/client.js";
import type { LiveRoom } from "../../../../../packages/shared/src/index.js";
import { enforceRateLimit, publish } from "../../events.js";
import { serializable } from "../../db-transaction.js";
import { getGuildRuntimeSettings } from "../admin/service.js";
import { awardLoyaltyPoints } from "../loyalty/service.js";
import { LFG_GATHER_WINDOW_MINUTES, lfgWarningCloseAt } from "../../../../../packages/shared/src/lfg-lifecycle.js";

const categories = [
  { slug: "sandbox", name: "عالم مفتوح وبناء", icon: "🧱", sortOrder: 1 },
  { slug: "shooter", name: "تصويب وتكتيك", icon: "🎯", sortOrder: 2 },
  { slug: "survival", name: "بقاء", icon: "🛠️", sortOrder: 3 },
  { slug: "battle-royale", name: "باتل رويال", icon: "🏝️", sortOrder: 4 },
  { slug: "open-world", name: "عالم مفتوح", icon: "🚗", sortOrder: 5 },
  { slug: "sports", name: "رياضة وسباقات", icon: "⚽", sortOrder: 6 },
  { slug: "moba", name: "MOBA وتنافس جماعي", icon: "⚔️", sortOrder: 7 },
  { slug: "party", name: "اجتماعية وParty", icon: "🎉", sortOrder: 8 },
  { slug: "rpg", name: "RPG ومغامرات", icon: "🧙", sortOrder: 9 },
] as const;

const catalog = [
  { slug: "minecraft", name: "Minecraft", icon: "⛏️", category: "sandbox", minPlayers: 2, maxPlayers: 10 },
  { slug: "roblox", name: "Roblox", icon: "🟥", category: "sandbox", minPlayers: 2, maxPlayers: 12 },
  { slug: "terraria", name: "Terraria", icon: "🌲", category: "sandbox", minPlayers: 2, maxPlayers: 8 },
  { slug: "valorant", name: "Valorant", icon: "🎯", category: "shooter", minPlayers: 2, maxPlayers: 5 },
  { slug: "cs2", name: "Counter-Strike 2", icon: "🔫", category: "shooter", minPlayers: 2, maxPlayers: 5 },
  { slug: "overwatch-2", name: "Overwatch 2", icon: "🛡️", category: "shooter", minPlayers: 2, maxPlayers: 5 },
  { slug: "rainbow-six-siege", name: "Rainbow Six Siege", icon: "🧨", category: "shooter", minPlayers: 2, maxPlayers: 5 },
  { slug: "warzone", name: "Call of Duty: Warzone", icon: "🪖", category: "shooter", minPlayers: 2, maxPlayers: 4 },
  { slug: "rust", name: "Rust", icon: "🛠️", category: "survival", minPlayers: 2, maxPlayers: 10 },
  { slug: "ark-survival-ascended", name: "ARK: Survival Ascended", icon: "🦖", category: "survival", minPlayers: 2, maxPlayers: 10 },
  { slug: "palworld", name: "Palworld", icon: "🐾", category: "survival", minPlayers: 2, maxPlayers: 8 },
  { slug: "dead-by-daylight", name: "Dead by Daylight", icon: "🪝", category: "survival", minPlayers: 2, maxPlayers: 5 },
  { slug: "fortnite", name: "Fortnite", icon: "🏝️", category: "battle-royale", minPlayers: 2, maxPlayers: 4 },
  { slug: "pubg", name: "PUBG: Battlegrounds", icon: "🪂", category: "battle-royale", minPlayers: 2, maxPlayers: 4 },
  { slug: "apex-legends", name: "Apex Legends", icon: "🔺", category: "battle-royale", minPlayers: 2, maxPlayers: 3 },
  { slug: "gta-v", name: "GTA V", icon: "🚗", category: "open-world", minPlayers: 2, maxPlayers: 8 },
  { slug: "red-dead-online", name: "Red Dead Online", icon: "🤠", category: "open-world", minPlayers: 2, maxPlayers: 7 },
  { slug: "rocket-league", name: "Rocket League", icon: "⚽", category: "sports", minPlayers: 2, maxPlayers: 6 },
  { slug: "ea-sports-fc", name: "EA SPORTS FC", icon: "🥅", category: "sports", minPlayers: 2, maxPlayers: 4 },
  { slug: "forza-horizon-5", name: "Forza Horizon 5", icon: "🏎️", category: "sports", minPlayers: 2, maxPlayers: 12 },
  { slug: "league-of-legends", name: "League of Legends", icon: "⚔️", category: "moba", minPlayers: 2, maxPlayers: 5 },
  { slug: "dota-2", name: "Dota 2", icon: "🗡️", category: "moba", minPlayers: 2, maxPlayers: 5 },
  { slug: "among-us", name: "Among Us", icon: "🚀", category: "party", minPlayers: 4, maxPlayers: 15 },
  { slug: "fall-guys", name: "Fall Guys", icon: "🎉", category: "party", minPlayers: 2, maxPlayers: 8 },
] as const;
const autoOrganizer = { userId: "zark-auto-organizer", displayName: "Zark Organizer" };

let catalogSeedPromise: Promise<void> | undefined;

export async function seedLfgCatalog() {
  if (!catalogSeedPromise) catalogSeedPromise = seedDefaultCatalog().catch((error) => { catalogSeedPromise = undefined; throw error; });
  return catalogSeedPromise;
}

async function seedDefaultCatalog() {
  await db.$transaction(categories.map((category) => db.lfgGameCategory.upsert({ where: { slug: category.slug }, update: {}, create: category })));
  const storedCategories = await db.lfgGameCategory.findMany({ where: { slug: { in: categories.map((category) => category.slug) } } });
  const categoryBySlug = new Map(storedCategories.map((category) => [category.slug, category]));
  await db.$transaction(catalog.map((item) => {
    const category = categoryBySlug.get(item.category);
    if (!category) throw new Error(`تعذر تهيئة تصنيف ${item.category}`);
    return db.lfgGameCatalog.upsert({
      where: { slug: item.slug },
      update: {},
      create: { slug: item.slug, name: item.name, icon: item.icon, category: category.name, categoryId: category.id, minPlayers: item.minPlayers, maxPlayers: item.maxPlayers },
    });
  }));
}

export async function getLfgCatalog() {
  await seedLfgCatalog();
  return db.lfgGameCategory.findMany({
    orderBy: { sortOrder: "asc" },
    include: { games: { where: { enabled: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] } },
  });
}

export type LfgInterestInsight = {
  gameSlug: string;
  gameName: string;
  gameIcon?: string;
  minPlayers: number;
  autoMinAvailable: number;
  maxPlayers: number;
  interestedCount: number;
  availableNowCount: number;
  interestPercent: number;
};

export async function getLfgInterestInsights(): Promise<LfgInterestInsight[]> {
  await seedLfgCatalog();
  const now = new Date();
  const [memberCount, games] = await Promise.all([
    db.user.count(),
    db.lfgGameCatalog.findMany({
      where: { enabled: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { preferences: { where: { interestStatus: "INTERESTED" }, include: { user: { include: { weeklyAvailability: true } } } } },
    }),
  ]);
  return games.map((game) => {
    const interestedCount = game.preferences.length;
    const availableNowCount = game.preferences.filter((preference) => isUserAvailableForLfg(preference.user, now)).length;
    return {
      gameSlug: game.slug, gameName: game.name, gameIcon: game.icon ?? undefined, minPlayers: game.minPlayers,
      autoMinAvailable: Math.min(game.maxPlayers, Math.max(game.minPlayers, game.autoMinAvailable ?? game.minPlayers)), maxPlayers: game.maxPlayers,
      interestedCount, availableNowCount, interestPercent: memberCount ? Math.round(interestedCount / memberCount * 100) : 0,
    };
  }).sort((a, b) => b.availableNowCount - a.availableNowCount || b.interestPercent - a.interestPercent || a.gameName.localeCompare(b.gameName, "ar"));
}

export async function getSmartRoomDashboard() {
  const [recommendations, slots] = await Promise.all([
    getLfgInterestInsights(),
    db.userAvailability.findMany({ where: { activity: "FREE" }, select: { dayOfWeek: true, startMinute: true, endMinute: true } }),
  ]);
  const hours = new Map<string, { dayOfWeek: number; hour: number; players: number }>();
  for (const slot of slots) {
    for (let minute = slot.startMinute; minute < slot.endMinute; minute += 60) {
      const hour = Math.floor(minute / 60);
      const key = `${slot.dayOfWeek}:${hour}`;
      const current = hours.get(key) ?? { dayOfWeek: slot.dayOfWeek, hour, players: 0 };
      current.players += 1;
      hours.set(key, current);
    }
  }
  return {
    recommendations: recommendations.slice(0, 8),
    peakTimes: [...hours.values()].sort((a, b) => b.players - a.players || a.dayOfWeek - b.dayOfWeek || a.hour - b.hour).slice(0, 6),
  };
}

export async function getSmartRoomHistory() {
  const rooms = await db.lfgRoom.findMany({
    where: { title: { startsWith: "تجمع Zark تلقائي" } },
    include: { lfgGame: { select: { name: true, icon: true } } },
    orderBy: { createdAt: "desc" }, take: 12,
  });
  const deliveries = rooms.length ? await db.notificationDelivery.groupBy({ by: ["roomId", "status"], where: { roomId: { in: rooms.map((room) => room.id) } }, _count: { _all: true } }) : [];
  return rooms.map((room) => {
    const roomDeliveries = deliveries.filter((delivery) => delivery.roomId === room.id);
    const count = (status: string) => roomDeliveries.find((delivery) => delivery.status === status)?._count._all ?? 0;
    return { id: room.id, gameName: room.lfgGame.name, gameIcon: room.lfgGame.icon, status: room.status, createdAt: room.createdAt.toISOString(), description: room.description, invited: roomDeliveries.reduce((total, item) => total + item._count._all, 0), sent: count("SENT"), ignored: count("IGNORED") };
  });
}

export async function getUserPreferences(userId: string) {
  return db.userGamePreference.findMany({ where: { userId }, include: { game: { include: { gameCategory: true } } }, orderBy: { game: { name: "asc" } } });
}

export async function syncLfgUserIdentity(input: { userId: string; displayName: string; avatarUrl?: string }) {
  const existing = await db.user.findUnique({ where: { id: input.userId }, select: { displayName: true, avatarUrl: true } });
  if (existing?.displayName === input.displayName && existing.avatarUrl === (input.avatarUrl ?? null)) return existing;
  const user = await upsertActor(input);
  const rooms = await db.lfgRoom.findMany({
    where: { status: { in: ["SCHEDULED", "OPEN", "FULL", "ACTIVE"] }, members: { some: { userId: input.userId, status: "ACTIVE" } } },
    include: roomInclude,
  });
  for (const room of rooms) publish({ type: "lfg.updated", room: toLiveRoom(room) });
  return user;
}

export async function updateUserPreference(input: { userId: string; displayName: string; avatarUrl?: string; gameSlug: string; interested: boolean; notificationsEnabled: boolean; autoInvitesEnabled?: boolean }) {
  await seedLfgCatalog();
  const game = await db.lfgGameCatalog.findUniqueOrThrow({ where: { slug: input.gameSlug } });
  await upsertActor(input);
  const preference = await db.userGamePreference.upsert({
    where: { userId_lfgGameId: { userId: input.userId, lfgGameId: game.id } },
    update: { interestStatus: input.interested ? "INTERESTED" : "NOT_INTERESTED", notificationsEnabled: input.interested && input.notificationsEnabled, mutedUntil: null, ...(input.autoInvitesEnabled === undefined ? {} : { autoInvitesEnabled: input.interested && input.autoInvitesEnabled }) },
    create: { userId: input.userId, lfgGameId: game.id, interestStatus: input.interested ? "INTERESTED" : "NOT_INTERESTED", notificationsEnabled: input.interested && input.notificationsEnabled, autoInvitesEnabled: input.interested && (input.autoInvitesEnabled ?? true) },
    include: { game: true },
  });
  publish({ type: "user.interest_changed", userId: input.userId, gameSlug: game.slug, interested: input.interested, notificationsEnabled: preference.notificationsEnabled });
  return preference;
}

export async function muteGameNotifications(input: { userId: string; displayName: string; avatarUrl?: string; gameSlug: string }) {
  const existing = await db.lfgGameCatalog.findUniqueOrThrow({ where: { slug: input.gameSlug } });
  await upsertActor(input);
  const preference = await db.userGamePreference.upsert({
    where: { userId_lfgGameId: { userId: input.userId, lfgGameId: existing.id } },
    update: { notificationsEnabled: false, mutedUntil: null },
    create: { userId: input.userId, lfgGameId: existing.id, interestStatus: "INTERESTED", notificationsEnabled: false, mutedUntil: null },
  });
  publish({ type: "user.notification_changed", userId: input.userId, gameSlug: input.gameSlug, notificationsEnabled: false });
  return preference;
}

export async function snoozeGameNotifications(input: { userId: string; displayName: string; avatarUrl?: string; gameSlug: string; minutes: number }) {
  const game = await db.lfgGameCatalog.findUniqueOrThrow({ where: { slug: input.gameSlug } });
  await upsertActor(input);
  const mutedUntil = new Date(Date.now() + Math.min(10_080, Math.max(15, input.minutes)) * 60_000);
  const preference = await db.userGamePreference.upsert({
    where: { userId_lfgGameId: { userId: input.userId, lfgGameId: game.id } },
    update: { interestStatus: "INTERESTED", notificationsEnabled: true, mutedUntil },
    create: { userId: input.userId, lfgGameId: game.id, interestStatus: "INTERESTED", notificationsEnabled: true, mutedUntil },
    include: { game: true },
  });
  publish({ type: "user.notification_changed", userId: input.userId, gameSlug: input.gameSlug, notificationsEnabled: true });
  return preference;
}

export async function createLfgRoom(input: { userId: string; displayName: string; avatarUrl?: string; gameSlug: string; maxPlayers: number; durationMinutes?: number; scheduledFor?: Date; title?: string; description?: string; gameMode?: string; mapName?: string; needsVoice?: boolean; roomEmoji?: string; accentColor?: string }) {
  await enforceRateLimit("lfg-create", input.userId, 5, 10 * 60);
  await seedLfgCatalog();
  const game = await db.lfgGameCatalog.findUniqueOrThrow({ where: { slug: input.gameSlug } });
  if (!game.enabled) throw new Error("هذه اللعبة غير متاحة في LFG حاليًا");
  const mapName = input.mapName?.trim();
  if (game.slug === "roblox" && !mapName) throw new Error("اكتب اسم ماب Roblox قبل إنشاء الغرفة");
  const maxPlayers = Math.min(game.maxPlayers, Math.max(game.minPlayers, input.maxPlayers));
  const settings = await getGuildRuntimeSettings();
  const durationMinutes = Math.min(360, Math.max(15, input.durationMinutes ?? settings.defaultRoomDurationMinutes));
  const scheduledFor = normalizeSchedule(input.scheduledFor);
  await upsertActor(input);
  const room = await serializable(async (tx) => {
    const activeRooms = await tx.lfgMember.count({ where: { userId: input.userId, status: "ACTIVE", room: { status: { in: ["SCHEDULED", "OPEN", "FULL", "ACTIVE"] } } } });
    if (activeRooms >= settings.maxActiveRoomsPerUser) throw new Error("وصلت إلى الحد المسموح من تجمعات LFG النشطة");
    return tx.lfgRoom.create({
      data: {
        hostId: input.userId,
        lfgGameId: game.id,
        maxPlayers,
        durationMinutes,
        memberCount: 1,
        status: scheduledFor ? "SCHEDULED" : "OPEN",
        source: "MANUAL",
        scheduledFor,
        // Every room receives 30 minutes to actually start, then a separate
        // 15-minute warning. processDueLfgRooms owns both transitions.
        autoDeleteAt: null,
        expiresAt: null,
        title: input.title?.trim() || null,
        description: input.description,
        gameMode: input.gameMode,
        mapName: mapName || null,
        needsVoice: input.needsVoice ?? true,
        roomEmoji: input.roomEmoji?.trim() || game.icon || "🎮",
        accentColor: validColor(input.accentColor) ?? "#e50914",
        members: { create: { userId: input.userId, status: "ACTIVE" } },
      },
      include: roomInclude,
    });
  });
  const live = toLiveRoom(room);
  publish({ type: "lfg.created", room: live });
  return live;
}

export async function quickMatchLfg(input: { userId: string; displayName: string; avatarUrl?: string; gameSlug: string }) {
  const settings = await getGuildRuntimeSettings();
  if (!settings.quickMatchEnabled) throw new Error("Quick Match معطّل مؤقتًا من الإدارة");
  await seedLfgCatalog();
  const game = await db.lfgGameCatalog.findUniqueOrThrow({ where: { slug: input.gameSlug } });
  const room = await db.lfgRoom.findFirst({
    where: { lfgGameId: game.id, status: "OPEN", hostId: { not: input.userId }, members: { none: { userId: input.userId, status: "ACTIVE" } } },
    orderBy: { createdAt: "asc" },
  });
  if (room) return joinLfgRoom(room.id, input);
  return createLfgRoom({ ...input, maxPlayers: Math.min(game.maxPlayers, Math.max(game.minPlayers, 4)) });
}

export async function smartMatchLfg(input: { userId: string; displayName: string; avatarUrl?: string; gameSlug?: string }) {
  const settings = await getGuildRuntimeSettings();
  if (!settings.quickMatchEnabled) throw new Error("التجميع الذكي معطّل مؤقتًا من الإدارة");
  const insights = await getLfgInterestInsights();
  const insight = input.gameSlug ? insights.find((item) => item.gameSlug === input.gameSlug) : insights[0];
  if (!insight) throw new Error("لا توجد لعبة متاحة للتجميع الذكي الآن");
  const game = await db.lfgGameCatalog.findUniqueOrThrow({ where: { slug: insight.gameSlug } });
  const existing = await db.lfgRoom.findFirst({
    where: { lfgGameId: game.id, status: "OPEN", hostId: { not: input.userId }, members: { none: { userId: input.userId, status: "ACTIVE" } } },
    orderBy: [{ memberCount: "desc" }, { createdAt: "asc" }],
  });
  if (existing) return { room: await joinLfgRoom(existing.id, input), insight, joinedExisting: true };
  const targetPlayers = Math.min(game.maxPlayers, Math.max(game.minPlayers, insight.availableNowCount || game.minPlayers));
  const room = await createLfgRoom({
    ...input, gameSlug: game.slug, maxPlayers: targetPlayers,
    title: `تجمع ذكي • ${insight.interestPercent}% مهتمون`,
    description: `رتّبه Zark حسب الاهتمام والتفرغ الآن: ${insight.availableNowCount} لاعب متاح.`,
  });
  return { room, insight, joinedExisting: false };
}

export async function processAutoSmartRooms(options: { force?: boolean } = {}) {
  const settings = await getGuildRuntimeSettings();
  if (!settings.autoSmartRoomsEnabled) return { created: false, reason: "disabled" as const };
  const now = new Date();
  const service = `auto-smart-rooms:${settings.guildId}`;
  const claimed = await serializable(async (tx) => {
    const previous = await tx.serviceHeartbeat.findUnique({ where: { service } });
    // Serializable transaction forms a distributed lock across bot instances.
    if (!options.force && previous && now.getTime() - previous.lastSeenAt.getTime() < settings.autoRoomIntervalMinutes * 60_000) return false;
    await tx.serviceHeartbeat.upsert({ where: { service }, update: { instanceId: String(process.pid), metadata: { lastRunAt: now.toISOString() } }, create: { service, instanceId: String(process.pid), metadata: { lastRunAt: now.toISOString() } } });
    return true;
  });
  if (!claimed) return { created: false, reason: "cooldown" as const };
  const cooldownSince = new Date(now.getTime() - settings.autoRoomIntervalMinutes * 60_000);
  const candidates = (await getLfgInterestInsights()).filter((item) => item.interestedCount >= settings.autoRoomMinimumInterested);
  let selected: { candidate: LfgInterestInsight; game: NonNullable<Awaited<ReturnType<typeof db.lfgGameCatalog.findUnique>>> } | undefined;
  for (const insight of candidates) {
    const catalogGame = await db.lfgGameCatalog.findUnique({ where: { slug: insight.gameSlug } });
    if (!catalogGame) continue;
    const [existing, recentAutoRoom] = await Promise.all([
      db.lfgRoom.findFirst({ where: { lfgGameId: catalogGame.id, status: { in: ["SCHEDULED", "OPEN", "FULL", "ACTIVE"] } }, select: { id: true } }),
      db.lfgRoom.findFirst({ where: { lfgGameId: catalogGame.id, title: { startsWith: "تجمع Zark تلقائي" }, createdAt: { gte: cooldownSince } }, select: { id: true } }),
    ]);
    if (!existing && !recentAutoRoom) {
      selected = { candidate: insight, game: catalogGame };
      break;
    }
  }
  if (!selected) return { created: false, reason: candidates.length ? "active-room-exists" as const : "not-enough-available-players" as const };
  const { candidate, game } = selected;
  await upsertActor(autoOrganizer);
  const room = await db.lfgRoom.create({
    data: {
      hostId: autoOrganizer.userId, lfgGameId: game.id, memberCount: 0,
      maxPlayers: Math.min(game.maxPlayers, Math.max(settings.autoRoomMinimumInterested, candidate.interestedCount)),
      durationMinutes: settings.defaultRoomDurationMinutes, status: "OPEN", source: "AUTO", needsVoice: true,
      expiresAt: null,
      title: `تجمع Zark تلقائي • ${candidate.interestPercent}% مهتمون`,
      description: `اختاره Zark تلقائيًا: ${candidate.availableNowCount} عضوًا متفرغًا الآن من المهتمين باللعبة (الحد التلقائي: ${candidate.autoMinAvailable}).`,
      roomEmoji: game.icon || "🎮", accentColor: "#e50914", autoDeleteAt: null,
    }, include: roomInclude,
  });
  const live = toLiveRoom(room);
  publish({ type: "lfg.created", room: live });
  return { created: true, room: live, insight: candidate };
}

export async function joinLfgRoom(roomId: string, input: { userId: string; displayName: string; avatarUrl?: string }) {
  await enforceRateLimit("lfg-membership", input.userId, 30, 60);
  const settings = await getGuildRuntimeSettings();
  await upsertActor(input);
  await serializable(async (tx) => {
    const room = await tx.lfgRoom.findUnique({ where: { id: roomId } });
    if (!room || !["SCHEDULED", "OPEN", "FULL", "ACTIVE"].includes(room.status)) throw new Error("الغرفة غير متاحة");
    if (room.locked) throw new Error("الغرفة مقفلة من المضيف");
    const membership = await tx.lfgMember.findUnique({ where: { roomId_userId: { roomId, userId: input.userId } } });
    if (membership?.status === "ACTIVE") return;
    const activeRooms = await tx.lfgMember.count({ where: { userId: input.userId, status: "ACTIVE", roomId: { not: roomId }, room: { status: { in: ["SCHEDULED", "OPEN", "FULL", "ACTIVE"] } } } });
    if (activeRooms >= settings.maxActiveRoomsPerUser) throw new Error("اخرج من أحد تجمعاتك الحالية قبل دخول تجمع آخر");
    const reserved = await tx.lfgRoom.updateMany({
      where: { id: roomId, memberCount: { lt: room.maxPlayers }, status: { in: ["SCHEDULED", "OPEN", "FULL", "ACTIVE"] }, locked: false },
      data: { memberCount: { increment: 1 }, version: { increment: 1 }, emptySince: null, hostId: room.memberCount === 0 ? input.userId : room.hostId },
    });
    if (reserved.count !== 1) throw new Error("الغرفة ممتلئة");
    await tx.lfgMember.upsert({
      where: { roomId_userId: { roomId, userId: input.userId } },
      update: { status: "ACTIVE", joinedAt: new Date(), leftAt: null, completedAt: null },
      create: { roomId, userId: input.userId, status: "ACTIVE" },
    });
    const updated = await tx.lfgRoom.findUniqueOrThrow({ where: { id: roomId } });
    await tx.lfgRoom.update({ where: { id: roomId }, data: { status: room.status === "SCHEDULED" ? "SCHEDULED" : updated.status === "ACTIVE" ? "ACTIVE" : updated.memberCount >= updated.maxPlayers ? "FULL" : "OPEN" } });
  });
  const room = await getLfgRoom(roomId);
  publish({ type: "lfg.member_joined", room });
  return room;
}

export async function leaveLfgRoom(roomId: string, userId: string) {
  await enforceRateLimit("lfg-membership", userId, 30, 60);
  const settings = await getGuildRuntimeSettings();
  const hostChange = await serializable(async (tx) => {
    const room = await tx.lfgRoom.findUnique({ where: { id: roomId } });
    if (!room || ["COMPLETED", "CLOSED"].includes(room.status)) throw new Error("الغرفة مغلقة");
    const membership = await tx.lfgMember.findUnique({ where: { roomId_userId: { roomId, userId } } });
    if (!membership || membership.status !== "ACTIVE") return { previousHostId: room.hostId, newHostId: room.hostId };
    const now = new Date();
    const extraVoiceSeconds = membership.voiceJoinedAt ? Math.max(0, Math.floor((now.getTime() - membership.voiceJoinedAt.getTime()) / 1000)) : 0;
    await tx.lfgMember.update({ where: { roomId_userId: { roomId, userId } }, data: { status: "LEFT", leftAt: now, voiceJoinedAt: null, voiceSeconds: { increment: extraVoiceSeconds }, played: membership.played || extraVoiceSeconds >= 60 } });
    const memberCount = Math.max(0, room.memberCount - 1);
    let newHostId = room.hostId;
    if (room.hostId === userId) {
      const next = await tx.lfgMember.findFirst({ where: { roomId, userId: { not: userId }, status: "ACTIVE" }, orderBy: { joinedAt: "asc" } });
      newHostId = next?.userId ?? room.hostId;
    }
    const emptyAt = memberCount === 0 ? now : null;
    await tx.lfgRoom.update({
      where: { id: roomId },
      data: {
        memberCount,
        hostId: newHostId,
        version: { increment: 1 },
        status: room.status === "SCHEDULED" ? "SCHEDULED" : room.status === "ACTIVE" ? "ACTIVE" : "OPEN",
        emptySince: emptyAt,
        autoDeleteAt: room.startedAt && emptyAt ? new Date(emptyAt.getTime() + 10 * 60_000) : room.autoDeleteAt,
      },
    });
    return { previousHostId: room.hostId, newHostId };
  });
  const room = await getLfgRoom(roomId);
  publish({ type: "lfg.member_left", room, userId });
  if (hostChange.previousHostId !== hostChange.newHostId) publish({ type: "lfg.host_changed", roomId, previousHostId: hostChange.previousHostId, newHostId: hostChange.newHostId });
  return room;
}

/** Removes a participant at the host's request. The Discord bot performs the
 * matching voice disconnect; this service remains the source of truth. */
export async function kickLfgMember(roomId: string, actorId: string, userId: string) {
  if (actorId === userId) throw new Error("You cannot remove yourself");
  await serializable(async (tx) => {
    const room = await tx.lfgRoom.findUniqueOrThrow({ where: { id: roomId }, include: { lfgGame: { select: { minPlayers: true } } } });
    if (room.hostId !== actorId) throw new Error("Only the room host can remove players");
    if (!["SCHEDULED", "OPEN", "FULL", "ACTIVE"].includes(room.status)) throw new Error("The room is closed");
    const member = await tx.lfgMember.findUnique({ where: { roomId_userId: { roomId, userId } } });
    if (!member || member.status !== "ACTIVE") throw new Error("The player is no longer in this room");
    const now = new Date();
    const extraVoiceSeconds = member.voiceJoinedAt ? Math.max(0, Math.floor((now.getTime() - member.voiceJoinedAt.getTime()) / 1000)) : 0;
    await tx.lfgMember.update({ where: { roomId_userId: { roomId, userId } }, data: { status: "LEFT", leftAt: now, voiceJoinedAt: null, voiceSeconds: { increment: extraVoiceSeconds }, played: member.played || extraVoiceSeconds >= 60 } });
    const memberCount = Math.max(0, room.memberCount - 1);
    const connected = await tx.lfgMember.count({ where: { roomId, status: "ACTIVE", voiceJoinedAt: { not: null } } });
    const roomIsEmpty = connected === 0 && Boolean(room.startedAt);
    await tx.lfgRoom.update({
      where: { id: roomId },
      data: {
        memberCount,
        status: room.status === "SCHEDULED" ? "SCHEDULED" : room.status === "ACTIVE" ? "ACTIVE" : memberCount >= room.maxPlayers ? "FULL" : "OPEN",
        emptySince: roomIsEmpty ? now : room.emptySince,
        autoDeleteAt: roomIsEmpty ? new Date(now.getTime() + 10 * 60_000) : room.autoDeleteAt,
        version: { increment: 1 },
      },
    });
  });
  const room = await getLfgRoom(roomId);
  publish({ type: "lfg.member_left", room, userId });
  return room;
}

export async function completeLfgRoom(roomId: string, actorId?: string) {
  if (actorId) await assertRoomHost(roomId, actorId);
  const rewardedUsers = await serializable(async (tx) => {
    const room = await tx.lfgRoom.findUnique({ where: { id: roomId }, include: { members: { where: { status: "ACTIVE" } } } });
    if (!room || !["FULL", "ACTIVE", "OPEN"].includes(room.status)) throw new Error("لا يمكن إكمال هذه الغرفة");
    const now = new Date();
    const effectiveVoiceSeconds = new Map(room.members.map((member) => [member.userId, member.voiceSeconds + (member.voiceJoinedAt ? Math.max(0, Math.floor((now.getTime() - member.voiceJoinedAt.getTime()) / 1000)) : 0)]));
    const eligible = room.members.filter((member) => !room.needsVoice ? member.played : member.played && (effectiveVoiceSeconds.get(member.userId) ?? 0) >= 60);
    if (eligible.length < 2) throw new Error("يجب أن يلعب عضوان فعليًا على الأقل قبل إنهاء الجلسة");
    const transition = await tx.lfgRoom.updateMany({ where: { id: roomId, status: { in: ["OPEN", "FULL", "ACTIVE"] } }, data: { status: "COMPLETED", completedAt: now, memberCount: eligible.length, emptySince: null, autoDeleteAt: null, version: { increment: 1 } } });
    if (transition.count !== 1) throw new Error("تم إكمال الغرفة مسبقًا");
    for (const member of room.members) {
      const extraVoiceSeconds = member.voiceJoinedAt ? Math.max(0, Math.floor((now.getTime() - member.voiceJoinedAt.getTime()) / 1000)) : 0;
      const didPlay = eligible.some((candidate) => candidate.userId === member.userId);
      await tx.lfgMember.update({
        where: { roomId_userId: { roomId, userId: member.userId } },
        data: didPlay
          ? { status: "COMPLETED", completedAt: now, voiceJoinedAt: null, voiceSeconds: { increment: extraVoiceSeconds }, played: true }
          : { status: "LEFT", leftAt: now, voiceJoinedAt: null, voiceSeconds: { increment: extraVoiceSeconds } },
      });
      if (!didPlay) continue;
      const points = member.userId === room.hostId ? 5 : 2;
      await tx.engagementPoint.upsert({ where: { userId_source: { userId: member.userId, source: `lfg_completed:${roomId}` } }, update: {}, create: { userId: member.userId, points, source: `lfg_completed:${roomId}` } });
    }
    return eligible.map((member) => member.userId);
  });
  await Promise.all(rewardedUsers.map((userId) => awardLoyaltyPoints({ userId, amount: 35, reason: "إكمال جلسة LFG", referenceKey: `lfg-completed:${roomId}:${userId}` })));
  await Promise.all(rewardedUsers.map((userId) => awardLoyaltyPoints({ userId, amount: 20, reason: "مهمة يومية: جلسة LFG", referenceKey: `mission:lfg:${new Date().toISOString().slice(0, 10)}:${userId}` })));
  const room = await getLfgRoom(roomId);
  publish({ type: "lfg.completed", roomId, room });
  publish({ type: "leaderboard.updated" });
  return room;
}

export async function listLfgRooms() {
  const recentlyCompleted = new Date(Date.now() - 2 * 60_000);
  const rooms = await db.lfgRoom.findMany({ where: { OR: [{ status: { in: ["SCHEDULED", "OPEN", "FULL", "ACTIVE"] } }, { status: "COMPLETED", completedAt: { gte: recentlyCompleted } }] }, include: roomInclude, orderBy: [{ scheduledFor: "asc" }, { createdAt: "desc" }], take: 100 });
  return rooms.map(toLiveRoom);
}

export async function getLfgRoom(roomId: string): Promise<LiveRoom> {
  const room = await db.lfgRoom.findUniqueOrThrow({ where: { id: roomId }, include: roomInclude });
  return toLiveRoom(room);
}

export async function listPendingRatingRooms() {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60_000);
  const rooms = await db.lfgRoom.findMany({
    where: { status: "COMPLETED", ratingRequestedAt: null, completedAt: { gte: since } },
    include: roomInclude,
    orderBy: { completedAt: "asc" },
    take: 50,
  });
  return rooms.map(toLiveRoom);
}

export async function markRatingRequestsDelivered(roomId: string) {
  await db.lfgRoom.update({ where: { id: roomId }, data: { ratingRequestedAt: new Date() } });
  return { delivered: true };
}

export async function setLfgListing(roomId: string, listingChannelId: string, listingMessageId: string) {
  await db.lfgRoom.update({ where: { id: roomId }, data: { listingChannelId, listingMessageId } });
  return getLfgRoom(roomId);
}

export async function setLfgChannels(roomId: string, input: { categoryId?: string; textChannelId?: string; voiceChannelId?: string; controlMessageId?: string }) {
  await db.lfgRoom.update({
    where: { id: roomId },
    data: {
      categoryId: input.categoryId,
      textChannelId: input.textChannelId,
      voiceChannelId: input.voiceChannelId,
      controlMessageId: input.controlMessageId,
      channelsDeletedAt: null,
    },
  });
  const room = await getLfgRoom(roomId);
  publish({ type: "lfg.room_created", room });
  return room;
}

export async function markLfgChannelsDeleted(roomId: string) {
  return db.lfgRoom.update({ where: { id: roomId }, data: { channelsDeletedAt: new Date() } });
}

export async function markLfgReminderDelivered(roomId: string) {
  await db.lfgRoom.update({ where: { id: roomId }, data: { reminderDeliveredAt: new Date() } });
  return getLfgRoom(roomId);
}

export async function listRoomCleanupResources() {
  const settings = await getGuildRuntimeSettings();
  const rooms = await db.lfgRoom.findMany({
    where: {
      status: { in: settings.deleteExpiredAutoRooms ? ["COMPLETED", "CLOSED", "EXPIRED"] : ["COMPLETED", "CLOSED"] },
      channelsDeletedAt: null,
      OR: [{ textChannelId: { not: null } }, { voiceChannelId: { not: null } }],
    },
    include: roomInclude,
    take: 100,
  });
  return rooms.map(toLiveRoom);
}

export async function updateLfgRoom(roomId: string, actorId: string, input: { title?: string | null; description?: string | null; gameMode?: string | null; mapName?: string | null; maxPlayers?: number; durationMinutes?: number; needsVoice?: boolean; locked?: boolean; roomEmoji?: string | null; accentColor?: string }) {
  const current = await assertRoomHost(roomId, actorId);
  if (!["SCHEDULED", "OPEN", "FULL", "ACTIVE"].includes(current.status)) throw new Error("لا يمكن تعديل غرفة منتهية");
  const game = await db.lfgGameCatalog.findUniqueOrThrow({ where: { id: current.lfgGameId } });
  const maxPlayers = input.maxPlayers === undefined ? current.maxPlayers : Math.min(game.maxPlayers, Math.max(game.minPlayers, input.maxPlayers));
  if (maxPlayers < current.memberCount) throw new Error("العدد الجديد أقل من عدد اللاعبين الموجودين");
  const room = await db.lfgRoom.update({
    where: { id: roomId },
    data: {
      title: input.title === undefined ? undefined : input.title?.trim() || null,
      description: input.description === undefined ? undefined : input.description?.trim() || null,
      gameMode: input.gameMode === undefined ? undefined : input.gameMode?.trim() || null,
      mapName: input.mapName === undefined ? undefined : input.mapName?.trim() || null,
      maxPlayers,
      durationMinutes: input.durationMinutes === undefined ? undefined : Math.min(360, Math.max(15, input.durationMinutes)),
      needsVoice: input.needsVoice,
      locked: input.locked,
      roomEmoji: input.roomEmoji === undefined ? undefined : input.roomEmoji?.trim().slice(0, 12) || current.roomEmoji,
      accentColor: input.accentColor === undefined ? undefined : validColor(input.accentColor) ?? current.accentColor,
      status: current.status === "SCHEDULED" ? "SCHEDULED" : current.status === "ACTIVE" ? "ACTIVE" : current.memberCount >= maxPlayers ? "FULL" : "OPEN",
      version: { increment: 1 },
    },
  });
  if (room.startedAt && input.durationMinutes !== undefined) {
    await db.lfgRoom.update({ where: { id: roomId }, data: { playEndsAt: new Date(room.startedAt.getTime() + room.durationMinutes * 60_000) } });
  }
  const live = await getLfgRoom(roomId);
  publish({ type: "lfg.updated", room: live });
  return live;
}

export async function startLfgRoom(roomId: string, actorId: string) {
  const current = await assertRoomHost(roomId, actorId);
  if (!["SCHEDULED", "OPEN", "FULL", "ACTIVE"].includes(current.status)) throw new Error("الغرفة منتهية");
  if (current.scheduledFor && current.scheduledFor.getTime() > Date.now() + 10 * 60_000) throw new Error("يمكن بدء الجلسة قبل الموعد بعشر دقائق فقط");
  if (current.memberCount < 2) throw new Error("تحتاج لاعبين اثنين على الأقل لبدء اللعب");
  if (current.status !== "ACTIVE") {
    const startedAt = new Date();
    await db.lfgRoom.update({
      where: { id: roomId },
      data: { status: "ACTIVE", startedAt, playEndsAt: new Date(startedAt.getTime() + current.durationMinutes * 60_000), emptySince: null, attendanceWarningAt: null, autoDeleteAt: null, expiresAt: null, version: { increment: 1 } },
    });
    if (!current.needsVoice) await db.lfgMember.updateMany({ where: { roomId, status: "ACTIVE" }, data: { played: true } });
  }
  const room = await getLfgRoom(roomId);
  publish({ type: "lfg.started", room });
  return room;
}

export async function closeLfgRoom(roomId: string, actorId?: string, allowAdmin = false) {
  const current = await db.lfgRoom.findUniqueOrThrow({ where: { id: roomId } });
  if (actorId && !allowAdmin && current.hostId !== actorId) throw new Error("هذا الإجراء متاح لمضيف الغرفة فقط");
  if (["COMPLETED", "CLOSED"].includes(current.status)) return getLfgRoom(roomId);
  const now = new Date();
  await serializable(async (tx) => {
    const members = await tx.lfgMember.findMany({ where: { roomId, status: "ACTIVE" } });
    for (const member of members) {
      const extraVoiceSeconds = member.voiceJoinedAt ? Math.max(0, Math.floor((now.getTime() - member.voiceJoinedAt.getTime()) / 1000)) : 0;
      await tx.lfgMember.update({ where: { roomId_userId: { roomId, userId: member.userId } }, data: { status: "LEFT", leftAt: now, voiceJoinedAt: null, voiceSeconds: { increment: extraVoiceSeconds } } });
    }
    await tx.lfgRoom.update({ where: { id: roomId }, data: { status: "CLOSED", closedAt: now, memberCount: 0, emptySince: null, autoDeleteAt: null, version: { increment: 1 } } });
  });
  const room = await getLfgRoom(roomId);
  publish({ type: "lfg.closed", roomId, room });
  return room;
}

export async function recordLfgVoiceEvent(roomId: string, input: { userId: string; displayName: string; avatarUrl?: string; action: "JOIN" | "LEAVE" }) {
  const settings = await getGuildRuntimeSettings();
  await upsertActor(input);
  await serializable(async (tx) => {
    const room = await tx.lfgRoom.findUniqueOrThrow({ where: { id: roomId }, include: { lfgGame: { select: { minPlayers: true } } } });
    if (!["SCHEDULED", "OPEN", "FULL", "ACTIVE"].includes(room.status)) return;
    const member = await tx.lfgMember.findUnique({ where: { roomId_userId: { roomId, userId: input.userId } } });
    if (!member || member.status !== "ACTIVE") throw new Error("العضو ليس مسجلًا في هذه الغرفة");
    const now = new Date();
    if (input.action === "JOIN") {
      if (!member.voiceJoinedAt) await tx.lfgMember.update({ where: { roomId_userId: { roomId, userId: input.userId } }, data: { voiceJoinedAt: now } });
      const voiceMembers = await tx.lfgMember.findMany({ where: { roomId, status: "ACTIVE", voiceJoinedAt: { not: null } } });
      const startWindowOpen = !room.scheduledFor || room.scheduledFor.getTime() <= now.getTime();
      const shouldStart = startWindowOpen && voiceMembers.length >= room.lfgGame.minPlayers && room.status !== "ACTIVE";
      const sessionActive = room.status === "ACTIVE" || shouldStart;
      await tx.lfgRoom.update({
        where: { id: roomId },
        data: {
          status: shouldStart ? "ACTIVE" : room.status,
          startedAt: shouldStart ? now : room.startedAt,
          playEndsAt: shouldStart ? new Date(now.getTime() + room.durationMinutes * 60_000) : room.playEndsAt,
          emptySince: null,
          singlePlayerSince: voiceMembers.length === 1 ? now : null,
          idleWarningAt: null,
          lastVoiceActivityAt: now,
          attendanceWarningAt: sessionActive ? null : room.attendanceWarningAt,
          autoDeleteAt: sessionActive ? null : room.autoDeleteAt,
          expiresAt: sessionActive ? null : room.expiresAt,
          version: { increment: 1 },
        },
      });
      if (voiceMembers.length >= room.lfgGame.minPlayers || room.status === "ACTIVE") await tx.lfgMember.updateMany({ where: { roomId, status: "ACTIVE", voiceJoinedAt: { not: null } }, data: { played: true } });
    } else if (member.voiceJoinedAt) {
      const elapsed = Math.max(0, Math.floor((now.getTime() - member.voiceJoinedAt.getTime()) / 1000));
      await tx.lfgMember.update({ where: { roomId_userId: { roomId, userId: input.userId } }, data: { voiceJoinedAt: null, voiceSeconds: { increment: elapsed }, played: member.played || room.status === "ACTIVE" || elapsed >= 60 } });
      const connected = await tx.lfgMember.count({ where: { roomId, status: "ACTIVE", voiceJoinedAt: { not: null } } });
      if (connected === 0 && room.startedAt) await tx.lfgRoom.update({ where: { id: roomId }, data: { emptySince: now, singlePlayerSince: null, lastVoiceActivityAt: now, autoDeleteAt: new Date(now.getTime() + settings.voiceEmptyGraceMinutes * 60_000), version: { increment: 1 } } });
      else if (connected === 1 && room.startedAt) await tx.lfgRoom.update({ where: { id: roomId }, data: { emptySince: null, singlePlayerSince: now, lastVoiceActivityAt: now, version: { increment: 1 } } });
    }
  });
  const room = await getLfgRoom(roomId);
  publish({ type: input.action === "JOIN" ? "lfg.voice_joined" : "lfg.voice_left", room, userId: input.userId });
  if (room.status === "ACTIVE" && room.startedAt) publish({ type: "lfg.started", room });
  return room;
}

export async function processDueLfgRooms() {
  const now = new Date();
  const settings = await getGuildRuntimeSettings();
  const readyCutoff = new Date(now.getTime() + 10 * 60_000);
  const readyRooms = await db.lfgRoom.findMany({
    where: { status: "SCHEDULED", scheduledFor: { lte: readyCutoff }, readyNotifiedAt: null },
    include: roomInclude,
    take: 50,
  });
  for (const room of readyRooms) {
    const claimed = await db.lfgRoom.updateMany({ where: { id: room.id, readyNotifiedAt: null }, data: { readyNotifiedAt: now, version: { increment: 1 } } });
    if (claimed.count === 1) publish({ type: "lfg.room_ready", room: await getLfgRoom(room.id) });
  }
  const startingRooms = await db.lfgRoom.findMany({
    where: { status: "SCHEDULED", scheduledFor: { lte: now } },
    select: {
      id: true, memberCount: true, maxPlayers: true, durationMinutes: true, needsVoice: true,
      lfgGame: { select: { minPlayers: true } },
      members: { where: { status: "ACTIVE", voiceJoinedAt: { not: null } }, select: { userId: true } },
    },
    take: 50,
  });
  for (const room of startingRooms) {
    const hasStartedAttendance = room.needsVoice ? room.members.length >= room.lfgGame.minPlayers : room.memberCount >= room.lfgGame.minPlayers;
    const updated = await db.lfgRoom.updateMany({
      where: { id: room.id, status: "SCHEDULED" },
      data: hasStartedAttendance
        ? { status: "ACTIVE", startedAt: now, playEndsAt: new Date(now.getTime() + room.durationMinutes * 60_000), attendanceWarningAt: null, autoDeleteAt: null, expiresAt: null, version: { increment: 1 } }
        : { status: room.memberCount >= room.maxPlayers ? "FULL" : "OPEN", version: { increment: 1 } },
    });
    if (updated.count !== 1) continue;
    if (hasStartedAttendance) {
      await db.lfgMember.updateMany({
        where: { roomId: room.id, status: "ACTIVE", ...(room.needsVoice ? { voiceJoinedAt: { not: null } } : {}) },
        data: { played: true },
      });
    }
    const live = await getLfgRoom(room.id);
    publish({ type: hasStartedAttendance ? "lfg.started" : "lfg.updated", room: live });
  }
  const gatherCutoff = new Date(now.getTime() - LFG_GATHER_WINDOW_MINUTES * 60_000);
  const attendanceRooms = await db.lfgRoom.findMany({
    where: {
      status: { in: ["OPEN", "FULL"] }, startedAt: null, attendanceWarningAt: null,
      OR: [{ scheduledFor: { lte: gatherCutoff } }, { scheduledFor: null, createdAt: { lte: gatherCutoff } }],
    },
    select: { id: true }, take: 50,
  });
  for (const room of attendanceRooms) {
    const claimed = await db.lfgRoom.updateMany({
      where: { id: room.id, attendanceWarningAt: null, startedAt: null },
      data: { attendanceWarningAt: now, autoDeleteAt: lfgWarningCloseAt(now), expiresAt: null, version: { increment: 1 } },
    });
    if (claimed.count === 1) publish({ type: "lfg.attendance_warning", room: await getLfgRoom(room.id) });
  }
  // A lone player gets a warning event first; the Discord bot delivers it to
  // the room. Returning players clear singlePlayerSince in the voice handler.
  const idleRooms = await db.lfgRoom.findMany({ where: { status: "ACTIVE", singlePlayerSince: { lte: new Date(now.getTime() - settings.singlePlayerIdleMinutes * 60_000) }, idleWarningAt: null }, select: { id: true }, take: 50 });
  for (const room of idleRooms) {
    const claimed = await db.lfgRoom.updateMany({ where: { id: room.id, idleWarningAt: null }, data: { idleWarningAt: now, autoDeleteAt: new Date(now.getTime() + 5 * 60_000), version: { increment: 1 } } });
    if (claimed.count) publish({ type: "lfg.attendance_warning", room: await getLfgRoom(room.id) });
  }
  const due = await db.lfgRoom.findMany({
    where: {
      status: { in: ["SCHEDULED", "OPEN", "FULL", "ACTIVE"] },
      OR: [{ playEndsAt: { lte: now } }, { autoDeleteAt: { lte: now } }],
    },
    select: { id: true, startedAt: true },
    take: 50,
  });
  for (const room of due) {
    if (room.startedAt) {
      try { await completeLfgRoom(room.id); }
      catch (error) {
        console.error(`Automatic completion failed for LFG room ${room.id}; closing safely`, error);
        await closeLfgRoom(room.id);
      }
    } else {
      await closeLfgRoom(room.id);
    }
  }
  return { processed: due.length, readied: readyRooms.length, started: startingRooms.length, warned: attendanceRooms.length, idled: idleRooms.length, expired: 0 };
}

export async function searchLfgRooms(query: string) {
  const q = query.trim();
  if (!q) return listLfgRooms();
  const rooms = await db.lfgRoom.findMany({
    where: {
      status: { in: ["SCHEDULED", "OPEN", "FULL", "ACTIVE"] },
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
        { gameMode: { contains: q, mode: "insensitive" } },
        { mapName: { contains: q, mode: "insensitive" } },
        { lfgGame: { name: { contains: q, mode: "insensitive" } } },
        { lfgGame: { slug: { contains: q, mode: "insensitive" } } },
        { host: { displayName: { contains: q, mode: "insensitive" } } },
        { members: { some: { status: "ACTIVE", user: { displayName: { contains: q, mode: "insensitive" } } } } },
      ],
    },
    include: roomInclude,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 50,
  });
  return rooms.map(toLiveRoom);
}

export async function getNotificationCandidates(roomId: string) {
  const settings = await getGuildRuntimeSettings();
  if (!settings.dmNotificationsEnabled || settings.maxDmPerDay === 0) return [];
  const room = await db.lfgRoom.findUniqueOrThrow({ where: { id: roomId } });
  const isAutomaticRoom = room.source === "AUTO";
  if (isAutomaticRoom && !settings.autoRoomDmInterestedUsers) return [];
  const candidates = await db.userGamePreference.findMany({
    where: {
      lfgGameId: room.lfgGameId,
      interestStatus: "INTERESTED",
      notificationsEnabled: true,
      ...(isAutomaticRoom ? { autoInvitesEnabled: true } : {}),
      OR: [{ mutedUntil: null }, { mutedUntil: { lt: new Date() } }],
      userId: { not: room.hostId },
    },
    include: { user: { include: { weeklyAvailability: true } }, game: true },
    take: 50,
  });
  // Marking a game as interested is an explicit opt-in for room invitations.
  // Availability is only used by the smart organiser, not for suppressing a
  // room alert that the member has explicitly requested.
  const selected = [];
  for (const candidate of candidates) {
    try {
      const dedupeKey = `${roomId}:${candidate.userId}`;
      const previous = await db.notificationDelivery.findUnique({ where: { dedupeKey }, select: { status: true } });
      if (previous?.status === "SENT" || previous?.status === "IGNORED") continue;
      if (previous) {
        await db.notificationDelivery.update({ where: { dedupeKey }, data: { status: "RESERVED", sentAt: null, ignoredAt: null } });
      } else {
        await db.notificationDelivery.create({ data: { userId: candidate.userId, lfgGameId: room.lfgGameId, roomId, dedupeKey } });
      }
      selected.push(candidate);
      if (selected.length >= 25) break;
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
      // Another worker reserved this invitation first; it will deliver it.
    }
  }
  return selected;
}

function isUserAvailableForLfg(user: { currentActivity: string; activityUntil: Date | null; weeklyAvailability: Array<{ dayOfWeek: number; startMinute: number; endMinute: number; activity: string }> }, now: Date) {
  const activeUntil = user.activityUntil && user.activityUntil.getTime() > now.getTime();
  if (user.currentActivity === "FREE" && (!user.activityUntil || activeUntil)) return true;
  // أي حالة فعالة غير "فاضي" لها الأولوية على الجدول حتى لا نزعج عضوًا يدرس أو ينام.
  if (activeUntil) return false;
  const dayOfWeek = now.getDay();
  const minute = now.getHours() * 60 + now.getMinutes();
  return user.weeklyAvailability.some((slot) => slot.dayOfWeek === dayOfWeek && slot.activity === "FREE" && slot.startMinute <= minute && minute < slot.endMinute);
}

export async function markNotificationDelivery(roomId: string, userId: string, status: "SENT" | "IGNORED" | "FAILED") {
  const now = new Date();
  return db.notificationDelivery.update({
    where: { dedupeKey: `${roomId}:${userId}` },
    data: {
      status,
      sentAt: status === "SENT" ? now : undefined,
      ignoredAt: status === "IGNORED" ? now : undefined,
    },
  });
}

const roomInclude = Prisma.validator<Prisma.LfgRoomInclude>()({ host: true, lfgGame: true, members: { include: { user: true }, orderBy: { joinedAt: "asc" } } });
type RoomWithRelations = Prisma.LfgRoomGetPayload<{ include: typeof roomInclude }>;

function toLiveRoom(room: RoomWithRelations): LiveRoom {
  const activeMembers = room.members.filter((member) => member.status === "ACTIVE" || member.status === "COMPLETED");
  return {
    id: room.id,
    hostId: room.hostId,
    hostName: room.host.displayName,
    hostAvatarUrl: room.host.avatarUrl ?? undefined,
    lfgGameId: room.lfgGame.id,
    gameSlug: room.lfgGame.slug,
    gameName: room.lfgGame.name,
    gameIcon: room.lfgGame.icon ?? undefined,
    title: room.title ?? undefined,
    status: room.status,
    source: room.source,
    currentPlayers: room.status === "COMPLETED" ? activeMembers.length : room.memberCount,
    maxPlayers: room.maxPlayers,
    durationMinutes: room.durationMinutes,
    createdAt: room.createdAt.toISOString(),
    scheduledFor: room.scheduledFor?.toISOString(),
    readyNotifiedAt: room.readyNotifiedAt?.toISOString(),
    reminderDeliveredAt: room.reminderDeliveredAt?.toISOString(),
    attendanceWarningAt: room.attendanceWarningAt?.toISOString(),
    idleWarningAt: room.idleWarningAt?.toISOString(),
    startedAt: room.startedAt?.toISOString(),
    playEndsAt: room.playEndsAt?.toISOString(),
    completedAt: room.completedAt?.toISOString(),
    autoDeleteAt: room.autoDeleteAt?.toISOString(),
    expiresAt: room.expiresAt?.toISOString(),
    lastVoiceActivityAt: room.lastVoiceActivityAt?.toISOString(),
    singlePlayerSince: room.singlePlayerSince?.toISOString(),
    needsVoice: room.needsVoice,
    locked: room.locked,
    roomEmoji: room.roomEmoji ?? undefined,
    accentColor: room.accentColor,
    gameMode: room.gameMode ?? undefined,
    mapName: room.mapName ?? undefined,
    description: room.description ?? undefined,
    textChannelId: room.textChannelId ?? undefined,
    voiceChannelId: room.voiceChannelId ?? undefined,
    categoryId: room.categoryId ?? undefined,
    controlMessageId: room.controlMessageId ?? undefined,
    listingChannelId: room.listingChannelId ?? undefined,
    listingMessageId: room.listingMessageId ?? undefined,
    members: activeMembers.map((member) => ({ id: member.user.id, displayName: member.user.displayName, avatarUrl: member.user.avatarUrl ?? undefined, voiceActive: Boolean(member.voiceJoinedAt), voiceSeconds: member.voiceSeconds + (member.voiceJoinedAt ? Math.max(0, Math.floor((Date.now() - member.voiceJoinedAt.getTime()) / 1000)) : 0) })),
  };
}

async function upsertActor(input: { userId: string; displayName: string; avatarUrl?: string }) {
  return db.user.upsert({
    where: { id: input.userId },
    update: { displayName: input.displayName, avatarUrl: input.avatarUrl },
    create: { id: input.userId, displayName: input.displayName, avatarUrl: input.avatarUrl },
  });
}

function normalizeSchedule(value?: Date) {
  if (!value) return undefined;
  if (Number.isNaN(value.getTime())) throw new Error("موعد اللعب غير صالح");
  const minimum = Date.now() + 2 * 60_000;
  const maximum = Date.now() + 30 * 24 * 60 * 60_000;
  if (value.getTime() < minimum) throw new Error("اختر موعدًا بعد دقيقتين على الأقل أو استخدم ألعب الآن");
  if (value.getTime() > maximum) throw new Error("يمكن جدولة LFG خلال 30 يومًا كحد أقصى");
  return value;
}

async function assertRoomHost(roomId: string, actorId: string) {
  const room = await db.lfgRoom.findUniqueOrThrow({ where: { id: roomId } });
  if (room.hostId !== actorId) throw new Error("هذا الإجراء متاح لمضيف الغرفة فقط");
  return room;
}

function validColor(value?: string | null) {
  if (!value) return undefined;
  const normalized = value.startsWith("#") ? value.toLowerCase() : `#${value.toLowerCase()}`;
  return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : undefined;
}
