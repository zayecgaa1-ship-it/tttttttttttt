import { Prisma } from "@prisma/client";
import { db } from "../../../packages/db/src/client.js";
import type { ZarkGameSessionView } from "../../../packages/shared/src/index.js";
import { ACTIVE_GAME_SESSION_STATUSES, canJoinGameSession, memberCanControlGame, nextJoinStatus, requiredSkipVotes } from "../../../packages/shared/src/game-session.js";
import { ensureSystemData, expireZarkRace, startZarkRace } from "./service.js";
import { serializable } from "./db-transaction.js";

const activeStatuses = [...ACTIVE_GAME_SESSION_STATUSES];
const waitingLifetimeMs = 15 * 60_000;

export async function createGameSession(input: { gameSlug?: string; guildId: string; channelId: string; hostId: string; displayName: string; rounds?: number; seconds?: number; lobbyOverride?: boolean; autoStartOverride?: boolean; readyCheckOverride?: boolean }) {
  await ensureSystemData();
  await cleanupStaleGameSessions();
  const game = input.gameSlug
    ? await db.zarkGame.findUnique({ where: { slug: input.gameSlug } })
    : await db.zarkGame.findFirst({ where: { enabled: true }, orderBy: { name: "asc" } });
  if (!game || !game.enabled) throw new Error("اللعبة غير موجودة أو معطلة");
  const totalRounds = input.rounds ?? 1;
  if (![1, 2, 3, 4, 5, 10].includes(totalRounds)) throw new Error("عدد الجولات غير صالح");
  const seconds = input.seconds ?? game.roundDurationSeconds;
  if (!Number.isInteger(seconds) || seconds < 10 || seconds > 60) throw new Error("وقت الجولة يجب أن يكون بين 10 و60 ثانية");
  const activeChannelKey = `${input.guildId}:${input.channelId}`;
  let session;
  try {
    session = await db.zarkGameSession.create({
      data: {
        gameId: game.id,
        guildId: input.guildId,
        channelId: input.channelId,
        activeChannelKey,
        hostId: input.hostId,
        status: (input.lobbyOverride ?? game.lobbyEnabled) ? "WAITING" : "READY",
        totalRounds,
        lobbyEnabled: input.lobbyOverride ?? game.lobbyEnabled,
        autoStart: input.autoStartOverride ?? game.autoStart,
        readyCheckEnabled: input.readyCheckOverride ?? game.readyCheckEnabled,
        allowLateJoin: game.allowLateJoin,
        skipEnabled: game.skipEnabled,
        skipVotePercent: game.skipVotePercent,
        hostSkipOverride: game.hostSkipOverride,
        allowReplay: game.allowReplay,
        minPlayers: game.minPlayers,
        maxPlayers: game.maxPlayers,
        durationMs: seconds * 1_000,
        questionCooldownMs: game.questionCooldownSeconds * 1_000,
        historySize: game.recentQuestionHistorySize,
        expiresAt: new Date(Date.now() + waitingLifetimeMs),
        members: { create: { userId: input.hostId, displayName: input.displayName, status: (input.readyCheckOverride ?? game.readyCheckEnabled) ? "JOINED" : "READY" } },
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      console.warn(`[zark-session] session lock rejected duplicate guild=${input.guildId} channel=${input.channelId}`);
      throw new Error("توجد لعبة شغالة بالفعل في هذه القناة");
    }
    throw error;
  }
  if (!(input.lobbyOverride ?? game.lobbyEnabled) || (input.autoStartOverride ?? game.autoStart)) {
    const started = await maybeAutoStartGameSession(session.id);
    if (started) return started;
  }
  return getGameSession(session.id);
}

export async function getGameSession(sessionId: string): Promise<ZarkGameSessionView> {
  const session = await db.zarkGameSession.findUnique({ where: { id: sessionId }, include: { game: true, members: { orderBy: { joinedAt: "asc" } } } });
  if (!session) throw new Error("جلسة اللعبة غير موجودة");
  const currentMatch = session.currentMatchId ? await db.zarkMatch.findUnique({ where: { id: session.currentMatchId } }) : null;
  const activeMembers = session.members.filter((member) => member.role === "PLAYER" && member.status !== "LEFT");
  const votes = currentMatch ? await db.zarkSkipVote.count({ where: { sessionId, matchId: currentMatch.id } }) : 0;
  return {
    id: session.id,
    gameSlug: session.game.slug,
    gameName: session.game.name,
    gameIcon: session.game.icon ?? undefined,
    guildId: session.guildId,
    channelId: session.channelId,
    hostId: session.hostId,
    status: session.status,
    currentRound: session.currentRound,
    totalRounds: session.totalRounds,
    minPlayers: session.minPlayers,
    maxPlayers: session.maxPlayers,
    readyCheckEnabled: session.readyCheckEnabled,
    allowLateJoin: session.allowLateJoin,
    skipEnabled: session.skipEnabled,
    skipVotePercent: session.skipVotePercent,
    hostSkipOverride: session.hostSkipOverride,
    allowReplay: session.allowReplay,
    messageId: session.messageId ?? undefined,
    questionCooldownMs: session.questionCooldownMs,
    expiresAt: session.expiresAt.toISOString(),
    playerCount: activeMembers.length,
    readyCount: activeMembers.filter((member) => member.status === "READY").length,
    skipVotes: votes,
    requiredSkipVotes: requiredSkipVotes(activeMembers.filter((member) => member.status !== "WAITING_NEXT").length, session.skipVotePercent),
    members: session.members.map((member) => ({ userId: member.userId, displayName: member.displayName, status: member.status, role: member.role })),
    currentMatch: currentMatch ? {
      id: currentMatch.id,
      seriesId: currentMatch.seriesId ?? currentMatch.id,
      gameSlug: session.game.slug,
      gameName: session.game.name,
      gameImageData: session.game.imageData ?? undefined,
      roundNumber: currentMatch.roundNumber,
      totalRounds: currentMatch.totalRounds,
      prompt: currentMatch.prompt,
      mediaUrl: currentMatch.mediaUrl ?? undefined,
      startedAt: currentMatch.startedAt.toISOString(),
      endsAt: currentMatch.endsAt.toISOString(),
    } : undefined,
  };
}

export async function joinGameSession(sessionId: string, input: { userId: string; displayName: string }) {
  await serializable(async (tx) => {
    const session = await tx.zarkGameSession.findUniqueOrThrow({ where: { id: sessionId }, include: { members: true } });
    if (!canJoinGameSession(session.status, session.allowLateJoin)) throw new Error("لا يمكن الانضمام إلى هذه الجلسة الآن");
    const activeCount = session.members.filter((member) => member.role === "PLAYER" && member.status !== "LEFT").length;
    const existing = session.members.find((member) => member.userId === input.userId);
    if (!existing && activeCount >= session.maxPlayers) throw new Error("الجلسة ممتلئة");
    const status = nextJoinStatus(session.status, session.allowLateJoin, session.readyCheckEnabled)!;
    await tx.zarkGameSessionMember.upsert({
      where: { sessionId_userId: { sessionId, userId: input.userId } },
      update: { displayName: input.displayName, status, leftAt: null, readyAt: status === "READY" ? new Date() : null },
      create: { sessionId, userId: input.userId, displayName: input.displayName, status, readyAt: status === "READY" ? new Date() : undefined },
    });
  });
  return (await maybeAutoStartGameSession(sessionId)) ?? getGameSession(sessionId);
}

export async function setGameSessionReady(sessionId: string, userId: string, ready: boolean) {
  const member = await db.zarkGameSessionMember.findUnique({ where: { sessionId_userId: { sessionId, userId } } });
  if (!member || member.status === "LEFT" || member.status === "WAITING_NEXT") throw new Error("يجب أن تنضم إلى الجلسة أولاً");
  await db.zarkGameSessionMember.update({ where: { id: member.id }, data: { status: ready ? "READY" : "JOINED", readyAt: ready ? new Date() : null } });
  return (await maybeAutoStartGameSession(sessionId)) ?? getGameSession(sessionId);
}

async function maybeAutoStartGameSession(sessionId: string) {
  const session = await db.zarkGameSession.findUnique({ where: { id: sessionId }, include: { members: true } });
  if (!session?.autoStart || !["WAITING", "READY"].includes(session.status)) return undefined;
  const players = session.members.filter((member) => member.role === "PLAYER" && member.status !== "LEFT");
  if (players.length < session.minPlayers || (session.readyCheckEnabled && players.some((member) => member.status !== "READY"))) return undefined;
  return startGameSession(sessionId, session.hostId, true);
}

export async function startGameSession(sessionId: string, userId: string, force = false) {
  const session = await db.zarkGameSession.findUniqueOrThrow({ where: { id: sessionId }, include: { game: true, members: true } });
  if (!force && session.hostId !== userId) throw new Error("صاحب الجلسة فقط يمكنه بدء اللعبة");
  if (session.status === "RUNNING") return getGameSession(sessionId);
  if (!['WAITING', 'READY'].includes(session.status)) throw new Error("لا يمكن بدء هذه الجلسة");
  const players = session.members.filter((member) => member.role === "PLAYER" && member.status !== "LEFT");
  if (players.length < session.minPlayers) throw new Error(`تحتاج الجلسة إلى ${session.minPlayers} لاعبين على الأقل`);
  if (session.readyCheckEnabled && players.some((member) => member.status !== "READY")) throw new Error("ليس كل اللاعبين جاهزين");
  const claimed = await db.zarkGameSession.updateMany({ where: { id: sessionId, status: { in: ["WAITING", "READY"] } }, data: { status: "PAUSED" } });
  if (!claimed.count) {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      const current = await getGameSession(sessionId);
      if (current.status !== "PAUSED") return current;
    }
    throw new Error("بدء اللعبة قيد التنفيذ، حاول بعد لحظة");
  }
  try {
    const match = await startZarkRace(session.game.slug, { channelId: session.channelId, totalRounds: session.totalRounds, durationSeconds: Math.round(session.durationMs / 1_000), sessionId, seriesId: session.id, recentQuestionKeys: session.recentQuestionKeys, historySize: session.historySize });
    await db.zarkGameSession.update({ where: { id: sessionId }, data: { status: "RUNNING", currentRound: 1, currentMatchId: match.id, startedAt: new Date(), expiresAt: new Date(new Date(match.endsAt).getTime() + 120_000) } });
    return getGameSession(sessionId);
  } catch (error) {
    await db.zarkGameSession.updateMany({ where: { id: sessionId, status: "PAUSED" }, data: { status: "WAITING" } });
    throw error;
  }
}

export async function leaveGameSession(sessionId: string, userId: string) {
  await db.zarkGameSessionMember.updateMany({ where: { sessionId, userId, status: { not: "LEFT" } }, data: { status: "LEFT", leftAt: new Date() } });
  const session = await db.zarkGameSession.findUniqueOrThrow({ where: { id: sessionId }, include: { members: true } });
  const remaining = session.members.filter((member) => member.status !== "LEFT");
  if (!remaining.length || (session.hostId === userId && session.status !== "RUNNING")) {
    await cancelGameSession(sessionId, userId, true);
  } else if (session.hostId === userId) {
    await db.zarkGameSession.update({ where: { id: sessionId }, data: { hostId: remaining[0].userId } });
  }
  return getGameSession(sessionId);
}

export async function voteToSkip(sessionId: string, userId: string) {
  const session = await db.zarkGameSession.findUniqueOrThrow({ where: { id: sessionId }, include: { members: true } });
  if (!session.skipEnabled || session.status !== "RUNNING" || !session.currentMatchId) throw new Error("التخطي غير متاح الآن");
  const member = session.members.find((item) => item.userId === userId);
  if (!member || !memberCanControlGame(member.status, member.role)) throw new Error("التصويت متاح للاعبين المشاركين فقط");
  await db.zarkSkipVote.upsert({ where: { sessionId_matchId_userId: { sessionId, matchId: session.currentMatchId, userId } }, update: {}, create: { sessionId, matchId: session.currentMatchId, userId } });
  const activePlayers = session.members.filter((item) => memberCanControlGame(item.status, item.role)).length;
  const needed = session.hostSkipOverride && session.hostId === userId ? 1 : requiredSkipVotes(activePlayers, session.skipVotePercent);
  const votes = await db.zarkSkipVote.count({ where: { sessionId, matchId: session.currentMatchId } });
  const skipped = votes >= needed;
  if (skipped) {
    await db.zarkMatch.updateMany({ where: { id: session.currentMatchId, status: "OPEN" }, data: { status: "EXPIRED", endsAt: new Date() } });
  }
  return { ...(await getGameSession(sessionId)), skipped, votes, requiredVotes: needed };
}

export async function bindGameSessionMessage(sessionId: string, messageId: string) {
  await db.zarkGameSession.update({ where: { id: sessionId }, data: { messageId } });
  return getGameSession(sessionId);
}

export async function replayGameSession(sessionId: string, input: { userId: string; displayName: string }) {
  const previous = await db.zarkGameSession.findUniqueOrThrow({ where: { id: sessionId }, include: { game: true, members: true } });
  if (previous.status !== "FINISHED" || !previous.allowReplay) throw new Error("إعادة اللعب غير متاحة لهذه الجلسة");
  if (!previous.members.some((member) => member.userId === input.userId && member.status !== "LEFT")) throw new Error("إعادة اللعب متاحة للمشاركين فقط");
  return createGameSession({ gameSlug: previous.game.slug, guildId: previous.guildId, channelId: previous.channelId, hostId: input.userId, displayName: input.displayName, rounds: previous.totalRounds, seconds: Math.round(previous.durationMs / 1_000), lobbyOverride: true, autoStartOverride: false, readyCheckOverride: true });
}

export async function cancelGameSession(sessionId: string, userId: string, force = false) {
  const session = await db.zarkGameSession.findUniqueOrThrow({ where: { id: sessionId } });
  if (!force && session.hostId !== userId) throw new Error("صاحب الجلسة فقط يمكنه إلغاؤها");
  await db.$transaction([
    db.zarkMatch.updateMany({ where: { sessionId, status: "OPEN" }, data: { status: "EXPIRED", activeChannelKey: null, lockExpiresAt: null } }),
    db.zarkGameSession.update({ where: { id: sessionId }, data: { status: "CANCELLED", activeChannelKey: null, endedAt: new Date(), currentMatchId: null } }),
  ]);
  return getGameSession(sessionId);
}

export async function listRecoverableGameSessions() {
  await cleanupStaleGameSessions();
  const sessions = await db.zarkGameSession.findMany({ where: { status: { in: activeStatuses } }, select: { id: true } });
  return Promise.all(sessions.map((session) => getGameSession(session.id)));
}

export async function cleanupStaleGameSessions() {
  const stale = await db.zarkGameSession.findMany({ where: { status: { in: activeStatuses }, expiresAt: { lte: new Date() } }, select: { id: true, currentMatchId: true } });
  for (const session of stale) {
    if (session.currentMatchId) await expireZarkRace(session.currentMatchId).catch(() => undefined);
    await db.zarkMatch.updateMany({ where: { sessionId: session.id, status: "OPEN" }, data: { status: "EXPIRED", activeChannelKey: null, lockExpiresAt: null } });
    await db.zarkGameSession.updateMany({ where: { id: session.id, status: { in: activeStatuses } }, data: { status: "CANCELLED", activeChannelKey: null, endedAt: new Date(), currentMatchId: null } });
  }
  return stale.length;
}
