import { Prisma } from "@prisma/client";
import { db } from "../../../../../packages/db/src/client.js";
import { publish } from "../../events.js";
import { serializable } from "../../db-transaction.js";

export const VIP_PRICE = 2_500;
export const loyaltyTiers = [
  { key: "member", name: "Zark Member", threshold: 0 },
  { key: "loyal", name: "Zark Loyal", threshold: 500 },
  { key: "elite", name: "Zark Elite", threshold: 1_500 },
] as const;

export function loyaltyTier(points: number) {
  return [...loyaltyTiers].reverse().find((tier) => points >= tier.threshold) ?? loyaltyTiers[0];
}

export async function awardLoyaltyPoints(input: { userId: string; amount: number; reason: string; referenceKey: string }) {
  if (input.amount <= 0) return null;
  try {
    const result = await serializable(async (tx) => {
      const transaction = await tx.loyaltyTransaction.create({ data: input });
      const user = await tx.user.update({ where: { id: input.userId }, data: { loyaltyPoints: { increment: input.amount }, lifetimeLoyaltyPoints: { increment: input.amount } } });
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
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { loyaltyPoints: true, lifetimeLoyaltyPoints: true, vipUnlocked: true, loyaltyTransactions: { orderBy: { createdAt: "desc" }, take: 12 } } });
  const tier = loyaltyTier(user.lifetimeLoyaltyPoints);
  const next = loyaltyTiers.find((item) => item.threshold > user.lifetimeLoyaltyPoints);
  return { points: user.loyaltyPoints, lifetimePoints: user.lifetimeLoyaltyPoints, vipUnlocked: user.vipUnlocked, tier, nextTier: next, vipPrice: VIP_PRICE, recent: user.loyaltyTransactions.map((item) => ({ amount: item.amount, reason: item.reason, createdAt: item.createdAt.toISOString() })) };
}

export async function buyVip(userId: string) {
  const result = await serializable(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { loyaltyPoints: true, vipUnlocked: true } });
    if (user.vipUnlocked) throw new Error("رتبة VIP مفعلة لديك بالفعل");
    if (user.loyaltyPoints < VIP_PRICE) throw new Error(`تحتاج ${VIP_PRICE - user.loyaltyPoints} نقطة ولاء إضافية لرتبة VIP`);
    await tx.loyaltyTransaction.create({ data: { userId, amount: -VIP_PRICE, reason: "شراء رتبة Zark VIP", referenceKey: `vip:${userId}` } });
    return tx.user.update({ where: { id: userId }, data: { loyaltyPoints: { decrement: VIP_PRICE }, vipUnlocked: true } });
  });
  publish({ type: "loyalty.updated", userId, points: result.loyaltyPoints, lifetimePoints: result.lifetimeLoyaltyPoints, vipUnlocked: true });
  return getLoyaltyProfile(userId);
}

export async function listLoyaltyRoleMembers() {
  return db.user.findMany({ where: { OR: [{ vipUnlocked: true }, { lifetimeLoyaltyPoints: { gte: 500 } }] }, select: { id: true }, take: 1_000 });
}
