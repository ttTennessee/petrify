// Pearl 用户管理 demo:新增 / 单查 / 列表查 / 简单过滤。
//
// 每次跑 demo 默认清空 playground,输出可复现。
// 想保留历史数据:注释掉下面的 rmSync 行,然后用 `pnpm clean` 手动清理。

import { rmSync } from "node:fs";
import { randomUUID } from "node:crypto";

import { Pearl } from "@petrify/pearl";
import type { Entity } from "@petrify/pearl";

import { dataDir } from "./paths.js";

rmSync(dataDir, { recursive: true, force: true });

const db = Pearl.open({ dir: dataDir });

// ─── 领域类型 ───
type Gender = "male" | "female" | "other";

type NewUser = {
  name: string;
  gender: Gender;
  email: string;
  phone: string;
};

type User = NewUser & { id: string; createdAt: number };

// ─── 业务方法 ───

/** 新增用户,返回 id。 */
async function addUser(input: NewUser): Promise<string> {
  const id = `user-${randomUUID().slice(0, 8)}`;
  await db.commit({
    events: [
      {
        entityId: id,
        type: "Created",
        payload: { entityType: "user", attrs: { ...input } },
      },
    ],
  });
  return id;
}

/** 按 id 查单个,返回类型化的 User 或 undefined。 */
function findUser(id: string): User | undefined {
  const e = db.get(id);
  return e ? toUser(e) : undefined;
}

/** 列表查询,可选按等值字段过滤(gender 等)。 */
function listUsers(filter?: Partial<NewUser>): User[] {
  // db.match 接受 where = Record<string, Value>,精准等值匹配
  return db.match("user", filter as Record<string, string> | undefined).map(toUser);
}

/** 复杂过滤示例:邮箱域名后缀匹配(非等值,需手动 filter)。 */
function searchByEmailDomain(domain: string): User[] {
  return db
    .match("user")
    .filter(
      (e) =>
        typeof e.attrs["email"] === "string" &&
        (e.attrs["email"] as string).endsWith(`@${domain}`),
    )
    .map(toUser);
}

function toUser(e: Entity): User {
  return {
    id: e.id,
    name: e.attrs["name"] as string,
    gender: e.attrs["gender"] as Gender,
    email: e.attrs["email"] as string,
    phone: e.attrs["phone"] as string,
    createdAt: e.createdAt,
  };
}

// ─── 跑场 ───

console.log("━━━ 新增 ━━━");
const aliceId = await addUser({
  name: "Alice",
  gender: "female",
  email: "alice@example.com",
  phone: "13800138000",
});
const bobId = await addUser({
  name: "Bob",
  gender: "male",
  email: "bob@example.com",
  phone: "13900139000",
});
const carolId = await addUser({
  name: "Carol",
  gender: "female",
  email: "carol@gmail.com",
  phone: "13700137000",
});
const daveId = await addUser({
  name: "Dave",
  gender: "male",
  email: "dave@gmail.com",
  phone: "13600136000",
});
console.log(`已新增 4 个用户`);
console.log(`  alice = ${aliceId}`);
console.log(`  bob   = ${bobId}`);
console.log(`  carol = ${carolId}`);
console.log(`  dave  = ${daveId}`);

console.log();
console.log("━━━ 单个查询: findUser(alice) ━━━");
console.log(findUser(aliceId));

console.log();
console.log("━━━ 单个查询: findUser('missing') ━━━");
console.log(findUser("missing"));

console.log();
console.log("━━━ 列表: listUsers() ━━━");
console.table(listUsers());

console.log();
console.log("━━━ 列表: listUsers({ gender: 'female' }) ━━━");
console.table(listUsers({ gender: "female" }));

console.log();
console.log("━━━ 自定义过滤: searchByEmailDomain('gmail.com') ━━━");
console.table(searchByEmailDomain("gmail.com"));

console.log();
console.log("━━━ 声明式 execute(只投影 name + email) ━━━");
const projected = db.execute({
  match: { type: "user", where: { gender: "female" } },
  project: { id: true, attrs: ["name", "email"] },
});
console.log(JSON.stringify(projected, null, 2));

console.log();
console.log("━━━ 涌现 shape(从写入推断出的字段类型)━━━");
console.log(Object.fromEntries(db._shapeOf("user")));

db.close();
