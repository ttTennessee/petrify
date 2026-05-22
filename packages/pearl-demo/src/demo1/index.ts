// demo1:用户 CRUD 全流程。
// 新增 / 单查 / 列表 / 自定义过滤 / 修改 / 删除 / 审计 / 时间旅行复活。
//
// 默认每次跑都清空 data/playground 让输出可复现;
// 想保留数据就注释掉下面的 rmSync。

import { rmSync } from "node:fs";

import { dataDir } from "../paths.js";
import service from "./service.js";
import type { BaseUser } from "./types.js";

rmSync(dataDir, { recursive: true, force: true });

// ─── 1. 新增 ───
console.log("━━━ 新增 ━━━");
const u1: BaseUser = {
  name: "Alice",
  gender: "female",
  email: "alice@example.com",
  phone: "13800138000",
};
const u2: BaseUser = {
  name: "Bob",
  gender: "male",
  email: "bob@example.com",
  phone: "13900139000",
};
const u3: BaseUser = {
  name: "Carol",
  gender: "female",
  email: "carol@gmail.com",
  phone: "13700137000",
};

const aliceId = await service.addUser(u1);
const bobId = await service.addUser(u2);
const carolId = await service.addUser(u3);
console.log(`新增: alice=${aliceId} bob=${bobId} carol=${carolId}`);

// ─── 2. 列表 ───
console.log();
console.log("━━━ listUsers() ━━━");
console.table(service.listUsers());

console.log();
console.log("━━━ listUsers({ gender: 'female' }) ━━━");
console.table(service.listUsers({ gender: "female" }));

console.log();
console.log("━━━ searchByEmailDomain('gmail.com') ━━━");
console.table(service.searchByEmailDomain("gmail.com"));

// ─── 3. 单查 ───
console.log();
console.log("━━━ findUser(bobId) ━━━");
console.log(service.findUser(bobId));

// ─── 4. 修改 ───
console.log();
console.log("━━━ updateUser(bobId, { phone, email }) ━━━");
const updated = await service.updateUser(bobId, {
  phone: "19900199000",
  email: "bob@new-domain.com",
});
console.log("更新后:");
console.log(updated);

console.log(
  "updateUser('not-exist', ...):",
  await service.updateUser("not-exist", { phone: "x" }),
);

// ─── 5. 删除 ───
console.log();
console.log("━━━ deleteUser(carolId) ━━━");
const deleted = await service.deleteUser(carolId);
console.log(`deleteUser 返回: ${deleted}`);

console.log();
console.log("删除后 listUsers():");
console.table(service.listUsers());

console.log();
console.log("findUser(carolId) →", service.findUser(carolId));

// ─── 6. 审计:删除后历史仍在 ───
console.log();
console.log("━━━ carol 的完整事件历史(Created + Deleted)━━━");
for (const ev of service.userHistory(carolId)) {
  console.log(
    `  ${String(ev.seq).padStart(3)}  ${ev.type.padEnd(10)}  ${JSON.stringify(ev.payload)}`,
  );
}

// ─── 7. 时间旅行:复活 carol ───
console.log();
console.log("━━━ userAt(carolId, beforeDeleteSeq) 复活生前样貌 ━━━");
const carolHistory = service.userHistory(carolId);
const createdSeq = carolHistory[0]!.seq;
console.log(service.userAt(carolId, createdSeq));

service.close();
