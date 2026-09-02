import { AdminSuspensionStatus, Prisma, SecurityActionType, SecuritySeverity } from "@prisma/client";
import { db } from "../../../../../packages/db/src/client.js";
import { serializable } from "../../db-transaction.js";

export const DEFAULT_OWNER_ID = "492368135144603658";

export type SecurityEventInput = {
  guildId: string;
  executorId?: string;
  targetId?: string;
  actionType: SecurityActionType;
  auditLogId?: string;
  reason?: string;
  metadata?: Prisma.InputJsonValue;
  executorIsBot?: boolean;
  roleSnapshots?: { roleId: string; roleName?: string }[];
};

const COUNTED_TYPES: Record<string, SecurityActionType[]> = {
  bans: ["MEMBER_BAN"],
  timeouts: ["MEMBER_TIMEOUT"],
  kicks: ["MEMBER_KICK"],
  roles: ["ROLE_ADDED", "ROLE_REMOVED", "ROLE_CREATED", "ROLE_DELETED", "ROLE_UPDATED"],
  channels: ["CHANNEL_CREATED", "CHANNEL_DELETED", "CHANNEL_UPDATED"],
  webhooks: ["WEBHOOK_CREATED", "WEBHOOK_DELETED", "WEBHOOK_UPDATED"],
};

export function ownerUserId() {
  return process.env.DISCORD_OWNER_ID?.trim() || DEFAULT_OWNER_ID;
}

export function isOwnerId(userId: string) {
  return userId === ownerUserId();
}

export async function isSuspended(guildId: string, userId: string) {
  if (isOwnerId(userId)) return false;
  return Boolean(await db.adminSuspension.findUnique({ where: { guildId_userId: { guildId, userId } }, select: { status: true } }).then((row) => row?.status === "SUSPENDED"));
}

export async function getSecuritySettings(guildId: string) {
  return db.securitySettings.upsert({ where: { guildId }, update: {}, create: { guildId } });
}

export async function updateSecuritySettings(guildId: string, input: Partial<{
  enabled: boolean; maxBansPerHour: number; maxTimeoutsPerHour: number; maxKicksPerHour: number;
  maxRoleChangesPerHour: number; maxChannelDeletesPerHour: number; maxWebhookChangesPerHour: number;
  ownerDmAlertsEnabled: boolean; securityLogChannelId: string | null; operationalExemptUserIds: string[];
}>) {
  return db.securitySettings.upsert({ where: { guildId }, update: input, create: { guildId, ...input } });
}

export async function recordSecurityAction(input: SecurityEventInput) {
  // Audit events without a proven executor are retained for review but never punish anyone.
  return serializable(async (tx) => {
    const settings = await tx.securitySettings.upsert({ where: { guildId: input.guildId }, update: {}, create: { guildId: input.guildId } });
    if (input.auditLogId) {
      const duplicate = await tx.securityAction.findUnique({ where: { guildId_auditLogId: { guildId: input.guildId, auditLogId: input.auditLogId } } });
      if (duplicate) return { duplicate: true, action: duplicate, suspend: false, counts: emptyCounts() };
    }
    const policy = securityPolicy(input, settings);
    const action = await tx.securityAction.create({ data: {
      guildId: input.guildId, executorId: input.executorId, targetId: input.targetId, actionType: input.actionType,
      auditLogId: input.auditLogId, reason: input.reason, metadata: securityMetadata(input.metadata, policy),
      severity: input.executorId ? "INFO" : "WARNING",
    } });
    // Bots are logged as EXEMPT, but never enter a counter or enforcement path.
    const counts = policy.bot ? emptyCounts() : await actionCounts(tx, input.guildId, input.executorId);
    const threshold = policy.enforce ? reachedThreshold(settings, input.actionType, counts) : undefined;
    const alreadySuspended = input.executorId ? await tx.adminSuspension.findUnique({ where: { guildId_userId: { guildId: input.guildId, userId: input.executorId } } }) : null;
    if (!settings.enabled || !input.executorId || !policy.enforce || alreadySuspended?.status === "SUSPENDED" || !threshold) {
      if (!input.executorId) await tx.securityAlert.create({ data: { guildId: input.guildId, severity: "WARNING", title: "Unconfirmed audit event", message: `${input.actionType} was recorded without a confirmed executor.`, actionId: action.id } });
      return { duplicate: false, action, suspend: false, counts, owner: policy.owner, exempt: policy.exempt, executorType: policy.executorType, settings };
    }
    const suspension = await tx.adminSuspension.upsert({
      where: { guildId_userId: { guildId: input.guildId, userId: input.executorId } },
      update: { status: "SUSPENDED", reason: threshold.reason, trigger: input.actionType, actionCounts: counts, suspendedAt: new Date(), restoredAt: null, restoredBy: null, roleSnapshots: { deleteMany: {}, create: safeSnapshots(input.roleSnapshots) } },
      create: { guildId: input.guildId, userId: input.executorId, reason: threshold.reason, trigger: input.actionType, actionCounts: counts, roleSnapshots: { create: safeSnapshots(input.roleSnapshots) } },
      include: { roleSnapshots: true },
    });
    await tx.securityAction.update({ where: { id: action.id }, data: { severity: "CRITICAL" } });
    await tx.securityAlert.create({ data: { guildId: input.guildId, severity: "CRITICAL", title: "Admin suspended by Anti-Abuse", message: `${input.executorId}: ${threshold.reason}`, actionId: action.id, suspensionId: suspension.id } });
    return { duplicate: false, action, suspend: true, counts, suspension, settings };
  });
}

/** One enforcement decision for every audit event: owner → bot → human exemption → human. */
function securityPolicy(input: SecurityEventInput, settings: Awaited<ReturnType<typeof getSecuritySettings>>) {
  const owner = Boolean(input.executorId && isOwnerId(input.executorId));
  const bot = Boolean(input.executorId && input.executorIsBot);
  const humanExempt = Boolean(input.executorId && !bot && settings.operationalExemptUserIds.includes(input.executorId) && isExemptibleAction(input.actionType));
  return {
    owner,
    bot,
    exempt: owner || bot || humanExempt,
    enforce: Boolean(input.executorId && !owner && !bot && !humanExempt),
    executorType: bot ? "BOT" : input.executorId ? "HUMAN" : "UNKNOWN",
    protectionAction: bot ? "EXEMPT" : owner ? "OWNER_EXEMPT" : humanExempt ? "HUMAN_EXEMPT" : "ENFORCE",
  };
}

function securityMetadata(metadata: Prisma.InputJsonValue | undefined, policy: ReturnType<typeof securityPolicy>): Prisma.InputJsonValue {
  const base = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata as Prisma.JsonObject : {};
  return { ...base, executorType: policy.executorType, protectionAction: policy.protectionAction };
}

export async function securityDashboard(guildId: string) {
  const since = new Date(Date.now() - 60 * 60_000);
  const [settings, actions, suspensions, alerts, counts] = await Promise.all([
    getSecuritySettings(guildId),
    db.securityAction.findMany({ where: { guildId }, orderBy: { timestamp: "desc" }, take: 100 }),
    db.adminSuspension.findMany({ where: { guildId }, include: { roleSnapshots: true }, orderBy: { suspendedAt: "desc" }, take: 100 }),
    db.securityAlert.findMany({ where: { guildId }, orderBy: { createdAt: "desc" }, take: 50 }),
    countAll(db, guildId, since),
  ]);
  return { protection: { active: settings.enabled, guildId, ownerUserId: ownerUserId() }, settings, counts, actions, suspensions, alerts };
}

export async function restoreSuspendedAdmin(guildId: string, userId: string, restoredBy: string) {
  if (!isOwnerId(restoredBy)) throw Object.assign(new Error("Owner only"), { statusCode: 403 });
  return serializable(async (tx) => {
    const suspension = await tx.adminSuspension.findUnique({ where: { guildId_userId: { guildId, userId } }, include: { roleSnapshots: true } });
    if (!suspension || suspension.status !== "SUSPENDED") throw Object.assign(new Error("No active suspension"), { statusCode: 404 });
    const restored = await tx.adminSuspension.update({ where: { id: suspension.id }, data: { status: "RESTORED", restoredAt: new Date(), restoredBy } });
    await tx.securityAction.create({ data: { guildId, executorId: restoredBy, targetId: userId, actionType: "ROLE_ADDED", severity: "INFO", reason: "Owner restored suspended administrator", metadata: { suspensionId: suspension.id, roleIds: suspension.roleSnapshots.map((role) => role.roleId) } } });
    return { suspension: restored, roleIds: suspension.roleSnapshots.map((role) => role.roleId) };
  });
}

export async function pendingRestorations(guildId: string) {
  // Restored records are intentionally retained: the bot only adds roles that
  // are still present, manageable and missing, so a restart remains safe.
  return db.adminSuspension.findMany({
    where: { guildId, status: "RESTORED", restoredAt: { gte: new Date(Date.now() - 24 * 60 * 60_000) } },
    include: { roleSnapshots: true },
    orderBy: { restoredAt: "desc" },
    take: 50,
  });
}

export async function recentTimeoutActions(guildId: string, executorId: string) {
  return db.securityAction.findMany({
    where: { guildId, executorId, actionType: "MEMBER_TIMEOUT" },
    orderBy: { timestamp: "desc" }, take: 3,
  });
}

function safeSnapshots(roles: SecurityEventInput["roleSnapshots"]) {
  return (roles ?? []).filter((role) => /^\d{17,20}$/.test(role.roleId)).map((role) => ({ roleId: role.roleId, roleName: role.roleName?.slice(0, 100) }));
}

async function actionCounts(tx: Prisma.TransactionClient, guildId: string, executorId?: string) {
  if (!executorId) return emptyCounts();
  const since = new Date(Date.now() - 60 * 60_000);
  const rows = await Promise.all(Object.entries(COUNTED_TYPES).map(async ([key, types]) => [key, await tx.securityAction.count({ where: { guildId, executorId, actionType: { in: types }, timestamp: { gte: since } } })] as const));
  return Object.fromEntries(rows) as ReturnType<typeof emptyCounts>;
}

async function countAll(client: typeof db, guildId: string, since: Date) {
  const rows = await Promise.all(Object.entries(COUNTED_TYPES).map(async ([key, types]) => [key, await client.securityAction.count({ where: { guildId, actionType: { in: types }, timestamp: { gte: since } } })] as const));
  return Object.fromEntries(rows);
}

function emptyCounts() { return { bans: 0, timeouts: 0, kicks: 0, roles: 0, channels: 0, webhooks: 0 }; }

function reachedThreshold(settings: Awaited<ReturnType<typeof getSecuritySettings>>, type: SecurityActionType, counts: ReturnType<typeof emptyCounts>) {
  if (type === "MEMBER_BAN" && counts.bans >= settings.maxBansPerHour) return { reason: `Ban limit reached (${counts.bans}/${settings.maxBansPerHour} in 60m)` };
  if (type === "MEMBER_TIMEOUT" && counts.timeouts >= settings.maxTimeoutsPerHour) return { reason: `Timeout limit reached (${counts.timeouts}/${settings.maxTimeoutsPerHour} in 60m)` };
  if (type === "MEMBER_KICK" && counts.kicks >= settings.maxKicksPerHour) return { reason: `Kick limit reached (${counts.kicks}/${settings.maxKicksPerHour} in 60m)` };
  if (["ROLE_ADDED", "ROLE_REMOVED", "ROLE_CREATED", "ROLE_DELETED", "ROLE_UPDATED"].includes(type) && counts.roles >= settings.maxRoleChangesPerHour) return { reason: `Role-change limit reached (${counts.roles}/${settings.maxRoleChangesPerHour} in 60m)` };
  if (type === "CHANNEL_DELETED" && counts.channels >= settings.maxChannelDeletesPerHour) return { reason: `Channel-change limit reached (${counts.channels}/${settings.maxChannelDeletesPerHour} in 60m)` };
  if (["WEBHOOK_CREATED", "WEBHOOK_DELETED", "WEBHOOK_UPDATED"].includes(type) && counts.webhooks >= settings.maxWebhookChangesPerHour) return { reason: `Webhook-change limit reached (${counts.webhooks}/${settings.maxWebhookChangesPerHour} in 60m)` };
  return undefined;
}

function isExemptibleAction(type: SecurityActionType) {
  return type !== "MEMBER_BAN" && type !== "MEMBER_KICK";
}

export const actionTypeValues = Object.values(SecurityActionType);
export const severityValues = Object.values(SecuritySeverity);
export const suspensionStatusValues = Object.values(AdminSuspensionStatus);
