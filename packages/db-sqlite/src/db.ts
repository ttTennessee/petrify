// Drizzle handle 类型别名 —— 所有 repo 工厂以此为输入。

import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

import type { schema } from "./schema.js";

export type DrizzleDb = BetterSQLite3Database<typeof schema>;
