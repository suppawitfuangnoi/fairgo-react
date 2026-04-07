import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Cap the Prisma connection pool so Railway instances don't exhaust
 * Aiven's free-tier limit (~25 connections total).
 *
 * Injects `?connection_limit=3` into DATABASE_URL if it isn't already set.
 * 3 connections × up to 8 Railway instances = 24 ≤ 25.
 */
function buildDatabaseUrl(): string | undefined {
  const raw = process.env.DATABASE_URL;
  if (!raw) return raw;
  // Already has a connection_limit — respect it
  if (raw.includes("connection_limit")) return raw;
  const sep = raw.includes("?") ? "&" : "?";
  return `${raw}${sep}connection_limit=3`;
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
    datasources: {
      db: {
        url: buildDatabaseUrl(),
      },
    },
  });

// Cache on globalThis in ALL environments (not just dev).
// This prevents each Next.js serverless cold-start from allocating
// a fresh pool — the #1 cause of idle connection exhaustion on Aiven.
globalForPrisma.prisma = prisma;
