import { Prisma, TeamInviteStatus, TeamMemberRole } from "@prisma/client";
import { db } from "../../../../../packages/db/src/client.js";
import { serializable } from "../../db-transaction.js";
import { enforceRateLimit } from "../../events.js";
import { calculateTeamScore } from "../../../../../packages/shared/src/team-matching.js";

const teamInclude = Prisma.validator<Prisma.TeamInclude>()({
  owner: { select: { id: true, displayName: true, avatarUrl: true } },
  members: {
    include: {
      user: {
        select: {
          id: true, displayName: true, avatarUrl: true, xp: true, wins: true,
          _count: { select: { memberships: { where: { status: "COMPLETED" } } } },
        },
      },
    },
    orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
  },
  _count: { select: { members: true } },
});

type TeamWithMembers = Prisma.TeamGetPayload<{ include: typeof teamInclude }>;

function toTeam(team: TeamWithMembers) {
  const totals = team.members.reduce((value, member) => ({
    xp: value.xp + member.user.xp,
    wins: value.wins + member.user.wins,
    sessions: value.sessions + member.user._count.memberships,
  }), { xp: 0, wins: 0, sessions: 0 });
  return {
    id: team.id, slug: team.slug, name: team.name, description: team.description ?? undefined,
    logoUrl: team.logoUrl ?? undefined, accentColor: team.accentColor, ownerId: team.ownerId,
    maxMembers: team.maxMembers, memberCount: team._count.members, createdAt: team.createdAt.toISOString(),
    owner: team.owner, totals, score: calculateTeamScore(totals),
    members: team.members.map((member) => ({
      id: member.user.id, displayName: member.user.displayName, avatarUrl: member.user.avatarUrl ?? undefined,
      role: member.role, joinedAt: member.joinedAt.toISOString(), xp: member.user.xp,
      wins: member.user.wins, completedSessions: member.user._count.memberships,
    })),
  };
}

async function ensureUser(input: { userId: string; displayName: string; avatarUrl?: string }) {
  await db.user.upsert({
    where: { id: input.userId },
    update: { displayName: input.displayName, avatarUrl: input.avatarUrl },
    create: { id: input.userId, displayName: input.displayName, avatarUrl: input.avatarUrl },
  });
}

function teamSlug(name: string) {
  return name.normalize("NFKC").toLocaleLowerCase("ar").match(/[\p{L}\p{N}]+/gu)?.join("-").slice(0, 48) || "zark-team";
}

async function availableSlug(name: string) {
  const base = teamSlug(name);
  for (let suffix = 0; suffix < 100; suffix += 1) {
    const slug = suffix ? `${base}-${suffix + 1}` : base;
    if (!await db.team.findUnique({ where: { slug }, select: { id: true } })) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export async function listTeams(search = "") {
  const query = search.trim();
  const teams = await db.team.findMany({
    where: query ? { OR: [{ name: { contains: query, mode: "insensitive" } }, { description: { contains: query, mode: "insensitive" } }] } : undefined,
    include: teamInclude,
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return teams.map(toTeam).sort((a, b) => b.score - a.score || b.memberCount - a.memberCount);
}

export async function getTeam(identifier: string) {
  const team = await db.team.findFirst({ where: { OR: [{ id: identifier }, { slug: identifier }] }, include: teamInclude });
  if (!team) throw new Error("الفريق غير موجود");
  return toTeam(team);
}

export async function getMyTeam(userId: string) {
  const membership = await db.teamMember.findUnique({ where: { userId }, include: { team: { include: teamInclude } } });
  if (!membership) return null;
  return { ...toTeam(membership.team), myRole: membership.role };
}

export async function createTeam(input: { userId: string; displayName: string; avatarUrl?: string; name: string; description?: string; logoUrl?: string; accentColor?: string }) {
  await enforceRateLimit("team-create", input.userId, 2, 24 * 60 * 60);
  await ensureUser(input);
  if (await db.teamMember.findUnique({ where: { userId: input.userId } })) throw new Error("أنت عضو في فريق بالفعل");
  const slug = await availableSlug(input.name);
  const team = await db.team.create({
    data: {
      slug, name: input.name.trim(), description: input.description?.trim() || null,
      logoUrl: input.logoUrl?.trim() || null, accentColor: input.accentColor ?? "#e50914", ownerId: input.userId,
      members: { create: { userId: input.userId, role: "OWNER" } },
    },
    include: teamInclude,
  });
  return toTeam(team);
}

async function requireManager(teamId: string, userId: string) {
  const membership = await db.teamMember.findUnique({ where: { userId } });
  if (!membership || membership.teamId !== teamId || (membership.role !== TeamMemberRole.OWNER && membership.role !== TeamMemberRole.CAPTAIN)) throw new Error("هذه العملية متاحة لمالك الفريق والقادة فقط");
  return membership;
}

export async function updateTeam(teamId: string, userId: string, input: { name?: string; description?: string | null; logoUrl?: string | null; accentColor?: string }) {
  const manager = await requireManager(teamId, userId);
  if (manager.role !== TeamMemberRole.OWNER) throw new Error("مالك الفريق فقط يستطيع تعديل بياناته");
  await db.team.update({ where: { id: teamId }, data: {
    name: input.name?.trim(), description: input.description === undefined ? undefined : input.description?.trim() || null,
    logoUrl: input.logoUrl === undefined ? undefined : input.logoUrl?.trim() || null, accentColor: input.accentColor,
  } });
  return getTeam(teamId);
}

export async function inviteToTeam(teamId: string, input: { userId: string; invitedUserId: string }) {
  await enforceRateLimit("team-invite", input.userId, 20, 60 * 60);
  await requireManager(teamId, input.userId);
  if (input.userId === input.invitedUserId) throw new Error("أنت عضو في الفريق بالفعل");
  const [team, invited] = await Promise.all([
    db.team.findUniqueOrThrow({ where: { id: teamId }, include: { _count: { select: { members: true } } } }),
    db.user.findUnique({ where: { id: input.invitedUserId }, select: { id: true, displayName: true, teamMembership: true } }),
  ]);
  if (!invited) throw new Error("هذا العضو لم يستخدم Zark بعد");
  if (invited.teamMembership) throw new Error("هذا العضو موجود في فريق آخر");
  if (team._count.members >= team.maxMembers) throw new Error("الفريق ممتلئ");
  const invite = await db.teamInvite.upsert({
    where: { teamId_invitedUserId: { teamId, invitedUserId: input.invitedUserId } },
    update: { inviterId: input.userId, status: "PENDING", expiresAt: new Date(Date.now() + 7 * 86_400_000) },
    create: { teamId, inviterId: input.userId, invitedUserId: input.invitedUserId, expiresAt: new Date(Date.now() + 7 * 86_400_000) },
    include: { team: true, inviter: { select: { displayName: true } }, invitedUser: { select: { displayName: true } } },
  });
  return invite;
}

export async function listMyTeamInvites(userId: string) {
  await db.teamInvite.updateMany({ where: { invitedUserId: userId, status: "PENDING", expiresAt: { lte: new Date() } }, data: { status: "EXPIRED" } });
  return db.teamInvite.findMany({
    where: { invitedUserId: userId, status: "PENDING", expiresAt: { gt: new Date() } },
    include: { team: { include: { _count: { select: { members: true } } } }, inviter: { select: { displayName: true, avatarUrl: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function respondToTeamInvite(inviteId: string, userId: string, accept: boolean) {
  await serializable(async (tx) => {
    const invite = await tx.teamInvite.findUnique({ where: { id: inviteId }, include: { team: { include: { _count: { select: { members: true } } } } } });
    if (!invite || invite.invitedUserId !== userId || invite.status !== TeamInviteStatus.PENDING) throw new Error("الدعوة غير متاحة");
    if (invite.expiresAt <= new Date()) { await tx.teamInvite.update({ where: { id: invite.id }, data: { status: "EXPIRED" } }); throw new Error("انتهت صلاحية الدعوة"); }
    if (!accept) { await tx.teamInvite.update({ where: { id: invite.id }, data: { status: "DECLINED" } }); return; }
    if (invite.team._count.members >= invite.team.maxMembers) throw new Error("الفريق ممتلئ");
    if (await tx.teamMember.findUnique({ where: { userId } })) throw new Error("أنت عضو في فريق بالفعل");
    await tx.teamMember.create({ data: { teamId: invite.teamId, userId } });
    await tx.teamInvite.update({ where: { id: invite.id }, data: { status: "ACCEPTED" } });
    await tx.teamInvite.updateMany({ where: { invitedUserId: userId, id: { not: invite.id }, status: "PENDING" }, data: { status: "DECLINED" } });
  });
  return getMyTeam(userId);
}

export async function setTeamMemberRole(teamId: string, actorId: string, memberId: string, role: "CAPTAIN" | "MEMBER") {
  const actor = await requireManager(teamId, actorId);
  if (actor.role !== TeamMemberRole.OWNER) throw new Error("مالك الفريق فقط يستطيع تعيين القادة");
  const member = await db.teamMember.findUnique({ where: { userId: memberId } });
  if (!member || member.teamId !== teamId || member.role === TeamMemberRole.OWNER) throw new Error("لا يمكن تعديل هذا العضو");
  await db.teamMember.update({ where: { userId: memberId }, data: { role } });
  return getTeam(teamId);
}

export async function removeTeamMember(teamId: string, actorId: string, memberId: string) {
  const actor = await requireManager(teamId, actorId);
  const member = await db.teamMember.findUnique({ where: { userId: memberId } });
  if (!member || member.teamId !== teamId) throw new Error("العضو غير موجود في هذا الفريق");
  if (member.role === TeamMemberRole.OWNER || (actor.role === TeamMemberRole.CAPTAIN && member.role === TeamMemberRole.CAPTAIN)) throw new Error("لا تملك صلاحية إزالة هذا العضو");
  await db.teamMember.delete({ where: { userId: memberId } });
  return getTeam(teamId);
}

export async function leaveTeam(userId: string) {
  const membership = await db.teamMember.findUnique({ where: { userId } });
  if (!membership) return { left: false };
  if (membership.role === TeamMemberRole.OWNER) throw new Error("احذف الفريق أو انقل الملكية قبل المغادرة");
  await db.teamMember.delete({ where: { userId } });
  return { left: true };
}

export async function deleteTeam(teamId: string, userId: string) {
  const team = await db.team.findUniqueOrThrow({ where: { id: teamId } });
  if (team.ownerId !== userId) throw new Error("مالك الفريق فقط يستطيع حذفه");
  await db.team.delete({ where: { id: teamId } });
  return { deleted: true };
}

export async function adminDeleteTeam(teamId: string, adminId: string) {
  const team = await db.team.findUniqueOrThrow({ where: { id: teamId }, select: { id: true, name: true, _count: { select: { members: true } } } });
  await db.$transaction([
    db.team.delete({ where: { id: teamId } }),
    db.auditLog.create({ data: { adminId, action: "team.deleted", targetId: team.id, details: { name: team.name, members: team._count.members } } }),
  ]);
  return { deleted: true, name: team.name };
}
