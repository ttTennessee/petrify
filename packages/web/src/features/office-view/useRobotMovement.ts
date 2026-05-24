import { useEffect, useRef, useState } from "react";
import type { Facing } from "./Robot";

const SPEED_PX_PER_SEC = 280;
const ARRIVE_EPSILON = 0.5;

export interface MovementTarget {
  x: number;
  y: number;
  facing: Facing;
}

export interface RobotPose extends MovementTarget {
  isMoving: boolean;
}

/**
 * 多机器人版本: 给定一组按 id 索引的目标位置,返回各 id 的当前 pose。
 * 内部用单个 RAF 循环驱动所有机器人,适合按当前 y 做 z-order 排序的场景。
 *
 * 路径策略: L 形, 先走 x 再走 y, 固定速度 ~280 px/s。
 * 目标变化时,从当前位置(可能在路上) 接着重新规划,不瞬移。
 */
export function useRobotMovements(
  targets: Record<string, MovementTarget>,
): Record<string, RobotPose> {
  const targetsRef = useRef(targets);
  targetsRef.current = targets;

  const [poses, setPoses] = useState<Record<string, RobotPose>>(() => {
    const init: Record<string, RobotPose> = {};
    for (const [id, t] of Object.entries(targets)) {
      init[id] = { x: t.x, y: t.y, facing: t.facing, isMoving: false };
    }
    return init;
  });

  const posesRef = useRef(poses);
  posesRef.current = poses;

  // 新出现的 id 需要先在 state 里补 pose, 初始放在目标点(不动)
  useEffect(() => {
    const cur = posesRef.current;
    let added: Record<string, RobotPose> | null = null;
    for (const [id, t] of Object.entries(targets)) {
      if (!cur[id]) {
        if (!added) added = {};
        added[id] = { x: t.x, y: t.y, facing: t.facing, isMoving: false };
      }
    }
    if (added) setPoses((p) => ({ ...p, ...added! }));
  }, [targets]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      const step = SPEED_PX_PER_SEC * dt;

      const cur = posesRef.current;
      const tgts = targetsRef.current;
      let changed = false;
      const next: Record<string, RobotPose> = { ...cur };

      for (const [id, p] of Object.entries(cur)) {
        const t = tgts[id];
        if (!t) continue;

        const dx = t.x - p.x;
        const dy = t.y - p.y;
        const adx = Math.abs(dx);
        const ady = Math.abs(dy);

        if (adx < ARRIVE_EPSILON && ady < ARRIVE_EPSILON) {
          if (p.isMoving || p.facing !== t.facing) {
            next[id] = { x: t.x, y: t.y, facing: t.facing, isMoving: false };
            changed = true;
          }
          continue;
        }

        let nx = p.x;
        let ny = p.y;
        let facing: Facing = p.facing;

        if (adx >= ARRIVE_EPSILON) {
          const m = Math.min(step, adx);
          nx = p.x + Math.sign(dx) * m;
          facing = dx > 0 ? "east" : "west";
        } else {
          const m = Math.min(step, ady);
          ny = p.y + Math.sign(dy) * m;
          facing = dy > 0 ? "south" : "north";
        }

        next[id] = { x: nx, y: ny, facing, isMoving: true };
        changed = true;
      }

      if (changed) setPoses(next);
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return poses;
}
