import { Prisma } from "@prisma/client";
import { db } from "../../../packages/db/src/client.js";

export async function serializable<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>, maxRetries = 5): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    try {
      return await db.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034" && attempt < maxRetries - 1) continue;
      throw error;
    }
  }
  throw new Error("تعذر إكمال العملية المتزامنة");
}
