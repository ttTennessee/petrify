// global_config 实体在 pearl 里:
//   entity type = "global_config"
//   entity id   = config key(natural key)
//   attrs       = { value_json, updated_at }
//
// upsert 语义:不存在则 Created,存在则 AttrSet。

import type { Pearl } from "@petrify/pearl";
import type { GlobalConfigRepo, GlobalConfigRow } from "@petrify/db-core";

const TYPE = "global_config";

export function createGlobalConfigRepo(pearl: Pearl): GlobalConfigRepo {
  return {
    list() {
      return pearl.match(TYPE).map((e) => entityToRow(e.id, e));
    },

    upsert(key, valueJson, updatedAt) {
      const ent = pearl.get(key);
      const exists = ent && ent.type === TYPE && !ent.deleted;
      if (exists) {
        pearl.commit({
          events: [
            {
              entityId: key,
              type: "AttrSet",
              payload: { value_json: valueJson, updated_at: updatedAt },
            },
          ],
        });
      } else {
        pearl.commit({
          events: [
            {
              entityId: key,
              type: "Created",
              payload: {
                entityType: TYPE,
                attrs: { value_json: valueJson, updated_at: updatedAt },
              },
            },
          ],
        });
      }
    },

    deleteByKey(key) {
      const ent = pearl.get(key);
      if (!ent || ent.type !== TYPE || ent.deleted) return;
      pearl.commit({
        events: [{ entityId: key, type: "Deleted", payload: {} }],
      });
    },
  };
}

function entityToRow(id: string, ent: { attrs: Record<string, unknown> }): GlobalConfigRow {
  return {
    key: id,
    value_json: String(ent.attrs["value_json"] ?? ""),
    updated_at: Number(ent.attrs["updated_at"] ?? 0),
  };
}
