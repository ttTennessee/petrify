// 把 events.log 漂亮地打印出来,直观看"一切是事件"。
//
// 用法:pnpm --filter @petrify/pearl-demo run tail

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { dataDir } from "./paths.js";

const logPath = join(dataDir, "events.log");
if (!existsSync(logPath)) {
  console.error(`No events.log at ${logPath}`);
  console.error(`Run \`pnpm --filter @petrify/pearl-demo run demo\` first.`);
  process.exit(1);
}

const text = readFileSync(logPath, "utf8");
let intentCount = 0;

for (const line of text.split("\n")) {
  if (!line) continue;
  let ev: Record<string, unknown>;
  try {
    ev = JSON.parse(line);
  } catch {
    console.log("(parse error)", line);
    continue;
  }
  const seq = String(ev["seq"]).padStart(4);
  const type = String(ev["type"]).padEnd(18);
  const entityId = String(ev["entityId"]).padEnd(24);
  const payload = JSON.stringify(ev["payload"]);
  console.log(`${seq}  ${type}${entityId}${payload}`);
  if (ev["type"] === "IntentCommitted") {
    intentCount++;
    console.log("─".repeat(72));
  }
}

console.log();
console.log(`# intents=${intentCount}`);
