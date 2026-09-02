import "dotenv/config";
import { timingSafeEqual } from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import cookie from "@fastify/cookie";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "../../../packages/db/src/client.js";
import { closeEvents, initEvents, subscribe } from "./events.js";
import { advanceZarkRace, answerDaily, answerZarkRace, expireZarkRace, getOrCreateDaily, leaderboard, listZarkGames, startZarkRace } from "./service.js";
import { closeLfgRoom, completeLfgRoom, createLfgRoom, getLfgCatalog, getLfgInterestInsights, getLfgRoom, getNotificationCandidates, getSmartRoomDashboard, getSmartRoomHistory, getUserPreferences, joinLfgRoom, kickLfgMember, leaveLfgRoom, listLfgRooms, listPendingRatingRooms, listRoomCleanupResources, markLfgChannelsDeleted, markLfgReminderDelivered, markNotificationDelivery, markRatingRequestsDelivered, muteGameNotifications, processAutoSmartRooms, processDueLfgRooms, quickMatchLfg, recordLfgVoiceEvent, searchLfgRooms, setLfgChannels, setLfgListing, smartMatchLfg, snoozeGameNotifications, startLfgRoom, syncLfgUserIdentity, updateLfgRoom, updateUserPreference } from "./modules/lfg/service.js";
import { getAvailability, getTopLfgPlayers, getUnifiedProfile, updateAvailability, updateProfileSettings } from "./modules/profiles/service.js";
import { addReportMessage, deleteReportTicket, getMyReports, getReportThreadForAdmin, getReportThreadForUser, rateLfgPlayer, rateLfgRoom, reportBug, reportPlayer, setReportPresence, updateReportStatus } from "./modules/feedback/service.js";
import { addGameQuestion, claimBumpReminder, createLfgCategory, deleteGameQuestion, getAdminDashboard, getAdminFeedback, getGuildRuntimeSettings, getZarkGameContent, recordBumpCompleted, recordServiceHeartbeat, setAutoSmartRoomsEnabled, updateGameQuestion, updateGuildRuntimeSettings, upsertLfgGame } from "./modules/admin/service.js";
import { askSupport, diagnoseSupportAi, getSupportStatus } from "./modules/support/service.js";
import { buyVip, getLoyaltyProfile, listLoyaltyRoleMembers, startLoyaltyBoost, weeklyLoyaltyLeaderboard } from "./modules/loyalty/service.js";
import { getSecuritySettings, isSuspended, pendingRestorations, recentTimeoutActions, recordSecurityAction, restoreSuspendedAdmin, securityDashboard, updateSecuritySettings } from "./modules/security/service.js";
import { answerTradeCompletion, createTrade, decideInterest, expireDueTrades, expressInterest, getTrade, getTradeConversation, isCurrentTradeModerator, listTradeInbox, listTrades, readTradeNotifications, reportTrade, requestTradeCompletion, resolveTradeReport, reviewTrade, reviseTradeMessage, sendTradeMessage, setTradeDiscordMessage, setTradeStatus, tradeModerationDashboard, tradeNotifications, updateTrade } from "./modules/trade/service.js";
import { claimBroadcast, createBroadcast, getPendingBroadcast, listBroadcasts, updateBroadcastProgress } from "./modules/broadcast/service.js";
import { getWebUser, HttpError, isCurrentWebAdmin, isWebOwner, registerDiscordAuth, requireWebAdmin, requireWebOwner, requireWebUser } from "./auth.js";

const app = Fastify({ logger: true, bodyLimit: 2 * 1024 * 1024 });
const uploadedImageSchema = z.string().max(2_000_000).refine((value) => /^data:image\/(?:png|jpeg|webp|gif);base64,/i.test(value) || /^https:\/\//i.test(value), "صورة غير صالحة");
const arabicFontPath = path.resolve(process.cwd(), "apps/bot/src/fonts/NotoSansArabic.ttf");
const arabicFont = fs.existsSync(arabicFontPath) ? fs.readFileSync(arabicFontPath) : undefined;
const roomUpdateSchema = z.object({
  title: z.string().max(80).nullable().optional(),
  description: z.string().max(500).nullable().optional(),
  gameMode: z.string().max(80).nullable().optional(),
  mapName: z.string().max(100).nullable().optional(),
  maxPlayers: z.number().int().min(2).max(50).optional(),
  durationMinutes: z.number().int().min(15).max(360).optional(),
  needsVoice: z.boolean().optional(),
  locked: z.boolean().optional(),
  roomEmoji: z.string().max(12).nullable().optional(),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});
await initEvents();
await app.register(cookie);
const siteOrigins = (process.env.PUBLIC_SITE_ORIGINS ?? "http://localhost:3000").split(",").map((origin) => origin.trim()).filter(Boolean);
await app.register(cors, { origin: siteOrigins, credentials: true });
app.addHook("onSend", async (_request, reply) => {
  reply.header("X-Content-Type-Options", "nosniff");
  reply.header("X-Frame-Options", "DENY");
  reply.header("Referrer-Policy", "strict-origin-when-cross-origin");
  reply.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  reply.header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://cdn.discordapp.com; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
});
app.addHook("preHandler", async (request) => {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) return;
  if (!request.url.startsWith("/api/me/") && !request.url.startsWith("/api/web-admin/")) return;
  const origin = request.headers.origin;
  if (!origin) return;
  const sameHost = (() => { try { return new URL(origin).host === request.headers.host; } catch { return false; } })();
  if (!sameHost && !siteOrigins.includes(origin)) throw new HttpError("تعذر التحقق من مصدر الطلب", 403);
});
await app.register(fastifyStatic, {
  root: path.resolve(process.cwd(), "apps/web/public"),
  setHeaders(response, filePath) {
    if (/\.(?:html|js|css)$/i.test(filePath)) response.header("cache-control", "no-cache, no-store, must-revalidate");
  },
});
await registerDiscordAuth(app);

app.get("/trade/:id", async (_request, reply) => reply.sendFile("trade.html"));

app.get("/health", async () => ({ ok: true, service: "zark-api" }));
app.get("/assets/fonts/zark-arabic.ttf", async (_request, reply) => {
  if (!arabicFont) return reply.code(404).send({ error: "Arabic font asset is unavailable" });
  return reply
    .header("Cache-Control", "public, max-age=31536000, immutable")
    .type("font/ttf")
    .send(arabicFont);
});
app.get("/api/me", async (request) => {
  const user = await getWebUser(request);
  if (!user) return { user: null };
  const isAdmin = await isCurrentWebAdmin(user).catch((error) => { app.log.warn(error, "Live Discord role check failed for /api/me"); return false; });
  return { user: { userId: user.userId, displayName: user.displayName, avatarUrl: user.avatarUrl, isAdmin, isOwner: isWebOwner(user) } };
});
app.get("/api/me/profile", async (request) => getUnifiedProfile((await requireWebUser(request)).userId, true));
app.get("/api/me/loyalty", async (request) => getLoyaltyProfile((await requireWebUser(request)).userId));
app.post("/api/me/loyalty/buy-vip", async (request) => buyVip((await requireWebUser(request)).userId));
const tradeStatusSchema = z.enum(["OPEN", "PENDING", "COMPLETION_PENDING", "COMPLETED", "CANCELLED", "EXPIRED", "DISPUTED", "REMOVED"]);
const tradeReasonSchema = z.enum(["SCAM_FRAUD", "HARASSMENT", "MISLEADING_TRADE", "SPAM", "PROHIBITED_CONTENT", "OTHER"]);
const tradeCreateSchema = z.object({ gameSlug: z.string().min(1).max(80), itemName: z.string().min(1).max(100), imageData: z.string().min(30).max(2_000_000), haveText: z.string().min(1).max(300), wantText: z.string().min(1).max(300), description: z.string().max(1000).optional(), acceptedTerms: z.literal(true) });
app.get("/api/trades", async (request) => {
  const query = z.object({ search: z.string().max(80).optional(), game: z.string().max(80).optional(), status: tradeStatusSchema.optional(), sort: z.enum(["newest", "oldest", "active"]).optional() }).parse(request.query);
  return listTrades(query);
});
app.get("/api/trades/:id", async (request) => {
  const params = z.object({ id: z.string() }).parse(request.params);
  const user = await getWebUser(request);
  return getTrade(params.id, user?.userId);
});
app.put("/api/trades/:id/discord", { preHandler: requireServiceKey }, async (request) => {
  const params = z.object({ id: z.string() }).parse(request.params);
  const body = z.object({ channelId: z.string().min(1).max(30), messageId: z.string().min(1).max(30) }).parse(request.body);
  return setTradeDiscordMessage(params.id, body.channelId, body.messageId);
});
app.get("/api/me/trades", async (request) => listTrades({ ownerId: (await requireWebUser(request)).userId, status: undefined }));
app.post("/api/me/trades", async (request) => createTrade(await requireWebUser(request), tradeCreateSchema.parse(request.body)));
app.patch("/api/me/trades/:id", async (request) => {
  const params = z.object({ id: z.string() }).parse(request.params);
  const body = tradeCreateSchema.omit({ gameSlug: true, acceptedTerms: true }).partial().parse(request.body);
  return updateTrade(params.id, await requireWebUser(request), body);
});
app.post("/api/me/trades/:id/close", async (request) => setTradeStatus(z.object({ id: z.string() }).parse(request.params).id, await requireWebUser(request), "CANCELLED"));
app.post("/api/me/trades/:id/interest", async (request) => expressInterest(z.object({ id: z.string() }).parse(request.params).id, await requireWebUser(request)));
app.post("/api/me/trade-interests/:id/decision", async (request) => {
  const params = z.object({ id: z.string() }).parse(request.params);
  const body = z.object({ decision: z.enum(["ACCEPTED", "DECLINED"]) }).parse(request.body);
  return decideInterest(params.id, await requireWebUser(request), body.decision);
});
app.get("/api/me/trade-inbox", async (request) => listTradeInbox(await requireWebUser(request)));
app.get("/api/me/trade-conversations/:id", async (request) => getTradeConversation(z.object({ id: z.string() }).parse(request.params).id, await requireWebUser(request)));
app.post("/api/me/trade-conversations/:id/messages", async (request) => {
  const params = z.object({ id: z.string() }).parse(request.params);
  const body = z.object({ content: z.string().min(1).max(1500) }).parse(request.body);
  return sendTradeMessage(params.id, await requireWebUser(request), body.content);
});
app.patch("/api/me/trade-messages/:id", async (request) => {
  const params = z.object({ id: z.string() }).parse(request.params);
  const body = z.object({ content: z.string().min(1).max(1500).optional(), delete: z.boolean().optional() }).refine((value) => value.delete || value.content, "اكتب الرسالة").parse(request.body);
  return reviseTradeMessage(params.id, await requireWebUser(request), body);
});
app.post("/api/me/trades/:id/completion", async (request) => {
  const params = z.object({ id: z.string() }).parse(request.params);
  const body = z.object({ conversationId: z.string() }).parse(request.body);
  return requestTradeCompletion(params.id, body.conversationId, await requireWebUser(request));
});
app.post("/api/me/trades/:id/completion-answer", async (request) => {
  const params = z.object({ id: z.string() }).parse(request.params);
  const body = z.object({ conversationId: z.string(), answer: z.enum(["CONFIRM", "DISPUTE"]) }).parse(request.body);
  return answerTradeCompletion(params.id, body.conversationId, await requireWebUser(request), body.answer);
});
app.post("/api/me/trades/:id/reviews", async (request) => {
  const params = z.object({ id: z.string() }).parse(request.params);
  const body = z.object({ conversationId: z.string(), rating: z.number().int().min(1).max(5), comment: z.string().max(500).optional() }).parse(request.body);
  return reviewTrade(params.id, body.conversationId, await requireWebUser(request), body);
});
app.post("/api/me/trades/:id/reports", async (request) => {
  const params = z.object({ id: z.string() }).parse(request.params);
  const body = z.object({ conversationId: z.string().optional(), messageId: z.string().optional(), reportedUserId: z.string().optional(), reason: tradeReasonSchema, details: z.string().max(1500).optional() }).parse(request.body);
  return reportTrade(params.id, await requireWebUser(request), body);
});
app.get("/api/me/trade-notifications", async (request) => tradeNotifications((await requireWebUser(request)).userId));
app.post("/api/me/trade-notifications/read", async (request) => readTradeNotifications((await requireWebUser(request)).userId));
app.get("/api/web-admin/trade", async (request) => tradeModerationDashboard(await requireWebUser(request)));
app.patch("/api/web-admin/trade/reports/:id", async (request) => {
  const user = await requireWebUser(request);
  if (!(await isCurrentTradeModerator(user))) throw new HttpError("لا تملك صلاحية إدارة Trade", 403);
  const params = z.object({ id: z.string() }).parse(request.params);
  const body = z.object({ status: z.enum(["DISMISSED", "ACTIONED", "REVIEWING"]), resolution: z.string().max(1000).optional(), tradeAction: z.enum(["NONE", "REMOVE", "DISPUTE", "CLOSE"]).optional() }).parse(request.body);
  return resolveTradeReport(params.id, user, body);
});
app.post("/api/web-admin/trades/:id/remove", async (request) => {
  const user = await requireWebUser(request);
  if (!(await isCurrentTradeModerator(user))) throw new HttpError("لا تملك صلاحية إدارة Trade", 403);
  return setTradeStatus(z.object({ id: z.string() }).parse(request.params).id, user, "REMOVED");
});
app.get("/api/loyalty/weekly", weeklyLoyaltyLeaderboard);
app.put("/api/me/profile/settings", async (request) => {
  const user = await requireWebUser(request);
  const body = z.object({ bio: z.string().max(160).nullable().optional(), profileAccent: z.string().regex(/^#[0-9a-fA-F]{6}$/), activityVisible: z.boolean(), rivalNotificationsEnabled: z.boolean() }).parse(request.body);
  return updateProfileSettings(user.userId, body);
});
const availabilitySchema = z.object({
  currentActivity: z.enum(["FREE", "PLAYING", "STUDYING", "WORKING", "BUSY", "SLEEPING", "AWAY"]),
  activityUntil: z.coerce.date().nullable().optional(),
  activityNote: z.string().max(120).nullable().optional(),
  mentionPolicy: z.enum(["EVERYONE", "INTERESTED_ONLY", "NOBODY"]),
  weeklyAvailability: z.array(z.object({
    dayOfWeek: z.number().int().min(0).max(6),
    startMinute: z.number().int().min(0).max(1439),
    endMinute: z.number().int().min(1).max(1440),
    activity: z.enum(["FREE", "PLAYING", "STUDYING", "WORKING", "BUSY", "SLEEPING", "AWAY"]),
  })).max(28).optional(),
});
app.get("/api/me/availability", async (request) => getAvailability((await requireWebUser(request)).userId));
app.put("/api/me/availability", async (request) => updateAvailability((await requireWebUser(request)).userId, availabilitySchema.parse(request.body)));
app.get("/api/me/lfg-preferences", async (request) => getUserPreferences((await requireWebUser(request)).userId));
app.put("/api/me/lfg-preferences/:game", async (request) => {
  const user = await requireWebUser(request);
  const params = z.object({ game: z.string() }).parse(request.params);
  const body = z.object({ interested: z.boolean(), notificationsEnabled: z.boolean(), autoInvitesEnabled: z.boolean().optional() }).parse(request.body);
  return updateUserPreference({ userId: user.userId, displayName: user.displayName, avatarUrl: user.avatarUrl, gameSlug: params.game, ...body });
});
app.post("/api/me/lfg-preferences/:game/snooze", async (request) => {
  const user = await requireWebUser(request);
  const params = z.object({ game: z.string() }).parse(request.params);
  const body = z.object({ minutes: z.number().int().min(15).max(10_080) }).parse(request.body);
  return snoozeGameNotifications({ userId: user.userId, displayName: user.displayName, avatarUrl: user.avatarUrl, gameSlug: params.game, minutes: body.minutes });
});
app.post("/api/me/lfg/rooms", async (request) => {
  const user = await requireWebUser(request);
  const body = z.object({ gameSlug: z.string(), maxPlayers: z.number().int().min(2).max(50), durationMinutes: z.number().int().min(15).max(360).optional(), scheduledFor: z.coerce.date().optional(), title: z.string().max(80).optional(), description: z.string().max(500).optional(), gameMode: z.string().max(80).optional(), mapName: z.string().max(100).optional(), needsVoice: z.boolean().optional(), roomEmoji: z.string().max(12).optional(), accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional() }).parse(request.body);
  return createLfgRoom({ userId: user.userId, displayName: user.displayName, avatarUrl: user.avatarUrl, ...body });
});
app.put("/api/me/lfg/:id", async (request) => {
  const user = await requireWebUser(request);
  const params = z.object({ id: z.string() }).parse(request.params);
  const body = roomUpdateSchema.parse(request.body);
  return updateLfgRoom(params.id, user.userId, body);
});
app.post("/api/me/lfg/:id/start", async (request) => {
  const user = await requireWebUser(request);
  const params = z.object({ id: z.string() }).parse(request.params);
  return startLfgRoom(params.id, user.userId);
});
app.post("/api/me/lfg/:id/complete", async (request) => {
  const user = await requireWebUser(request);
  const params = z.object({ id: z.string() }).parse(request.params);
  return completeLfgRoom(params.id, user.userId);
});
app.post("/api/me/lfg/:id/close", async (request) => {
  const user = await requireWebUser(request);
  const params = z.object({ id: z.string() }).parse(request.params);
  return closeLfgRoom(params.id, user.userId);
});
app.post("/api/me/lfg/:id/join", async (request) => {
  const user = await requireWebUser(request);
  const params = z.object({ id: z.string() }).parse(request.params);
  return joinLfgRoom(params.id, { userId: user.userId, displayName: user.displayName, avatarUrl: user.avatarUrl });
});
app.post("/api/me/lfg/:id/leave", async (request) => {
  const user = await requireWebUser(request);
  const params = z.object({ id: z.string() }).parse(request.params);
  return leaveLfgRoom(params.id, user.userId);
});
app.post("/api/me/lfg/:id/ratings", async (request) => {
  const user = await requireWebUser(request);
  const params = z.object({ id: z.string() }).parse(request.params);
  const body = z.object({ ratedId: z.string(), stars: z.number().int().min(1).max(5), tags: z.array(z.string()).max(3).default([]) }).parse(request.body);
  return rateLfgPlayer({ roomId: params.id, raterId: user.userId, raterName: user.displayName, ...body });
});
app.post("/api/me/lfg/:id/room-rating", async (request) => {
  const user = await requireWebUser(request);
  const params = z.object({ id: z.string() }).parse(request.params);
  const body = z.object({ stars: z.number().int().min(1).max(5) }).parse(request.body);
  return rateLfgRoom({ roomId: params.id, raterId: user.userId, raterName: user.displayName, stars: body.stars });
});
app.post("/api/me/reports/player", async (request) => {
  const user = await requireWebUser(request);
  const body = z.object({ reportedId: z.string(), roomId: z.string().optional(), reason: z.string().min(2).max(80), description: z.string().max(1000).optional() }).parse(request.body);
  return reportPlayer({ reporterId: user.userId, reporterName: user.displayName, ...body });
});
app.post("/api/me/reports/bug", async (request) => {
  const user = await requireWebUser(request);
  const body = z.object({ title: z.string().min(3).max(120), description: z.string().min(5).max(2000), context: z.string().max(500).optional() }).parse(request.body);
  return reportBug({ reporterId: user.userId, reporterName: user.displayName, ...body });
});
app.get("/api/me/reports", async (request) => getMyReports((await requireWebUser(request)).userId));
app.get("/api/me/reports/:kind/:id", async (request) => {
  const user = await requireWebUser(request);
  const params = z.object({ kind: z.enum(["PLAYER", "BUG"]), id: z.string() }).parse(request.params);
  return getReportThreadForUser(params.kind, params.id, user.userId);
});
app.post("/api/me/reports/:kind/:id/messages", async (request) => {
  const user = await requireWebUser(request);
  const params = z.object({ kind: z.enum(["PLAYER", "BUG"]), id: z.string() }).parse(request.params);
  const body = z.object({ message: z.string().min(1).max(2000) }).parse(request.body);
  return addReportMessage({ kind: params.kind, reportId: params.id, authorId: user.userId, authorName: user.displayName, authorRole: "USER", message: body.message });
});
app.post("/api/me/reports/:kind/:id/presence", async (request) => {
  const user = await requireWebUser(request);
  const params = z.object({ kind: z.enum(["PLAYER", "BUG"]), id: z.string() }).parse(request.params);
  const body = z.object({ active: z.boolean() }).parse(request.body);
  return setReportPresence(params.kind, params.id, user.userId, body.active);
});
app.get("/api/me/support/status", async (request) => getSupportStatus((await requireWebUser(request)).userId));
app.post("/api/me/support/chat", async (request) => {
  const user = await requireWebUser(request);
  const body = z.object({ message: z.string().min(2).max(500) }).parse(request.body);
  return askSupport({ userId: user.userId, displayName: user.displayName, avatarUrl: user.avatarUrl, message: body.message });
});
app.get("/api/web-admin/dashboard", async (request) => {
  await requireWebAdmin(request);
  return getAdminDashboard();
});
app.get("/api/web-admin/broadcasts", async (request) => {
  await requireWebAdmin(request);
  return listBroadcasts();
});
app.post("/api/web-admin/broadcasts", async (request) => {
  const admin = await requireWebAdmin(request);
  const body = z.object({ title: z.string().min(2).max(80), content: z.string().min(2).max(1500), confirmation: z.string().max(20) }).parse(request.body);
  return createBroadcast(admin, body);
});
app.put("/api/web-admin/settings", async (request) => {
  const admin = await requireWebAdmin(request);
  const channelId = z.string().regex(/^\d{17,20}$/).nullable().optional();
  const body = z.object({
    botName: z.string().min(2).max(40),
    tagline: z.string().min(2).max(120),
    lfgChannelId: channelId,
    lfgCategoryId: channelId,
    publicChannelId: channelId,
    dailyChannelId: channelId,
    leaderboardChannelId: channelId,
    reportChannelId: channelId,
    websiteUrl: z.string().url().max(200),
    dmNotificationsEnabled: z.boolean(),
    quickMatchEnabled: z.boolean(),
    autoSmartRoomsEnabled: z.boolean(),
    autoRoomIntervalMinutes: z.number().int().min(5).max(1440).default(120),
    autoRoomMinimumInterested: z.number().int().min(2).max(100).default(2),
    autoRoomLifetimeMinutes: z.number().int().min(15).max(1440).default(120),
    maxAutoRoomsPerGame: z.number().int().min(1).max(20).default(1),
    autoRoomDmInterestedUsers: z.boolean().default(true),
    deleteExpiredAutoRooms: z.boolean().default(true),
    voiceEmptyGraceMinutes: z.number().int().min(1).max(60).default(5),
    singlePlayerIdleMinutes: z.number().int().min(5).max(240).default(15),
    waitingSessionTimeoutMinutes: z.number().int().min(15).max(1440).default(120),
    ratingsEnabled: z.boolean(),
    reportsEnabled: z.boolean(),
    autoCreateRoomChannels: z.boolean(),
    maxDmPerDay: z.number().int().min(0).max(20),
    notificationCooldownMinutes: z.number().int().min(1).max(1440),
    maxActiveRoomsPerUser: z.number().int().min(1).max(5),
    defaultRoomDurationMinutes: z.number().int().min(15).max(360),
    roomGraceMinutes: z.number().int().min(1).max(30),
    aiChatEnabled: z.boolean(),
    aiDailyMessagesPerUser: z.number().int().min(0).max(5000).default(1000),
    aiGlobalDailyMessages: z.number().int().min(0).max(100000).default(100000),
    aiDailyTokenBudgetPerUser: z.number().int().min(500).max(100000),
    aiGlobalDailyTokenBudget: z.number().int().min(10000).max(1000000),
    aiMaxOutputTokens: z.number().int().min(50).max(1000),
  }).parse(request.body);
  const settings = await updateGuildRuntimeSettings(admin.userId, body);
  // Do not make an administrator wait for the next scheduler tick after
  // enabling auto rooms from the dashboard.
  if (body.autoSmartRoomsEnabled) void processAutoSmartRooms({ force: true }).catch((error) => app.log.error(error));
  return settings;
});
app.post("/api/settings/auto-smart-rooms", { preHandler: requireServiceKey }, async (request) => {
  const body = z.object({ adminId: z.string().min(1).max(30), enabled: z.boolean() }).parse(request.body);
  const settings = await setAutoSmartRoomsEnabled(body.adminId, body.enabled);
  if (body.enabled) void processAutoSmartRooms({ force: true }).catch((error) => app.log.error(error));
  return settings;
});
app.get("/api/bot/broadcasts/pending", { preHandler: requireServiceKey }, getPendingBroadcast);
app.post("/api/bot/broadcasts/:id/claim", { preHandler: requireServiceKey }, async (request) => {
  const params = z.object({ id: z.string() }).parse(request.params);
  return claimBroadcast(params.id);
});
app.put("/api/bot/broadcasts/:id/progress", { preHandler: requireServiceKey }, async (request) => {
  const params = z.object({ id: z.string() }).parse(request.params);
  const body = z.object({ status: z.enum(["RUNNING", "COMPLETED", "FAILED"]), totalMembers: z.number().int().min(0), sentCount: z.number().int().min(0), failedCount: z.number().int().min(0), skippedCount: z.number().int().min(0), lastError: z.string().max(500).optional() }).parse(request.body);
  return updateBroadcastProgress(params.id, body);
});
app.post("/api/web-admin/ai/diagnostics", async (request) => {
  const admin = await requireWebAdmin(request);
  return diagnoseSupportAi(admin.userId);
});
app.get("/api/security/dashboard", async (request) => {
  await requireWebOwner(request);
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId) throw new HttpError("DISCORD_GUILD_ID غير مضبوط", 503);
  return securityDashboard(guildId);
});
app.put("/api/security/settings", async (request) => {
  await requireWebOwner(request);
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId) throw new HttpError("DISCORD_GUILD_ID غير مضبوط", 503);
  const channelId = z.string().regex(/^\d{17,20}$/).nullable().optional();
  const body = z.object({
    enabled: z.boolean(), maxBansPerHour: z.number().int().min(1).max(100), maxTimeoutsPerHour: z.number().int().min(1).max(100),
    maxKicksPerHour: z.number().int().min(1).max(200), maxRoleChangesPerHour: z.number().int().min(1).max(500),
    maxChannelDeletesPerHour: z.number().int().min(1).max(100), maxWebhookChangesPerHour: z.number().int().min(1).max(100),
    ownerDmAlertsEnabled: z.boolean(), securityLogChannelId: channelId,
    operationalExemptUserIds: z.array(z.string().regex(/^\d{17,20}$/)).max(100).default([]),
  }).parse(request.body);
  return updateSecuritySettings(guildId, body);
});
app.post("/api/security/suspensions/:userId/restore", async (request) => {
  const owner = await requireWebOwner(request);
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId) throw new HttpError("DISCORD_GUILD_ID غير مضبوط", 503);
  const userId = z.object({ userId: z.string().regex(/^\d{17,20}$/) }).parse(request.params).userId;
  return restoreSuspendedAdmin(guildId, userId, owner.userId);
});
app.post("/api/web-admin/loyalty/boost", async (request) => {
  const admin = await requireWebAdmin(request);
  const body = z.object({ minutes: z.number().int().min(15).max(180).default(60) }).parse(request.body);
  return startLoyaltyBoost(admin.userId, body.minutes);
});
app.get("/api/web-admin/smart-rooms", async (request) => {
  await requireWebAdmin(request);
  return getSmartRoomDashboard();
});
app.get("/api/web-admin/smart-rooms/history", async (request) => {
  await requireWebAdmin(request);
  return getSmartRoomHistory();
});
app.post("/api/web-admin/lfg/:id/close", async (request) => {
  const admin = await requireWebAdmin(request);
  const params = z.object({ id: z.string() }).parse(request.params);
  const room = await closeLfgRoom(params.id, admin.userId, true);
  await db.auditLog.create({ data: { adminId: admin.userId, action: "lfg.admin_closed", targetId: params.id } });
  return room;
});
app.post("/api/web-admin/lfg/categories", async (request) => {
  await requireWebAdmin(request);
  const body = z.object({ slug: z.string().regex(/^[a-z0-9-]+$/), name: z.string().min(2).max(80), icon: z.string().max(10).optional(), sortOrder: z.number().int().optional() }).parse(request.body);
  return createLfgCategory(body);
});
app.put("/api/web-admin/lfg/games/:slug", async (request) => {
  await requireWebAdmin(request);
  const params = z.object({ slug: z.string() }).parse(request.params);
  const body = z.object({ name: z.string().min(2).max(100), description: z.string().max(500).optional(), icon: z.string().max(10).optional(), categorySlug: z.string().optional(), minPlayers: z.number().int().min(2).optional(), maxPlayers: z.number().int().min(2).max(100).optional(), autoMinAvailable: z.number().int().min(2).max(100).nullable().optional(), enabled: z.boolean().optional() }).parse(request.body);
  return upsertLfgGame({ slug: params.slug, ...body });
});
app.post("/api/web-admin/zark-games/:slug/questions", async (request) => {
  const admin = await requireWebAdmin(request);
  const params = z.object({ slug: z.string() }).parse(request.params);
  const body = z.object({ prompt: z.string().min(2).max(500), acceptedAnswers: z.array(z.string().min(1)).min(1).max(20), mediaUrl: uploadedImageSchema.optional(), difficulty: z.number().int().min(1).max(5).optional(), enabled: z.boolean().optional() }).parse(request.body);
  return addGameQuestion({ gameSlug: params.slug, adminId: admin.userId, ...body });
});
app.get("/api/web-admin/zark-games", async (request) => {
  await requireWebAdmin(request);
  return getZarkGameContent();
});
app.put("/api/web-admin/zark-games/:slug/questions/:id", async (request) => {
  const admin = await requireWebAdmin(request);
  const params = z.object({ slug: z.string(), id: z.string() }).parse(request.params);
  const body = z.object({ prompt: z.string().min(2).max(500), acceptedAnswers: z.array(z.string().min(1)).min(1).max(20), mediaUrl: uploadedImageSchema.nullable().optional(), difficulty: z.number().int().min(1).max(5), enabled: z.boolean() }).parse(request.body);
  return updateGameQuestion(admin.userId, params.slug, params.id, body);
});
app.delete("/api/web-admin/zark-games/:slug/questions/:id", async (request) => {
  const admin = await requireWebAdmin(request);
  const params = z.object({ slug: z.string(), id: z.string() }).parse(request.params);
  return deleteGameQuestion(admin.userId, params.slug, params.id);
});
app.get("/api/web-admin/feedback", async (request) => {
  await requireWebAdmin(request);
  return getAdminFeedback();
});
app.get("/api/web-admin/reports/:kind/:id", async (request) => {
  await requireWebAdmin(request);
  const params = z.object({ kind: z.enum(["PLAYER", "BUG"]), id: z.string() }).parse(request.params);
  return getReportThreadForAdmin(params.kind, params.id);
});
app.post("/api/web-admin/reports/:kind/:id/messages", async (request) => {
  const admin = await requireWebAdmin(request);
  const params = z.object({ kind: z.enum(["PLAYER", "BUG"]), id: z.string() }).parse(request.params);
  const body = z.object({ message: z.string().min(1).max(2000) }).parse(request.body);
  return addReportMessage({ kind: params.kind, reportId: params.id, authorId: admin.userId, authorName: admin.displayName, authorRole: "ADMIN", message: body.message });
});
app.put("/api/web-admin/reports/:kind/:id/status", async (request) => {
  const admin = await requireWebAdmin(request);
  const params = z.object({ kind: z.enum(["PLAYER", "BUG"]), id: z.string() }).parse(request.params);
  const body = z.object({ status: z.string().min(2).max(30) }).parse(request.body);
  const allowed = params.kind === "PLAYER" ? ["PENDING", "REVIEWED", "RESOLVED", "REJECTED", "DISMISSED"] : ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"];
  if (!allowed.includes(body.status)) throw Object.assign(new Error("حالة البلاغ غير صحيحة"), { statusCode: 400 });
  return updateReportStatus({ kind: params.kind, reportId: params.id, adminId: admin.userId, adminName: admin.displayName, status: body.status });
});
app.delete("/api/web-admin/reports/:kind/:id", async (request) => {
  const admin = await requireWebAdmin(request);
  const params = z.object({ kind: z.enum(["PLAYER", "BUG"]), id: z.string() }).parse(request.params);
  return deleteReportTicket(params.kind, params.id, admin.userId);
});
app.get("/api/state", async () => {
  const lfgCatalog = await getLfgCatalog();
  return {
    guildId: process.env.DISCORD_GUILD_ID,
    identity: await db.botIdentity.upsert({ where: { id: 1 }, update: {}, create: { name: "Zark LFG System", tagline: "Zark LFG System — فريقك أقرب مما تتخيل" } }),
    daily: await getOrCreateDaily(),
    leaderboard: await leaderboard(),
    rooms: await listLfgRooms(),
    zarkGames: await listZarkGames(),
    lfgCatalog,
    lfgGames: lfgCatalog.flatMap((category) => category.games),
  };
});
app.get("/api/leaderboard", async (request) => {
  const query = z.object({ period: z.enum(["daily", "weekly", "monthly", "all"]).default("daily"), metric: z.enum(["game", "engagement"]).default("game") }).parse(request.query);
  return leaderboard(query.period, query.metric);
});
app.get("/api/daily", getOrCreateDaily);
app.post("/api/daily/answer", { preHandler: requireServiceKey }, async (request, reply) => {
  const body = z.object({ userId: z.string().min(1), displayName: z.string().min(1).max(80), answer: z.string().min(1).max(200) }).parse(request.body);
  return reply.send(await answerDaily(body));
});
app.get("/api/zark-games", listZarkGames);
app.post("/api/play/start", { preHandler: requireServiceKey }, async (request) => {
  const body = z.object({ gameSlug: z.string().optional(), channelId: z.string().min(1).max(40), rounds: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(10)]).default(1), seconds: z.number().int().min(10).max(60).optional() }).parse(request.body ?? {});
  return startZarkRace(body.gameSlug, { channelId: body.channelId, totalRounds: body.rounds, durationSeconds: body.seconds });
});
app.post("/api/play/:id/answer", { preHandler: requireServiceKey }, async (request) => {
  const params = z.object({ id: z.string() }).parse(request.params);
  const body = z.object({ userId: z.string().min(1), displayName: z.string().min(1).max(80), answer: z.string().min(1).max(200) }).parse(request.body);
  return answerZarkRace(params.id, body);
});
app.post("/api/play/:id/expire", { preHandler: requireServiceKey }, async (request) => {
  const params = z.object({ id: z.string() }).parse(request.params);
  return expireZarkRace(params.id);
});
app.post("/api/play/:id/next", { preHandler: requireServiceKey }, async (request) => {
  const params = z.object({ id: z.string() }).parse(request.params);
  return advanceZarkRace(params.id);
});
app.get("/api/lfg", listLfgRooms);
app.get("/api/lfg/search", async (request) => {
  const query = z.object({ q: z.string().max(100).default("") }).parse(request.query);
  return searchLfgRooms(query.q);
});
app.get("/api/lfg/cleanup-resources", { preHandler: requireServiceKey }, listRoomCleanupResources);
app.get("/api/lfg/games", async () => (await getLfgCatalog()).flatMap((category) => category.games));
app.get("/api/lfg/catalog", getLfgCatalog);
app.get("/api/lfg/insights", { preHandler: requireServiceKey }, getLfgInterestInsights);
app.get("/api/lfg/:id", async (request) => getLfgRoom(z.object({ id: z.string() }).parse(request.params).id));
app.put("/api/lfg/:id/listing", { preHandler: requireServiceKey }, async (request) => {
  const params = z.object({ id: z.string() }).parse(request.params);
  const body = z.object({ channelId: z.string().min(1), messageId: z.string().min(1) }).parse(request.body);
  return setLfgListing(params.id, body.channelId, body.messageId);
});
app.put("/api/lfg/:id/channels", { preHandler: requireServiceKey }, async (request) => {
  const params = z.object({ id: z.string() }).parse(request.params);
  const body = z.object({ categoryId: z.string().optional(), textChannelId: z.string().optional(), voiceChannelId: z.string().optional(), controlMessageId: z.string().optional() }).parse(request.body);
  return setLfgChannels(params.id, body);
});
app.post("/api/lfg/:id/channels-deleted", { preHandler: requireServiceKey }, async (request) => {
  const params = z.object({ id: z.string() }).parse(request.params);
  return markLfgChannelsDeleted(params.id);
});
app.post("/api/lfg/:id/reminder-delivered", { preHandler: requireServiceKey }, async (request) => {
  const params = z.object({ id: z.string() }).parse(request.params);
  return markLfgReminderDelivered(params.id);
});
app.put("/api/lfg/:id", { preHandler: requireServiceKey }, async (request) => {
  const params = z.object({ id: z.string() }).parse(request.params);
  const body = z.object({ actorId: z.string(), changes: roomUpdateSchema }).parse(request.body);
  return updateLfgRoom(params.id, body.actorId, body.changes);
});
app.post("/api/lfg/:id/start", { preHandler: requireServiceKey }, async (request) => {
  const params = z.object({ id: z.string() }).parse(request.params);
  const body = z.object({ actorId: z.string() }).parse(request.body);
  return startLfgRoom(params.id, body.actorId);
});
app.post("/api/lfg/:id/close", { preHandler: requireServiceKey }, async (request) => {
  const params = z.object({ id: z.string() }).parse(request.params);
  const body = z.object({ actorId: z.string() }).parse(request.body);
  return closeLfgRoom(params.id, body.actorId);
});
app.post("/api/lfg/:id/voice", { preHandler: requireServiceKey }, async (request) => {
  const params = z.object({ id: z.string() }).parse(request.params);
  const body = z.object({ userId: z.string(), displayName: z.string().min(1).max(80), avatarUrl: z.string().url().optional(), action: z.enum(["JOIN", "LEAVE"]) }).parse(request.body);
  return recordLfgVoiceEvent(params.id, body);
});
app.post("/api/lfg/quick-match", { preHandler: requireServiceKey }, async (request) => {
  const body = z.object({ userId: z.string().min(1), displayName: z.string().min(1).max(80), avatarUrl: z.string().url().optional(), gameSlug: z.string().min(1) }).parse(request.body);
  return quickMatchLfg(body);
});
app.post("/api/lfg/smart-match", { preHandler: requireServiceKey }, async (request) => {
  const body = z.object({ userId: z.string().min(1), displayName: z.string().min(1).max(80), avatarUrl: z.string().url().optional(), gameSlug: z.string().min(1).optional() }).parse(request.body);
  return smartMatchLfg(body);
});
app.post("/api/lfg/:id/join", { preHandler: requireServiceKey }, async (request) => {
  const params = z.object({ id: z.string() }).parse(request.params);
  const body = z.object({ userId: z.string().min(1), displayName: z.string().min(1).max(80), avatarUrl: z.string().url().optional() }).parse(request.body);
  return joinLfgRoom(params.id, body);
});
app.post("/api/lfg/rooms", { preHandler: requireServiceKey }, async (request) => {
  const body = z.object({ userId: z.string().min(1), displayName: z.string().min(1).max(80), avatarUrl: z.string().url().optional(), gameSlug: z.string().min(1), maxPlayers: z.number().int().min(2).max(50), durationMinutes: z.number().int().min(15).max(360).optional(), scheduledFor: z.coerce.date().optional(), title: z.string().max(80).optional(), description: z.string().max(500).optional(), gameMode: z.string().max(80).optional(), mapName: z.string().max(100).optional(), needsVoice: z.boolean().optional(), roomEmoji: z.string().max(12).optional(), accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional() }).parse(request.body);
  return createLfgRoom(body);
});
app.post("/api/lfg/:id/leave", { preHandler: requireServiceKey }, async (request) => {
  const params = z.object({ id: z.string() }).parse(request.params);
  const body = z.object({ userId: z.string().min(1) }).parse(request.body);
  return leaveLfgRoom(params.id, body.userId);
});
app.post("/api/lfg/:id/kick", { preHandler: requireServiceKey }, async (request) => {
  const params = z.object({ id: z.string() }).parse(request.params);
  const body = z.object({ actorId: z.string().min(1), userId: z.string().min(1) }).parse(request.body);
  return kickLfgMember(params.id, body.actorId, body.userId);
});
app.post("/api/lfg/:id/complete", { preHandler: requireServiceKey }, async (request) => {
  const params = z.object({ id: z.string() }).parse(request.params);
  const body = z.object({ actorId: z.string().optional() }).parse(request.body ?? {});
  return completeLfgRoom(params.id, body.actorId);
});
app.get("/api/lfg/:id/notification-candidates", { preHandler: requireServiceKey }, async (request) => {
  const params = z.object({ id: z.string() }).parse(request.params);
  return getNotificationCandidates(params.id);
});
app.post("/api/lfg/:id/notifications/:userId/status", { preHandler: requireServiceKey }, async (request) => {
  const params = z.object({ id: z.string(), userId: z.string() }).parse(request.params);
  const body = z.object({ status: z.enum(["SENT", "IGNORED", "FAILED"]) }).parse(request.body);
  return markNotificationDelivery(params.id, params.userId, body.status);
});
app.get("/api/users/:id/lfg-preferences", { preHandler: requireServiceKey }, async (request) => {
  const params = z.object({ id: z.string() }).parse(request.params);
  return getUserPreferences(params.id);
});
app.get("/api/users/:id/loyalty", { preHandler: requireServiceKey }, async (request) => {
  const params = z.object({ id: z.string() }).parse(request.params);
  return getLoyaltyProfile(params.id);
});
app.post("/api/users/:id/loyalty/buy-vip", { preHandler: requireServiceKey }, async (request) => {
  const params = z.object({ id: z.string() }).parse(request.params);
  return buyVip(params.id);
});
app.post("/api/loyalty/boost", { preHandler: requireServiceKey }, async (request) => {
  const body = z.object({ adminId: z.string().min(1), minutes: z.number().int().min(15).max(180).default(60) }).parse(request.body);
  return startLoyaltyBoost(body.adminId, body.minutes);
});
app.get("/api/loyalty/role-members", { preHandler: requireServiceKey }, async () => listLoyaltyRoleMembers());
app.put("/api/users/:id/identity", { preHandler: requireServiceKey }, async (request) => {
  const params = z.object({ id: z.string() }).parse(request.params);
  const body = z.object({ displayName: z.string().min(1).max(80), avatarUrl: z.string().url().optional() }).parse(request.body);
  return syncLfgUserIdentity({ userId: params.id, ...body });
});
app.put("/api/users/:id/lfg-preferences/:game", { preHandler: requireServiceKey }, async (request) => {
  const params = z.object({ id: z.string(), game: z.string() }).parse(request.params);
  const body = z.object({ displayName: z.string().min(1).max(80), avatarUrl: z.string().url().optional(), interested: z.boolean(), notificationsEnabled: z.boolean(), autoInvitesEnabled: z.boolean().optional() }).parse(request.body);
  return updateUserPreference({ userId: params.id, gameSlug: params.game, ...body });
});
app.post("/api/users/:id/lfg-preferences/:game/mute", { preHandler: requireServiceKey }, async (request) => {
  const params = z.object({ id: z.string(), game: z.string() }).parse(request.params);
  const body = z.object({ displayName: z.string().min(1).max(80), avatarUrl: z.string().url().optional() }).parse(request.body);
  return muteGameNotifications({ userId: params.id, gameSlug: params.game, ...body });
});
app.post("/api/users/:id/lfg-preferences/:game/snooze", { preHandler: requireServiceKey }, async (request) => {
  const params = z.object({ id: z.string(), game: z.string() }).parse(request.params);
  const body = z.object({ displayName: z.string().min(1).max(80), avatarUrl: z.string().url().optional(), minutes: z.number().int().min(15).max(10_080) }).parse(request.body);
  return snoozeGameNotifications({ userId: params.id, gameSlug: params.game, ...body });
});
app.get("/api/profiles/:id", async (request) => {
  const params = z.object({ id: z.string() }).parse(request.params);
  return getUnifiedProfile(params.id);
});
app.get("/api/users/:id/availability", { preHandler: requireServiceKey }, async (request) => {
  const params = z.object({ id: z.string() }).parse(request.params);
  return getAvailability(params.id);
});
app.put("/api/users/:id/availability", { preHandler: requireServiceKey }, async (request) => {
  const params = z.object({ id: z.string() }).parse(request.params);
  return updateAvailability(params.id, availabilitySchema.parse(request.body));
});
app.get("/api/lfg/top", async (request) => {
  const query = z.object({ metric: z.enum(["engagement", "sessions", "rating"]).default("engagement"), limit: z.coerce.number().int().min(1).max(50).default(10) }).parse(request.query);
  return getTopLfgPlayers(query.metric, query.limit);
});
app.post("/api/lfg/:id/ratings", { preHandler: requireServiceKey }, async (request) => {
  const params = z.object({ id: z.string() }).parse(request.params);
  const body = z.object({ raterId: z.string(), raterName: z.string().min(1).max(80), ratedId: z.string(), stars: z.number().int().min(1).max(5), tags: z.array(z.string()).max(3).default([]) }).parse(request.body);
  return rateLfgPlayer({ roomId: params.id, ...body });
});
app.post("/api/lfg/:id/room-rating", { preHandler: requireServiceKey }, async (request) => {
  const params = z.object({ id: z.string() }).parse(request.params);
  const body = z.object({ raterId: z.string(), raterName: z.string().min(1).max(80), stars: z.number().int().min(1).max(5) }).parse(request.body);
  return rateLfgRoom({ roomId: params.id, ...body });
});
app.get("/api/lfg/rating-requests/pending", { preHandler: requireServiceKey }, listPendingRatingRooms);
app.post("/api/lfg/:id/rating-requests/delivered", { preHandler: requireServiceKey }, async (request) => {
  const params = z.object({ id: z.string() }).parse(request.params);
  return markRatingRequestsDelivered(params.id);
});
app.post("/api/reports/player", { preHandler: requireServiceKey }, async (request) => {
  const body = z.object({ reporterId: z.string(), reporterName: z.string().min(1).max(80), reportedId: z.string(), roomId: z.string().optional(), reason: z.string().min(2).max(80), description: z.string().max(1000).optional() }).parse(request.body);
  return reportPlayer(body);
});
app.post("/api/reports/bug", { preHandler: requireServiceKey }, async (request) => {
  const body = z.object({ reporterId: z.string(), reporterName: z.string().min(1).max(80), title: z.string().min(3).max(120), description: z.string().min(5).max(2000), context: z.string().max(500).optional() }).parse(request.body);
  return reportBug(body);
});
app.get("/api/users/:id/reports", { preHandler: requireServiceKey }, async (request) => {
  const params = z.object({ id: z.string() }).parse(request.params);
  return getMyReports(params.id);
});
app.get("/api/reports/:kind/:id", { preHandler: requireServiceKey }, async (request) => {
  const params = z.object({ kind: z.enum(["PLAYER", "BUG"]), id: z.string() }).parse(request.params);
  return getReportThreadForAdmin(params.kind, params.id);
});
app.post("/api/admin/lfg/categories", { preHandler: requireServiceKey }, async (request) => {
  const body = z.object({ slug: z.string().regex(/^[a-z0-9-]+$/), name: z.string().min(2).max(80), icon: z.string().max(10).optional(), sortOrder: z.number().int().optional() }).parse(request.body);
  return createLfgCategory(body);
});
app.put("/api/admin/lfg/games/:slug", { preHandler: requireServiceKey }, async (request) => {
  const params = z.object({ slug: z.string() }).parse(request.params);
  const body = z.object({ name: z.string().min(2).max(100), description: z.string().max(500).optional(), icon: z.string().max(10).optional(), categorySlug: z.string().optional(), minPlayers: z.number().int().min(2).optional(), maxPlayers: z.number().int().min(2).max(100).optional(), autoMinAvailable: z.number().int().min(2).max(100).nullable().optional(), enabled: z.boolean().optional() }).parse(request.body);
  return upsertLfgGame({ slug: params.slug, ...body });
});
app.post("/api/admin/zark-games/:slug/questions", { preHandler: requireServiceKey }, async (request) => {
  const params = z.object({ slug: z.string() }).parse(request.params);
  const body = z.object({ prompt: z.string().min(2).max(500), acceptedAnswers: z.array(z.string().min(1)).min(1).max(20), mediaUrl: uploadedImageSchema.optional(), difficulty: z.number().int().min(1).max(5).optional() }).parse(request.body);
  return addGameQuestion({ gameSlug: params.slug, ...body });
});
app.get("/api/admin/feedback", { preHandler: requireServiceKey }, getAdminFeedback);
app.get("/api/settings", { preHandler: requireServiceKey }, getGuildRuntimeSettings);
app.get("/api/security/access/:userId", { preHandler: requireServiceKey }, async (request) => {
  const userId = z.object({ userId: z.string().min(1).max(30) }).parse(request.params).userId;
  const guildId = process.env.DISCORD_GUILD_ID ?? "default";
  return { suspended: await isSuspended(guildId, userId) };
});
app.get("/api/security/settings", { preHandler: requireServiceKey }, async () => getSecuritySettings(process.env.DISCORD_GUILD_ID ?? "default"));
app.get("/api/security/restores/pending", { preHandler: requireServiceKey }, async () => pendingRestorations(process.env.DISCORD_GUILD_ID ?? "default"));
app.get("/api/security/timeouts/:userId", { preHandler: requireServiceKey }, async (request) => {
  const userId = z.object({ userId: z.string().regex(/^\d{17,20}$/) }).parse(request.params).userId;
  return recentTimeoutActions(process.env.DISCORD_GUILD_ID ?? "default", userId);
});
app.post("/api/security/actions", { preHandler: requireServiceKey }, async (request) => {
  const body = z.object({
    guildId: z.string().min(1).max(30), executorId: z.string().regex(/^\d{17,20}$/).optional(), executorIsBot: z.boolean().optional(), targetId: z.string().regex(/^\d{17,20}$/).optional(),
    actionType: z.enum(["MEMBER_BAN", "MEMBER_KICK", "MEMBER_TIMEOUT", "MEMBER_TIMEOUT_REMOVED", "ROLE_ADDED", "ROLE_REMOVED", "ROLE_CREATED", "ROLE_DELETED", "ROLE_UPDATED", "CHANNEL_CREATED", "CHANNEL_DELETED", "CHANNEL_UPDATED", "WEBHOOK_CREATED", "WEBHOOK_DELETED", "WEBHOOK_UPDATED", "BOT_ADDED", "UNKNOWN"]),
    auditLogId: z.string().max(40).optional(), reason: z.string().max(512).optional(), metadata: z.record(z.string(), z.unknown()).optional(),
    roleSnapshots: z.array(z.object({ roleId: z.string().regex(/^\d{17,20}$/), roleName: z.string().max(100).optional() })).max(100).optional(),
  }).parse(request.body);
  return recordSecurityAction({ ...body, metadata: body.metadata as Prisma.InputJsonValue | undefined });
});
app.post("/api/bot/heartbeat", { preHandler: requireServiceKey }, async (request) => {
  const body = z.object({ instanceId: z.string().max(100).optional(), botUserId: z.string().optional(), tag: z.string().max(100).optional(), guilds: z.number().int().min(0).optional() }).parse(request.body ?? {});
  return recordServiceHeartbeat("discord-bot", body.instanceId, { botUserId: body.botUserId, tag: body.tag, guilds: body.guilds });
});
app.post("/api/bot/bump-reminder/claim", { preHandler: requireServiceKey }, async (request) => {
  const body = z.object({ guildId: z.string().min(1).max(30) }).parse(request.body);
  return claimBumpReminder(body.guildId, 120);
});
app.post("/api/bot/bump-reminder/completed", { preHandler: requireServiceKey }, async (request) => {
  const body = z.object({ guildId: z.string().min(1).max(30), userId: z.string().max(30).optional() }).parse(request.body);
  return recordBumpCompleted(body.guildId, body.userId);
});
app.get("/api/stream", async (request, reply) => {
  reply.hijack();
  reply.raw.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
  reply.raw.write(`data: ${JSON.stringify({ type: "connected" })}\n\n`);
  subscribe(reply.raw);
});

app.setErrorHandler((error, _request, reply) => {
  app.log.error(error);
  const declaredStatus = (error as { statusCode?: unknown }).statusCode;
  if (error instanceof z.ZodError) return reply.status(400).send({ error: "بيانات الطلب غير صحيحة أو ناقصة" });
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2025") return reply.status(404).send({ error: "العنصر المطلوب غير موجود" });
    if (error.code === "P2002") return reply.status(409).send({ error: "تم تنفيذ هذا الإجراء مسبقًا" });
    return reply.status(500).send({ error: "تعذر تنفيذ عملية قاعدة البيانات" });
  }
  const status = typeof declaredStatus === "number" ? declaredStatus : 409;
  reply.status(status).send({ error: error instanceof Error ? error.message : "تعذر تنفيذ الطلب" });
});

async function requireServiceKey(request: { headers: Record<string, string | string[] | undefined> }, reply: { status(code: number): { send(payload: unknown): unknown } }) {
  const expected = process.env.INTERNAL_API_KEY;
  const supplied = request.headers["x-zark-service-key"];
  const valid = expected && typeof supplied === "string" && safeEqual(supplied, expected);
  if (!valid) return reply.status(401).send({ error: "هذا الإجراء يتطلب هوية خدمة موثوقة" });
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

const port = Number(process.env.PORT ?? process.env.API_PORT ?? 3000);
await app.listen({ port, host: "0.0.0.0" });
console.log(`Zark API listening on http://localhost:${port}`);
void processDueLfgRooms().catch((error) => app.log.error(error));
void processAutoSmartRooms().catch((error) => app.log.error(error));
void expireDueTrades().catch((error) => app.log.error(error));
const roomLifecycleTimer = setInterval(() => void processDueLfgRooms().catch((error) => app.log.error(error)), 30_000);
const autoSmartRoomTimer = setInterval(() => void processAutoSmartRooms().catch((error) => app.log.error(error)), 5 * 60_000);
const tradeExpiryTimer = setInterval(() => void expireDueTrades().catch((error) => app.log.error(error)), 5 * 60_000);
roomLifecycleTimer.unref();
autoSmartRoomTimer.unref();
tradeExpiryTimer.unref();
let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ signal }, "Shutting down Zark API");
  clearInterval(roomLifecycleTimer);
  clearInterval(autoSmartRoomTimer);
  clearInterval(tradeExpiryTimer);
  await closeEvents();
  await app.close();
  await db.$disconnect();
}
process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));
