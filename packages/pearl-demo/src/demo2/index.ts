/**
 * demo2: ReadIntent 二进制 roundtrip + execute。
 *
 * 流程: 写入几条 user → 把查询意图 toBinary → fromBinary → execute。
 * 模拟「查询计划在网络/进程间传递后，在持有同一份 log 的 Pearl 上执行」。
 */

import { rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Pearl, read, type ReadIntent, type Value } from "@petrify/pearl";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(here, "..", "..", "data", "demo2");

rmSync(dataDir, { recursive: true, force: true });

const db = Pearl.open({ dir: dataDir, fsync: false });

// ─── 1. 写入示例数据 ───
console.log("━━━ 写入 2 个 user ━━━");
for (const [id, attrs] of [
  ["u-alice", { name: "Alice", gender: "female", email: "a@x.com" }],
  ["u-bob", { name: "Bob", gender: "male", email: "b@x.com" }],
] as const) {
  db.commit({
    events: [
      {
        entityId: id,
        type: "Created",
        payload: { entityType: "user", attrs },
      },
    ],
  });
  console.log(`  created ${id}`);
}

// ─── 2. 构造读意图(声明式查询) ───
const intent = read({
  match: { type: "user", where: { gender: "female" } },
  project: { id: true, attrs: ["name", "email"] },
});

console.log();
console.log("━━━ 原始 ReadIntent ━━━");
console.log(JSON.stringify(intent, null, 2));

// ─── 3. toBinary → fromBinary ───
const wire = Pearl.toBinary(intent as unknown as Value);
console.log();
console.log(`━━━ toBinary: ${wire.length} bytes ━━━`);
console.log(wire.toString("hex").slice(0, 80) + (wire.length > 40 ? "…" : ""));

const decoded = Pearl.fromBinary(wire) as ReadIntent;
console.log();
console.log("━━━ fromBinary 还原后与原始 deepEqual ━━━");
console.log(JSON.stringify(decoded) === JSON.stringify(intent) ? "  OK" : "  MISMATCH");

// ─── 4. 用还原后的意图查询 ───
console.log();
console.log("━━━ execute(decoded) 结果 ━━━");
const rows = db.execute(decoded);
console.log(JSON.stringify(rows, null, 2));

db.close();
