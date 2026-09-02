import { Prisma, type TradeReportReason, type TradeStatus } from "@prisma/client";
import { db } from "../../../../../packages/db/src/client.js";
import { enforceRateLimit, publish } from "../../events.js";
import type { WebUser } from "../../auth.js";
import { isOwnerId } from "../security/service.js";
import sharp from "sharp";

const activeStatuses: TradeStatus[] = ["OPEN", "PENDING", "COMPLETION_PENDING"];
const publicTrade = {
  owner: { select: { id: true, displayName: true, avatarUrl: true } },
  game: { select: { id: true, slug: true, name: true, icon: true } },
  _count: { select: { interests: true, conversations: true } },
} satisfies Prisma.TradeInclude;

// Market grids never need the original base64 upload. Excluding it prevents a
// page of trades from becoming a response containing tens of megabytes.
const tradeListSelect = {
  id: true, publicId: true, ownerId: true, lfgGameId: true, itemName: true,
  thumbnailData: true, haveText: true, wantText: true, description: true, status: true,
  completionRequestedBy: true, completionConversationId: true,
  expiresAt: true, closedAt: true, createdAt: true, updatedAt: true,
  owner: publicTrade.owner,
  game: publicTrade.game,
  _count: publicTrade._count,
} satisfies Prisma.TradeSelect;

export function isTradeModerator(user: WebUser) {
  if (isOwnerId(user.userId)) return true;
  const ids = csv("TRADE_MODERATOR_IDS");
  const roles = csv("TRADE_MODERATOR_ROLE_IDS");
  return ids.includes(user.userId) || user.roles.some((role) => roles.includes(role));
}

export async function isCurrentTradeModerator(user: WebUser) {
  if (isOwnerId(user.userId) || csv("TRADE_MODERATOR_IDS").includes(user.userId)) return true;
  const allowedRoles = csv("TRADE_MODERATOR_ROLE_IDS");
  if (!allowedRoles.length) return false;
  const guildId = process.env.DISCORD_GUILD_ID, token = process.env.DISCORD_TOKEN;
  if (!guildId || !token) return process.env.NODE_ENV !== "production" && user.roles.some((role) => allowedRoles.includes(role));
  const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${user.userId}`, { headers: { authorization: `Bot ${token}` }, signal: AbortSignal.timeout(10_000) });
  if (response.status === 404) return false;
  if (!response.ok) throw httpError("تعذر التحقق من صلاحية Trade في Discord حاليًا", 503);
  const member = await response.json() as { roles?: string[] };
  return (member.roles ?? []).some((role) => allowedRoles.includes(role));
}

export function tradeCode(value: number) {
  return `TR-${String(value).padStart(6, "0")}`;
}

export async function listTrades(input: { search?: string; game?: string; status?: TradeStatus; sort?: "newest" | "oldest" | "active"; ownerId?: string }) {
  const search = input.search?.trim().slice(0, 80);
  const rows = await db.trade.findMany({
    where: {
      ownerId: input.ownerId,
      status: input.status ?? (input.ownerId ? undefined : { in: ["OPEN", "PENDING"] }),
      game: input.game ? { slug: input.game } : undefined,
      OR: search ? [
        { itemName: { contains: search, mode: "insensitive" } },
        { haveText: { contains: search, mode: "insensitive" } },
        { wantText: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
        { game: { name: { contains: search, mode: "insensitive" } } },
      ] : undefined,
    },
    select: tradeListSelect,
    orderBy: input.sort === "oldest" ? { createdAt: "asc" } : input.sort === "active" ? { updatedAt: "desc" } : { createdAt: "desc" },
    take: 100,
  });
  return rows.map(({ thumbnailData, ...trade }) => ({ ...presentTrade(trade), imageData: thumbnailData }));
}

export async function getTrade(identifier: string, viewerId?: string) {
  const trade = await findTrade(identifier, {
    ...publicTrade,
    interests: viewerId ? {
      where: { OR: [{ userId: viewerId }, { trade: { ownerId: viewerId } }] },
      include: { user: { select: { id: true, displayName: true, avatarUrl: true } }, conversation: { select: { id: true } } },
      orderBy: { createdAt: "desc" },
    } : false,
  });
  if (!trade) throw httpError("العرض غير موجود", 404);
  return { ...presentTrade(trade), interests: "interests" in trade ? trade.interests : [], isOwner: viewerId === trade.ownerId };
}

export async function createTrade(user: WebUser, input: { gameSlug: string; itemName: string; imageData: string; haveText: string; wantText: string; description?: string; acceptedTerms: boolean }) {
  await enforceRateLimit("trade-create", user.userId, 3, 60 * 60);
  if (!input.acceptedTerms) throw httpError("يجب الموافقة على شروط الأمان قبل نشر العرض", 400);
  validateTradeImage(input.imageData);
  const thumbnailData = await createTradeThumbnail(input.imageData);
  await syncUser(user);
  const game = await db.lfgGameCatalog.findFirst({ where: { slug: input.gameSlug, enabled: true }, select: { id: true } });
  if (!game) throw httpError("اللعبة غير موجودة أو غير مفعلة", 404);
  const normalizedHave = clean(input.haveText, 300);
  const normalizedWant = clean(input.wantText, 300);
  const duplicate = await db.trade.findFirst({ where: { ownerId: user.userId, lfgGameId: game.id, haveText: normalizedHave, wantText: normalizedWant, status: { in: activeStatuses }, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60_000) } } });
  if (duplicate) throw httpError(`لديك عرض مشابه مفتوح بالفعل (${tradeCode(duplicate.publicId)})`, 409);
  const trade = await db.trade.create({
    data: {
      ownerId: user.userId,
      lfgGameId: game.id,
      itemName: clean(input.itemName, 100),
      imageData: input.imageData,
      thumbnailData,
      haveText: normalizedHave,
      wantText: normalizedWant,
      description: optional(input.description, 1000),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60_000),
      auditEntries: { create: { actorId: user.userId, action: "trade.created", metadata: { source: "website" } } },
    },
    include: publicTrade,
  });
  publish({ type: "trade.created", tradeId: trade.id, publicId: trade.publicId, ownerId: user.userId });
  return presentTrade(trade);
}

export async function updateTrade(identifier: string, user: WebUser, input: { itemName?: string; imageData?: string; haveText?: string; wantText?: string; description?: string | null }) {
  const trade = await requireTrade(identifier);
  if (trade.ownerId !== user.userId) throw httpError("صاحب العرض فقط يستطيع تعديله", 403);
  if (!["OPEN", "PENDING"].includes(trade.status)) throw httpError("لا يمكن تعديل عرض منتهٍ", 409);
  if (input.imageData) validateTradeImage(input.imageData);
  const thumbnailData = input.imageData ? await createTradeThumbnail(input.imageData) : undefined;
  const updated = await db.trade.update({
    where: { id: trade.id },
    data: {
      itemName: input.itemName === undefined ? undefined : clean(input.itemName, 100),
      imageData: input.imageData,
      thumbnailData,
      haveText: input.haveText === undefined ? undefined : clean(input.haveText, 300),
      wantText: input.wantText === undefined ? undefined : clean(input.wantText, 300),
      description: input.description === undefined ? undefined : optional(input.description ?? undefined, 1000),
      auditEntries: { create: { actorId: user.userId, action: "trade.updated" } },
    }, include: publicTrade,
  });
  publish({ type: "trade.updated", tradeId: updated.id, publicId: updated.publicId, status: updated.status });
  return presentTrade(updated);
}

export async function setTradeStatus(identifier: string, user: WebUser, status: "CANCELLED" | "REMOVED") {
  const trade = await requireTrade(identifier);
  const moderator = status === "REMOVED" ? await isCurrentTradeModerator(user) : false;
  if (status === "CANCELLED" && trade.ownerId !== user.userId) throw httpError("صاحب العرض فقط يستطيع إغلاقه", 403);
  if (status === "REMOVED" && !moderator) throw httpError("لا تملك صلاحية إزالة عروض Trade", 403);
  if (!activeStatuses.includes(trade.status)) throw httpError("العرض منتهٍ بالفعل", 409);
  const updated = await db.trade.update({ where: { id: trade.id }, data: { status, closedAt: new Date(), auditEntries: { create: { actorId: user.userId, action: `trade.${status.toLowerCase()}` } } } });
  publish({ type: "trade.status_changed", tradeId: trade.id, publicId: trade.publicId, status, ownerId: trade.ownerId });
  return { id: updated.id, code: tradeCode(updated.publicId), status: updated.status };
}

/** Permanently removes the offer and every Trade record attached to it.
 * A small global admin audit entry is intentionally retained for accountability. */
export async function deleteTradePermanently(identifier: string, user: WebUser) {
  if (!(await isCurrentTradeModerator(user))) throw httpError("لا تملك صلاحية الحذف النهائي لعروض Trade", 403);
  const trade = await requireTrade(identifier);
  await db.$transaction(async (tx) => {
    // TradeAuditLog uses SetNull by design, so delete it explicitly: this is a
    // real purge requested by the administrator, not merely a status change.
    await tx.tradeAuditLog.deleteMany({ where: { tradeId: trade.id } });
    await tx.trade.delete({ where: { id: trade.id } });
  });
  await db.auditLog.create({ data: { adminId: user.userId, action: "trade.permanently_deleted", targetId: trade.id, details: { code: tradeCode(trade.publicId), ownerId: trade.ownerId } } });
  publish({ type: "trade.deleted", tradeId: trade.id, publicId: trade.publicId, ownerId: trade.ownerId, discordChannelId: trade.discordChannelId ?? undefined, discordMessageId: trade.discordMessageId ?? undefined });
  return { deleted: true, code: tradeCode(trade.publicId) };
}

export async function expressInterest(identifier: string, user: WebUser) {
  await enforceRateLimit("trade-interest", user.userId, 15, 60 * 60);
  const trade = await requireTrade(identifier);
  if (trade.ownerId === user.userId) throw httpError("لا يمكنك إبداء الاهتمام بعرضك", 400);
  if (trade.status !== "OPEN") throw httpError("هذا العرض لا يقبل طلبات جديدة", 409);
  await syncUser(user);
  const existing = await db.tradeInterest.findUnique({ where: { tradeId_userId: { tradeId: trade.id, userId: user.userId } } });
  if (existing && ["PENDING", "ACCEPTED"].includes(existing.status)) throw httpError("أرسلت اهتمامك بهذا العرض بالفعل", 409);
  const interest = await db.$transaction(async (tx) => {
    const saved = await tx.tradeInterest.upsert({ where: { tradeId_userId: { tradeId: trade.id, userId: user.userId } }, update: { status: "PENDING" }, create: { tradeId: trade.id, userId: user.userId } });
    await tx.tradeNotification.create({ data: { userId: trade.ownerId, actorId: user.userId, tradeId: trade.id, type: "INTEREST_NEW", title: "اهتمام جديد بعرضك", body: `${user.displayName} مهتم بعرض ${tradeCode(trade.publicId)}` } });
    await tx.tradeAuditLog.create({ data: { actorId: user.userId, tradeId: trade.id, action: "trade.interest_created" } });
    return saved;
  });
  publish({ type: "trade.interest_created", tradeId: trade.id, publicId: trade.publicId, ownerId: trade.ownerId, userId: user.userId });
  return interest;
}

export async function decideInterest(interestId: string, owner: WebUser, decision: "ACCEPTED" | "DECLINED") {
  const interest = await db.tradeInterest.findUnique({ where: { id: interestId }, include: { trade: true, user: { select: { displayName: true } } } });
  if (!interest) throw httpError("طلب الاهتمام غير موجود", 404);
  if (interest.trade.ownerId !== owner.userId) throw httpError("صاحب العرض فقط يستطيع قبول الطلب", 403);
  if (interest.status !== "PENDING") throw httpError("تم التعامل مع هذا الطلب سابقًا", 409);
  const result = await db.$transaction(async (tx) => {
    await tx.tradeInterest.update({ where: { id: interest.id }, data: { status: decision } });
    const conversation = decision === "ACCEPTED" ? await tx.tradeConversation.create({ data: { tradeId: interest.tradeId, interestId: interest.id, ownerId: owner.userId, interestedUserId: interest.userId, ownerReadAt: new Date() } }) : null;
    await tx.trade.update({ where: { id: interest.tradeId }, data: { status: decision === "ACCEPTED" ? "PENDING" : undefined } });
    await tx.tradeNotification.create({ data: { userId: interest.userId, actorId: owner.userId, tradeId: interest.tradeId, conversationId: conversation?.id, type: decision === "ACCEPTED" ? "INTEREST_ACCEPTED" : "INTEREST_DECLINED", title: decision === "ACCEPTED" ? "تم قبول اهتمامك" : "لم يُقبل طلب الاهتمام", body: `${tradeCode(interest.trade.publicId)} — ${interest.trade.itemName}` } });
    await tx.tradeAuditLog.create({ data: { actorId: owner.userId, tradeId: interest.tradeId, conversationId: conversation?.id, action: `trade.interest_${decision.toLowerCase()}` } });
    return conversation;
  });
  publish({ type: "trade.interest_decided", tradeId: interest.tradeId, publicId: interest.trade.publicId, userId: interest.userId, decision, conversationId: result?.id });
  return { status: decision, conversationId: result?.id };
}

export async function listTradeInbox(user: WebUser) {
  const moderator = await isCurrentTradeModerator(user);
  const conversations = await db.tradeConversation.findMany({
    where: moderator ? undefined : { OR: [{ ownerId: user.userId }, { interestedUserId: user.userId }] },
    include: {
      trade: { select: { id: true, publicId: true, itemName: true, status: true, game: { select: { name: true, icon: true } } } },
      owner: { select: { id: true, displayName: true, avatarUrl: true } },
      interestedUser: { select: { id: true, displayName: true, avatarUrl: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1, select: { content: true, createdAt: true, senderId: true, deletedAt: true } },
    }, orderBy: { lastMessageAt: "desc" }, take: 100,
  });
  return conversations.map((item) => ({ ...item, trade: { ...item.trade, code: tradeCode(item.trade.publicId) }, unread: unreadFor(item, user.userId) }));
}

export async function getTradeConversation(id: string, user: WebUser) {
  const conversation = await db.tradeConversation.findUnique({
    where: { id }, include: {
      trade: { select: { id: true, publicId: true, itemName: true, status: true, completionConversationId: true, game: { select: { name: true, slug: true, icon: true } } } },
      owner: { select: { id: true, displayName: true, avatarUrl: true } },
      interestedUser: { select: { id: true, displayName: true, avatarUrl: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 500, include: { sender: { select: { id: true, displayName: true, avatarUrl: true } } } },
    },
  });
  if (!conversation) throw httpError("المحادثة غير موجودة", 404);
  const moderator = await isCurrentTradeModerator(user);
  if (!isParticipant(conversation, user.userId) && !moderator) throw httpError("لا تملك صلاحية فتح هذه المحادثة", 403);
  if (conversation.ownerId === user.userId) await db.tradeConversation.update({ where: { id }, data: { ownerReadAt: new Date() } });
  if (conversation.interestedUserId === user.userId) await db.tradeConversation.update({ where: { id }, data: { interestedReadAt: new Date() } });
  await db.tradeAuditLog.create({ data: { actorId: user.userId, tradeId: conversation.tradeId, conversationId: id, action: moderator && !isParticipant(conversation, user.userId) ? "trade.conversation_admin_viewed" : "trade.conversation_viewed" } });
  return { ...conversation, messages: [...conversation.messages].reverse(), trade: { ...conversation.trade, code: tradeCode(conversation.trade.publicId) }, moderatorView: moderator && !isParticipant(conversation, user.userId) };
}

export async function sendTradeMessage(id: string, user: WebUser, rawContent: string) {
  await enforceRateLimit("trade-message", user.userId, 30, 5 * 60);
  const conversation = await requireConversation(id);
  requireParticipant(conversation, user.userId);
  if (conversation.status !== "OPEN") throw httpError("هذه المحادثة مغلقة", 409);
  const content = clean(rawContent, 1500);
  const duplicate = await db.tradeMessage.findFirst({ where: { conversationId: id, senderId: user.userId, content, deletedAt: null, createdAt: { gte: new Date(Date.now() - 15_000) } }, select: { id: true } });
  if (duplicate) throw httpError("تم إرسال هذه الرسالة للتو", 409);
  const recipientId = conversation.ownerId === user.userId ? conversation.interestedUserId : conversation.ownerId;
  const message = await db.$transaction(async (tx) => {
    const created = await tx.tradeMessage.create({ data: { conversationId: id, senderId: user.userId, content }, include: { sender: { select: { id: true, displayName: true, avatarUrl: true } } } });
    await tx.tradeConversation.update({ where: { id }, data: { lastMessageAt: new Date(), ownerReadAt: conversation.ownerId === user.userId ? new Date() : undefined, interestedReadAt: conversation.interestedUserId === user.userId ? new Date() : undefined } });
    await tx.tradeNotification.create({ data: { userId: recipientId, actorId: user.userId, tradeId: conversation.tradeId, conversationId: id, type: "MESSAGE_NEW", title: "رسالة جديدة بخصوص Trade", body: "لديك رسالة جديدة داخل محادثة أحد عروض Trade" } });
    await tx.tradeAuditLog.create({ data: { actorId: user.userId, tradeId: conversation.tradeId, conversationId: id, messageId: created.id, action: "trade.message_sent" } });
    return created;
  });
  publish({ type: "trade.message_created", tradeId: conversation.tradeId, conversationId: id, messageId: message.id, senderId: user.userId, recipientId });
  return message;
}

export async function reviseTradeMessage(messageId: string, user: WebUser, input: { content?: string; delete?: boolean }) {
  const message = await db.tradeMessage.findUnique({ where: { id: messageId }, include: { conversation: true } });
  if (!message) throw httpError("الرسالة غير موجودة", 404);
  if (message.senderId !== user.userId) throw httpError("يمكنك تعديل رسائلك فقط", 403);
  if (message.deletedAt) throw httpError("الرسالة محذوفة", 409);
  const action = input.delete ? "DELETE" : "EDIT";
  const content = input.delete ? "" : clean(input.content ?? "", 1500);
  const updated = await db.$transaction(async (tx) => {
    await tx.tradeMessageRevision.create({ data: { messageId, actorId: user.userId, previousContent: message.content, action } });
    const saved = await tx.tradeMessage.update({ where: { id: messageId }, data: input.delete ? { content: "", deletedAt: new Date() } : { content, editedAt: new Date() } });
    await tx.tradeAuditLog.create({ data: { actorId: user.userId, tradeId: message.conversation.tradeId, conversationId: message.conversationId, messageId, action: `trade.message_${action.toLowerCase()}` } });
    return saved;
  });
  publish({ type: "trade.message_updated", tradeId: message.conversation.tradeId, conversationId: message.conversationId, messageId, action });
  return updated;
}

export async function requestTradeCompletion(identifier: string, conversationId: string, user: WebUser) {
  const trade = await requireTrade(identifier);
  if (trade.ownerId !== user.userId) throw httpError("صاحب العرض فقط يبدأ طلب الإكمال", 403);
  if (trade.status !== "PENDING") throw httpError("يجب أن يكون العرض قيد التفاوض", 409);
  const conversation = await requireConversation(conversationId);
  if (conversation.tradeId !== trade.id || conversation.ownerId !== user.userId || conversation.status !== "OPEN") throw httpError("اختر محادثة مقبولة تخص هذا العرض", 400);
  const updated = await db.trade.update({ where: { id: trade.id }, data: { status: "COMPLETION_PENDING", completionRequestedBy: user.userId, completionConversationId: conversationId, auditEntries: { create: { actorId: user.userId, conversationId, action: "trade.completion_requested" } } } });
  publish({ type: "trade.status_changed", tradeId: trade.id, publicId: trade.publicId, status: updated.status, ownerId: trade.ownerId });
  return { status: updated.status };
}

export async function answerTradeCompletion(identifier: string, conversationId: string, user: WebUser, answer: "CONFIRM" | "DISPUTE") {
  const trade = await requireTrade(identifier);
  const conversation = await requireConversation(conversationId);
  if (conversation.tradeId !== trade.id || conversation.interestedUserId !== user.userId || trade.completionConversationId !== conversationId) throw httpError("المشارك المطلوب منه التأكيد فقط يستطيع إكمال الصفقة", 403);
  if (trade.status !== "COMPLETION_PENDING") throw httpError("لا يوجد طلب إكمال حالي", 409);
  const status = answer === "CONFIRM" ? "COMPLETED" : "DISPUTED";
  await db.$transaction([
    db.trade.update({ where: { id: trade.id }, data: { status, closedAt: answer === "CONFIRM" ? new Date() : undefined } }),
    db.tradeConversation.update({ where: { id: conversationId }, data: { status: answer === "CONFIRM" ? "CLOSED" : "DISPUTED" } }),
    db.tradeAuditLog.create({ data: { actorId: user.userId, tradeId: trade.id, conversationId, action: answer === "CONFIRM" ? "trade.completed" : "trade.disputed" } }),
  ]);
  publish({ type: "trade.status_changed", tradeId: trade.id, publicId: trade.publicId, status, ownerId: trade.ownerId });
  return { status };
}

export async function reviewTrade(identifier: string, conversationId: string, user: WebUser, input: { rating: number; comment?: string }) {
  const trade = await requireTrade(identifier);
  const conversation = await requireConversation(conversationId);
  requireParticipant(conversation, user.userId);
  if (conversation.tradeId !== trade.id || trade.status !== "COMPLETED") throw httpError("التقييم متاح للمشاركين بعد إكمال الصفقة فقط", 409);
  const reviewedUserId = conversation.ownerId === user.userId ? conversation.interestedUserId : conversation.ownerId;
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) throw httpError("التقييم يجب أن يكون من 1 إلى 5", 400);
  try {
    const review = await db.tradeReview.create({ data: { tradeId: trade.id, conversationId, reviewerId: user.userId, reviewedUserId, rating: input.rating, comment: optional(input.comment, 500) } });
    publish({ type: "trade.review_created", tradeId: trade.id, publicId: trade.publicId, reviewerId: user.userId, reviewedUserId });
    return review;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw httpError("قيّمت هذا اللاعب لهذه الصفقة سابقًا", 409);
    throw error;
  }
}

export async function reportTrade(identifier: string, user: WebUser, input: { conversationId?: string; messageId?: string; reportedUserId?: string; reason: TradeReportReason; details?: string }) {
  await enforceRateLimit("trade-report", user.userId, 5, 24 * 60 * 60);
  const trade = await db.trade.findFirst({ where: tradeWhere(identifier), include: { owner: { select: { id: true, displayName: true } } } });
  if (!trade) throw httpError("العرض غير موجود", 404);
  let conversation = null;
  if (input.conversationId) {
    conversation = await db.tradeConversation.findUnique({ where: { id: input.conversationId }, include: { messages: { orderBy: { createdAt: "desc" }, take: 500, select: { id: true, senderId: true, content: true, createdAt: true, editedAt: true, deletedAt: true } } } });
    if (!conversation || conversation.tradeId !== trade.id) throw httpError("المحادثة لا تخص هذا العرض", 400);
    requireParticipant(conversation, user.userId);
  }
  if (input.messageId) {
    const message = await db.tradeMessage.findUnique({ where: { id: input.messageId }, select: { conversationId: true, conversation: { select: { tradeId: true } } } });
    if (!message || message.conversation.tradeId !== trade.id || message.conversationId !== conversation?.id) throw httpError("الرسالة المحددة لا تخص هذه المحادثة", 400);
  }
  if (input.reportedUserId) {
    if (input.reportedUserId === user.userId) throw httpError("لا يمكنك الإبلاغ عن نفسك", 400);
    const allowedTargets = new Set([trade.ownerId, conversation?.ownerId, conversation?.interestedUserId].filter(Boolean));
    if (!allowedTargets.has(input.reportedUserId)) throw httpError("العضو المبلّغ عنه ليس طرفًا في هذه الصفقة", 400);
  }
  const evidence = {
    capturedAt: new Date().toISOString(),
    trade: { id: trade.id, code: tradeCode(trade.publicId), ownerId: trade.ownerId, itemName: trade.itemName, haveText: trade.haveText, wantText: trade.wantText, description: trade.description, status: trade.status },
    conversation: conversation ? { id: conversation.id, ownerId: conversation.ownerId, interestedUserId: conversation.interestedUserId, messages: [...conversation.messages].reverse() } : null,
  };
  const report = await db.$transaction(async (tx) => {
    const created = await tx.tradeReport.create({ data: { tradeId: trade.id, conversationId: conversation?.id, messageId: input.messageId, reporterId: user.userId, reportedUserId: input.reportedUserId, reason: input.reason, details: optional(input.details, 1500), evidence } });
    await tx.user.update({ where: { id: user.userId }, data: { submittedReportCount: { increment: 1 } } });
    await tx.tradeAuditLog.create({ data: { actorId: user.userId, tradeId: trade.id, conversationId: conversation?.id, messageId: input.messageId, action: "trade.report_created", metadata: { reportId: created.id, reason: input.reason } } });
    return created;
  });
  publish({ type: "trade.report_created", tradeId: trade.id, publicId: trade.publicId, reportId: report.id, reporterId: user.userId });
  return report;
}

export async function tradeNotifications(userId: string) {
  const rows = await db.tradeNotification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 50 });
  return { unread: rows.filter((item) => !item.readAt).length, notifications: rows };
}

export async function setTradeDiscordMessage(identifier: string, channelId: string, messageId: string) {
  const trade = await requireTrade(identifier);
  return db.trade.update({ where: { id: trade.id }, data: { discordChannelId: channelId, discordMessageId: messageId } });
}

export async function expireDueTrades() {
  const due = await db.trade.findMany({ where: { status: "OPEN", expiresAt: { lte: new Date() } }, select: { id: true, publicId: true, ownerId: true }, take: 500 });
  if (!due.length) return 0;
  await db.trade.updateMany({ where: { id: { in: due.map((item) => item.id) }, status: "OPEN" }, data: { status: "EXPIRED", closedAt: new Date() } });
  for (const trade of due) publish({ type: "trade.status_changed", tradeId: trade.id, publicId: trade.publicId, status: "EXPIRED", ownerId: trade.ownerId });
  return due.length;
}

export async function backfillTradeThumbnails(limit = 25) {
  const rows = await db.trade.findMany({ where: { thumbnailData: null }, select: { id: true, imageData: true }, take: Math.min(100, Math.max(1, limit)) });
  let updated = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      const thumbnailData = await createTradeThumbnail(row.imageData);
      const result = await db.trade.updateMany({ where: { id: row.id, thumbnailData: null }, data: { thumbnailData } });
      updated += result.count;
    } catch (error) {
      console.error(`Could not create thumbnail for legacy trade ${row.id}`, error);
      // Empty means "use the branded fallback" and prevents retrying the same
      // corrupt legacy upload every five minutes forever.
      await db.trade.updateMany({ where: { id: row.id, thumbnailData: null }, data: { thumbnailData: "" } }).catch(() => undefined);
      failed += 1;
    }
  }
  return { scanned: rows.length, updated, failed };
}

export async function readTradeNotifications(userId: string) {
  await db.tradeNotification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
  return { ok: true };
}

export async function tradeModerationDashboard(user: WebUser) {
  if (!(await isCurrentTradeModerator(user))) throw httpError("لا تملك صلاحية إدارة Trade", 403);
  const [byStatus, openReports, recentAudit, recentTrades] = await Promise.all([
    db.trade.groupBy({ by: ["status"], _count: { _all: true } }),
    db.tradeReport.findMany({ where: { status: { in: ["OPEN", "REVIEWING"] } }, include: { trade: { select: { publicId: true, itemName: true } }, reporter: { select: { id: true, displayName: true } }, reportedUser: { select: { id: true, displayName: true } } }, orderBy: { createdAt: "desc" }, take: 100 }),
    db.tradeAuditLog.findMany({ include: { actor: { select: { id: true, displayName: true } } }, orderBy: { createdAt: "desc" }, take: 100 }),
    db.trade.findMany({
      select: { publicId: true, itemName: true, haveText: true, wantText: true, status: true, createdAt: true, owner: { select: { displayName: true } }, game: { select: { name: true } } },
      orderBy: { createdAt: "desc" }, take: 100,
    }),
  ]);
  return { byStatus, openReports: openReports.map((item) => ({ ...item, trade: { ...item.trade, code: tradeCode(item.trade.publicId) } })), recentAudit, recentTrades: recentTrades.map((item) => ({ ...item, code: tradeCode(item.publicId) })) };
}

export async function resolveTradeReport(reportId: string, user: WebUser, input: { status: "DISMISSED" | "ACTIONED" | "REVIEWING"; resolution?: string; tradeAction?: "NONE" | "REMOVE" | "DISPUTE" | "CLOSE" }) {
  if (!(await isCurrentTradeModerator(user))) throw httpError("لا تملك صلاحية إدارة بلاغات Trade", 403);
  const report = await db.tradeReport.findUnique({ where: { id: reportId }, include: { trade: true } });
  if (!report) throw httpError("البلاغ غير موجود", 404);
  const terminal = input.status !== "REVIEWING";
  await db.$transaction(async (tx) => {
    await tx.tradeReport.update({ where: { id: report.id }, data: { status: input.status, resolution: optional(input.resolution, 1000), resolvedBy: terminal ? user.userId : null, resolvedAt: terminal ? new Date() : null } });
    if (input.tradeAction === "REMOVE") await tx.trade.update({ where: { id: report.tradeId }, data: { status: "REMOVED", closedAt: new Date() } });
    if (input.tradeAction === "DISPUTE") await tx.trade.update({ where: { id: report.tradeId }, data: { status: "DISPUTED" } });
    if (input.tradeAction === "CLOSE") await tx.trade.update({ where: { id: report.tradeId }, data: { status: "CANCELLED", closedAt: new Date() } });
    await tx.tradeNotification.create({ data: { userId: report.reporterId, actorId: user.userId, tradeId: report.tradeId, type: "REPORT_UPDATED", title: "تم تحديث بلاغ Trade", body: `حالة البلاغ: ${input.status}` } });
    if (input.status === "ACTIONED" && report.reportedUserId) await tx.tradeNotification.create({ data: { userId: report.reportedUserId, actorId: user.userId, tradeId: report.tradeId, type: "REPORT_UPDATED", title: "تنبيه من إدارة Trade", body: optional(input.resolution, 500) ?? "راجعت الإدارة نشاطًا مرتبطًا بهذا العرض. التزم بقواعد Trade." } });
    await tx.tradeAuditLog.create({ data: { actorId: user.userId, tradeId: report.tradeId, conversationId: report.conversationId, messageId: report.messageId, action: "trade.report_resolved", metadata: { reportId, ...input } } });
  });
  publish({ type: "trade.report_updated", tradeId: report.tradeId, publicId: report.trade.publicId, reportId, status: input.status });
  if (input.tradeAction && input.tradeAction !== "NONE") publish({ type: "trade.status_changed", tradeId: report.tradeId, publicId: report.trade.publicId, status: input.tradeAction === "REMOVE" ? "REMOVED" : input.tradeAction === "CLOSE" ? "CANCELLED" : "DISPUTED", ownerId: report.trade.ownerId });
  return { ok: true };
}

async function findTrade<T extends Prisma.TradeInclude>(identifier: string, include: T) {
  return db.trade.findFirst({ where: tradeWhere(identifier), include });
}

async function requireTrade(identifier: string) {
  const trade = await db.trade.findFirst({ where: tradeWhere(identifier) });
  if (!trade) throw httpError("العرض غير موجود", 404);
  return trade;
}

async function requireConversation(id: string) {
  const conversation = await db.tradeConversation.findUnique({ where: { id } });
  if (!conversation) throw httpError("المحادثة غير موجودة", 404);
  return conversation;
}

function tradeWhere(identifier: string): Prisma.TradeWhereInput {
  const match = identifier.toUpperCase().match(/^TR-(\d+)$/);
  if (match) return { publicId: Number(match[1]) };
  if (/^\d+$/.test(identifier)) return { publicId: Number(identifier) };
  return { id: identifier };
}

function presentTrade<T extends { publicId: number }>(trade: T) {
  return { ...trade, code: tradeCode(trade.publicId) };
}

function requireParticipant(conversation: { ownerId: string; interestedUserId: string }, userId: string) {
  if (!isParticipant(conversation, userId)) throw httpError("هذه المحادثة خاصة بطرفي الصفقة", 403);
}

function isParticipant(conversation: { ownerId: string; interestedUserId: string }, userId: string) {
  return conversation.ownerId === userId || conversation.interestedUserId === userId;
}

function unreadFor(conversation: { ownerId: string; interestedUserId: string; ownerReadAt: Date | null; interestedReadAt: Date | null; messages: Array<{ senderId: string; createdAt: Date }> }, userId: string) {
  const last = conversation.messages[0];
  if (!last || last.senderId === userId) return false;
  const readAt = conversation.ownerId === userId ? conversation.ownerReadAt : conversation.interestedReadAt;
  return !readAt || last.createdAt > readAt;
}

export function validateTradeImage(value: string) {
  const match = value.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/i);
  if (!match) throw httpError("ارفع صورة PNG أو JPG أو WEBP من جهازك", 400);
  const bytes = Math.floor(match[2].length * 0.75) - (match[2].endsWith("==") ? 2 : match[2].endsWith("=") ? 1 : 0);
  if (bytes > 1_500_000) throw httpError("حجم الصورة يجب ألا يتجاوز 1.5MB", 400);
}

export async function createTradeThumbnail(value: string) {
  const match = value.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/i);
  if (!match) throw httpError("ارفع صورة PNG أو JPG أو WEBP من جهازك", 400);
  try {
    const output = await sharp(Buffer.from(match[2], "base64"), { failOn: "error" })
      .rotate()
      .resize(640, 400, { fit: "cover", position: "centre", withoutEnlargement: true })
      .webp({ quality: 72, effort: 4 })
      .toBuffer();
    return `data:image/webp;base64,${output.toString("base64")}`;
  } catch {
    throw httpError("ملف الصورة تالف أو ليس صورة حقيقية", 400);
  }
}

function clean(value: string, max: number) {
  const result = value.trim().replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").slice(0, max);
  if (!result) throw httpError("أكمل الحقول المطلوبة", 400);
  return result;
}

function optional(value: string | undefined, max: number) {
  const result = value?.trim().replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").slice(0, max);
  return result || null;
}

function csv(name: string) {
  return (process.env[name] ?? "").split(",").map((value) => value.trim()).filter(Boolean);
}

function syncUser(user: WebUser) {
  return db.user.upsert({ where: { id: user.userId }, update: { displayName: user.displayName, avatarUrl: user.avatarUrl }, create: { id: user.userId, displayName: user.displayName, avatarUrl: user.avatarUrl } });
}

function httpError(message: string, statusCode: number) {
  return Object.assign(new Error(message), { statusCode });
}
