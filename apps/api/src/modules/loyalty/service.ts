import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { db } from "../../../../../packages/db/src/client.js";
import { publish } from "../../events.js";
import { serializable } from "../../db-transaction.js";

export const VIP_PRICE = 2_500;
export const loyaltyShop = [
  { key: "double-24h", name: "مضاعف الولاء ×2", description: "كل نقاط الولاء التي تكسبها تتضاعف لمدة 24 ساعة.", icon: "⚡", price: 450, kind: "TIMED" },
  { key: "lfg-priority-7d", name: "أولوية غرف LFG", description: "غرفك تظهر بشارة مميزة وفي مقدمة قائمة الغرف لمدة 7 أيام.", icon: "🚀", price: 700, kind: "TIMED" },
  { key: "gold-badge", name: "شارة المؤسس الذهبية", description: "شارة دائمة تظهر بجانب اسمك في ملف Zark.", icon: "🏅", price: 1_000, kind: "PERMANENT" },
  { key: "vip", name: "Zark VIP · 3 أيام", description: "رتبة VIP لمدة 3 أيام مع ×1.5 لنقاط الولاء وXP. كل شراء جديد يمدد المدة.", icon: "💎", price: VIP_PRICE, kind: "TIMED" },
] as const;
export type LoyaltyRewardKey = typeof loyaltyShop[number]["key"];
export const loyaltyTiers = [
  { key: "member", name: "Zark Member", threshold: 0 },
  { key: "loyal", name: "Zark Loyal", threshold: 500 },
  { key: "elite", name: "Zark Elite", threshold: 1_500 },
] as const;

export function loyaltyTier(points: number) {
  return [...loyaltyTiers].reverse().find((tier) => points >= tier.threshold) ?? loyaltyTiers[0];
}

export function isVipActive(vipUntil: Date | null | undefined, now = Date.now()) {
  return Boolean(vipUntil && vipUntil.getTime() > now);
}

export function applyVipXpMultiplier(points: number, vipUntil: Date | null | undefined, now = Date.now()) {
  return isVipActive(vipUntil, now) ? Math.round(points * 1.5) : points;
}

export async function awardLoyaltyPoints(input: { userId: string; amount: number; reason: string; referenceKey: string }) {
  if (input.amount <= 0) return null;
  const [settings, member] = await Promise.all([
    db.guildSettings.findUnique({ where: { guildId: process.env.DISCORD_GUILD_ID ?? "default" }, select: { loyaltyBoostUntil: true, loyaltyBoostMultiplier: true } }),
    db.user.findUnique({where:{id:input.userId},select:{loyaltyDoubleUntil:true,vipUntil:true}}),
  ]);
  const globalMultiplier = settings?.loyaltyBoostUntil && settings.loyaltyBoostUntil.getTime() > Date.now() ? Math.max(1, settings.loyaltyBoostMultiplier) : 1;
  const personalMultiplier = (member?.loyaltyDoubleUntil && member.loyaltyDoubleUntil.getTime() > Date.now() ? 2 : 1) * (isVipActive(member?.vipUntil) ? 1.5 : 1);
  const multiplier = Math.min(4, globalMultiplier * personalMultiplier);
  const amount = Math.round(input.amount * multiplier);
  try {
    const result = await serializable(async (tx) => {
      const transaction = await tx.loyaltyTransaction.create({ data: { ...input, amount, reason: multiplier > 1 ? `${input.reason} ×${multiplier}` : input.reason } });
      const user = await tx.user.update({ where: { id: input.userId }, data: { loyaltyPoints: { increment: amount }, lifetimeLoyaltyPoints: { increment: amount } } });
      return { transaction, user };
    });
    publish({ type: "loyalty.updated", userId: input.userId, points: result.user.loyaltyPoints, lifetimePoints: result.user.lifetimeLoyaltyPoints, vipUnlocked: result.user.vipUnlocked });
    return result;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return null;
    throw error;
  }
}

export async function getLoyaltyProfile(userId: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { loyaltyPoints: true, lifetimeLoyaltyPoints: true, vipUnlocked: true, vipUntil:true, loyaltyDoubleUntil:true, lfgPriorityUntil:true, loyaltyBadge:true, loyaltyTransactions: { orderBy: { createdAt: "desc" }, take: 16 } } });
  const tier = loyaltyTier(user.lifetimeLoyaltyPoints);
  const next = loyaltyTiers.find((item) => item.threshold > user.lifetimeLoyaltyPoints);
  const now=Date.now();
  const vipActive=isVipActive(user.vipUntil,now);
  // Keep expired purchasers eligible for role reconciliation, including retries
  // after Discord permission/network failures. vipUntil controls all benefits.
  const shop=loyaltyShop.map(reward=>({...reward,owned:reward.key==='gold-badge'?user.loyaltyBadge==='GOLD':false,activeUntil:reward.key==='vip'?user.vipUntil?.toISOString():reward.key==='double-24h'?user.loyaltyDoubleUntil?.toISOString():reward.key==='lfg-priority-7d'?user.lfgPriorityUntil?.toISOString():undefined,active:reward.key==='vip'?vipActive:reward.key==='gold-badge'?user.loyaltyBadge==='GOLD':reward.key==='double-24h'?Boolean(user.loyaltyDoubleUntil&&user.loyaltyDoubleUntil.getTime()>now):Boolean(user.lfgPriorityUntil&&user.lfgPriorityUntil.getTime()>now)}));
  return { points: user.loyaltyPoints, lifetimePoints: user.lifetimeLoyaltyPoints, vipUnlocked: vipActive, vipUntil:user.vipUntil?.toISOString(), loyaltyBadge:user.loyaltyBadge, tier, nextTier: next, vipPrice: VIP_PRICE, shop, recent: user.loyaltyTransactions.map((item) => ({ amount: item.amount, reason: item.reason, referenceKey:item.referenceKey, createdAt: item.createdAt.toISOString() })) };
}

export async function purchaseLoyaltyReward(userId:string,rewardKey:LoyaltyRewardKey) {
  const reward=loyaltyShop.find(item=>item.key===rewardKey);
  if(!reward)throw new Error("المكافأة غير موجودة في متجر الولاء");
  const now=new Date();
  const result = await serializable(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { loyaltyPoints: true, vipUntil:true,loyaltyBadge:true,loyaltyDoubleUntil:true,lfgPriorityUntil:true } });
    if(rewardKey==='gold-badge'&&user.loyaltyBadge==='GOLD')throw new Error("الشارة الذهبية مملوكة لديك بالفعل");
    if (user.loyaltyPoints < reward.price) throw new Error(`تحتاج ${reward.price - user.loyaltyPoints} نقطة ولاء إضافية`);
    const charged=await tx.user.updateMany({where:{id:userId,loyaltyPoints:{gte:reward.price}},data:{loyaltyPoints:{decrement:reward.price}}});
    if(charged.count!==1)throw new Error("رصيد نقاط الولاء غير كافٍ");
    const extend=(current:Date|null|undefined,days:number)=>new Date(Math.max(now.getTime(),current?.getTime()||0)+days*86_400_000);
    const data=rewardKey==='vip'?{vipUnlocked:true,vipUntil:extend(user.vipUntil,3)}:rewardKey==='gold-badge'?{loyaltyBadge:'GOLD'}:rewardKey==='double-24h'?{loyaltyDoubleUntil:extend(user.loyaltyDoubleUntil,1)}:{lfgPriorityUntil:extend(user.lfgPriorityUntil,7)};
    await tx.loyaltyTransaction.create({ data: { userId, amount: -reward.price, reason: `شراء ${reward.name}`, referenceKey: `shop:${rewardKey}:${userId}:${randomUUID()}` } });
    return tx.user.update({where:{id:userId},data});
  });
  publish({ type: "loyalty.updated", userId, points: result.loyaltyPoints, lifetimePoints: result.lifetimeLoyaltyPoints, vipUnlocked: result.vipUnlocked });
  return getLoyaltyProfile(userId);
}

export async function buyVip(userId: string) { return purchaseLoyaltyReward(userId,'vip'); }

export async function listLoyaltyRoleMembers() {
  return db.user.findMany({ where: { OR: [{ vipUnlocked: true }, { vipUntil: { gt: new Date() } }, { lifetimeLoyaltyPoints: { gte: 500 } }] }, select: { id: true }, take: 1_000 });
}

export async function weeklyLoyaltyLeaderboard() {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60_000);
  const rows = await db.loyaltyTransaction.groupBy({ by: ["userId"], where: { amount: { gt: 0 }, createdAt: { gte: since } }, _sum: { amount: true }, orderBy: { _sum: { amount: "desc" } }, take: 10 });
  const users = await db.user.findMany({ where: { id: { in: rows.map((row) => row.userId) } }, select: { id: true, displayName: true, avatarUrl: true } });
  const byId = new Map(users.map((user) => [user.id, user]));
  return rows.map((row, index) => ({ rank: index + 1, userId: row.userId, displayName: byId.get(row.userId)?.displayName ?? "لاعب Zark", avatarUrl: byId.get(row.userId)?.avatarUrl ?? undefined, points: row._sum.amount ?? 0 }));
}

export async function startLoyaltyBoost(adminId: string, minutes = 60) {
  const guildId = process.env.DISCORD_GUILD_ID ?? "default";
  const until = new Date(Date.now() + Math.min(180, Math.max(15, minutes)) * 60_000);
  await db.$transaction([
    db.guildSettings.upsert({ where: { guildId }, update: { loyaltyBoostUntil: until, loyaltyBoostMultiplier: 2, updatedBy: adminId }, create: { guildId, loyaltyBoostUntil: until, loyaltyBoostMultiplier: 2, updatedBy: adminId } }),
    db.auditLog.create({ data: { adminId, action: "loyalty.boost_started", targetId: guildId, details: { until: until.toISOString(), multiplier: 2 } } }),
  ]);
  return { multiplier: 2, until: until.toISOString() };
}
