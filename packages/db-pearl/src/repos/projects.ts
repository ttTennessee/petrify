import type { Pearl } from "@petrify/pearl";
import type { ProjectsRepo } from "@petrify/db-core";

/**
 * 注:projects 表完整 CRUD 还在 server/routes/projects.ts 里(旧 sqlite db)。
 * 当 server 以 pearl 作为 backend 运行时,projects 实体不会自动出现在 pearl,
 * 所以这里的 existsById 只能查 pearl 自己。冒烟测试需手动 seed 一条
 * type:"project" 实体。完整迁移 projects.ts 后此问题消失。
 */
export function createProjectsRepo(pearl: Pearl): ProjectsRepo {
  return {
    existsById(id) {
      const ent = pearl.get(id);
      return ent !== undefined && ent.type === "project" && !ent.deleted;
    },

    // 以下方法本轮不为 pearl 实现 —— throw-stub 满足类型契约。
    insert: () => {
      throw new Error("db-pearl: ProjectsRepo.insert not implemented");
    },
    list: () => {
      throw new Error("db-pearl: ProjectsRepo.list not implemented");
    },
    getById: () => {
      throw new Error("db-pearl: ProjectsRepo.getById not implemented");
    },
    getGoalAndDescription: () => {
      throw new Error(
        "db-pearl: ProjectsRepo.getGoalAndDescription not implemented",
      );
    },
    getRuntimePolicy: () => {
      throw new Error("db-pearl: ProjectsRepo.getRuntimePolicy not implemented");
    },
  };
}
