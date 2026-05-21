import { defineConfig } from "drizzle-kit";

// drizzle-kit 仅用于生成 migration SQL;运行时 migration 由 createSqliteDb
// 内部 migrate() 应用,不读这份 config。
//
// 用法:
//   pnpm --filter @petrify/db-sqlite db:generate    # schema 改动后生成新 migration
//   pnpm --filter @petrify/db-sqlite db:migrate     # 离线对 PETRIFY_DB 应用 migration(可选)
export default defineConfig({
  schema: "./src/schema.ts",
  out: "./migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.PETRIFY_DB ?? "./data/petrify.sqlite",
  },
  strict: true,
  verbose: true,
});
