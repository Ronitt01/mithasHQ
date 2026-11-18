import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  // Needed by `prisma db push`. Prefer Neon's direct (unpooled) URL for schema changes.
  // process.env (not env()) so `prisma generate` still works when no DB is configured.
  datasource: {
    url: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL,
  },
});
