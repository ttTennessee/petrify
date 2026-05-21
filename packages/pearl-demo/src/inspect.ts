// 查某个 entity 的当前状态 + 完整事件历史。
//
// 用法:pnpm --filter @petrify/pearl-demo run inspect <entity-id>

import { Pearl } from "@petrify/pearl";

import { dataDir } from "./paths.js";

const id = process.argv[2];
if (!id) {
  console.error("Usage: pnpm --filter @petrify/pearl-demo run inspect <id>");
  process.exit(1);
}

const db = Pearl.open({ dir: dataDir });

const entity = db.get(id);
if (!entity) {
  // 也试一下时间旅行查看(可能已被删除)
  const events = db._eventsFor(id);
  if (events.length === 0) {
    console.log(`No entity "${id}"`);
  } else {
    console.log(`Entity "${id}" exists in history but is currently deleted.`);
    console.log("History:");
    for (const ev of events) {
      console.log(`  ${ev.seq}  ${ev.type}  ${JSON.stringify(ev.payload)}`);
    }
  }
  db.close();
  process.exit(0);
}

console.log("─── entity ───");
console.log(entity);
console.log();

console.log("─── history ───");
for (const ev of db.history(id)) {
  console.log(`  ${ev.seq}  ${ev.type.padEnd(14)}  ${JSON.stringify(ev.payload)}`);
}
console.log();

const outEdges = db.traverse(id, { direction: "out" });
const inEdges = db.traverse(id, { direction: "in" });
if (outEdges.length > 0 || inEdges.length > 0) {
  console.log("─── edges ───");
  for (const e of outEdges) console.log(`  →  ${e.id}  (${e.type})`);
  for (const e of inEdges) console.log(`  ←  ${e.id}  (${e.type})`);
}

db.close();
