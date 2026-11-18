import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

function createPrismaClient(): PrismaClient {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL environment variable is missing. " +
      "Set it in Vercel → Settings → Environment Variables to your Supabase " +
      "connection string (use the connection pooler / port 6543 for serverless)."
    );
  }

  // Supabase requires SSL. Enable it for any non-local connection so we don't
  // depend on `sslmode` being present in the URL (and accept Supabase's cert).
  const isLocal =
    databaseUrl.includes("localhost") || databaseUrl.includes("127.0.0.1");

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: isLocal ? undefined : { rejectUnauthorized: false },
  });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function getPrismaClient(): PrismaClient {
  globalForPrisma.prisma ??= createPrismaClient();
  return globalForPrisma.prisma;
}

// Created on first use, not at import: `next build` imports this module while
// collecting page data, and must not need DATABASE_URL to do that.
const prisma = new Proxy({} as PrismaClient, {
  get: (_target, prop) => {
    const client = getPrismaClient();
    const value = Reflect.get(client, prop);
    return typeof value === "function" ? value.bind(client) : value; // e.g. $transaction
  },
});

export { prisma };
