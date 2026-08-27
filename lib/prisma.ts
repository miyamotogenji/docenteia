import { PrismaClient } from "@prisma/client";

// En desarrollo Next.js recarga los módulos en caliente. Sin este singleton,
// cada recarga abriría un pool de conexiones nuevo y Postgres acabaría
// rechazando conexiones (especialmente en el pooler de Supabase).
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
