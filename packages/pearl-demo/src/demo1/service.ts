import { randomUUID } from "node:crypto";

import { Pearl } from "@petrify/pearl";
import type { Entity, Event } from "@petrify/pearl";

import { dataDir } from "../paths.js";
import type { BaseUser, Gender, User } from "./types.js";

// 懒初始化:第一次写/读时才打开 db,允许调用方在导入 service 后再清空数据目录。
let _db: Pearl | undefined;
function db(): Pearl {
  if (!_db) _db = Pearl.open({ dir: dataDir });
  return _db;
}

/** 新增用户,返回 id。 */
async function addUser(input: BaseUser): Promise<string> {
  const id = `user-${randomUUID().slice(0, 8)}`;
  await db().commit({
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
  const e = db().get(id);
  return e ? toUser(e) : undefined;
}

/** 列表查询,可选按等值字段过滤(gender 等)。 */
function listUsers(filter?: Partial<BaseUser>): User[] {
  return db()
    .match("user", filter as Record<string, string> | undefined)
    .map(toUser);
}

/** 复杂过滤示例:邮箱域名后缀匹配(非等值,需手动 filter)。 */
function searchByEmailDomain(domain: string): User[] {
  return db()
    .match("user")
    .filter(
      (e) =>
        typeof e.attrs["email"] === "string" &&
        (e.attrs["email"] as string).endsWith(`@${domain}`),
    )
    .map(toUser);
}

/** 修改用户,patch 内只列出要变更的字段(局部合并)。 */
async function updateUser(
  id: string,
  patch: Partial<BaseUser>,
): Promise<User | undefined> {
  if (!db().get(id)) return undefined;
  await db().commit({
    events: [{ entityId: id, type: "AttrSet", payload: { ...patch } }],
  });
  return findUser(id);
}

/** 删除用户。返回 true 表示删除生效;false 表示用户不存在。 */
async function deleteUser(id: string): Promise<boolean> {
  if (!db().get(id)) return false;
  await db().commit({
    events: [{ entityId: id, type: "Deleted" }],
  });
  return true;
}

/** 查看某用户的完整事件历史(含 Created / AttrSet / Deleted)。 */
function userHistory(id: string): Event[] {
  return db().history(id);
}

/** 时间旅行:返回 id 在 seq 时刻的状态(已被删除的用户也能取到生前样貌)。 */
function userAt(id: string, seq: number): User | undefined {
  const e = db().at(id, seq);
  return e && !e.deleted ? toUser(e) : undefined;
}

/** 显式关闭(进程退出前调用)。 */
function close(): void {
  if (_db) {
    _db.close();
    _db = undefined;
  }
}

function toUser(e: Entity): User {
  return {
    id: e.id,
    name: e.attrs["name"] as string,
    gender: e.attrs["gender"] as Gender,
    email: e.attrs["email"] as string,
    phone: e.attrs["phone"] as string,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}

export default {
  addUser,
  findUser,
  listUsers,
  searchByEmailDomain,
  updateUser,
  deleteUser,
  userHistory,
  userAt,
  close,
};
