import { useEffect, useRef, useState } from "react";
import type { Facing } from "./Robot";

const SPEED_PX_PER_SEC = 280;
const ARRIVE_EPSILON = 0.5;

export interface PathPoint {
  x: number;
  y: number;
}

/** 单点目标 (向后兼容; 内部会包装成 path = [{x,y}]) */
export interface MovementTarget {
  x: number;
  y: number;
  facing: Facing;
}

/** 多段路径目标: 沿 path 一段段走, 到达最后一点后采用 finalFacing */
export interface PathTarget {
  path: PathPoint[];
  finalFacing: Facing;
}

export type AnyTarget = MovementTarget | PathTarget;

function isPathTarget(t: AnyTarget): t is PathTarget {
  return Array.isArray((t as PathTarget).path);
}

export interface RobotPose {
  x: number;
  y: number;
  facing: Facing;
  isMoving: boolean;
}

interface InternalState {
  pose: RobotPose;
  /** 当前正在走向哪一段 (path index) */
  segIdx: number;
  /** 当前对应的 path 引用 — 路径替换时重置 segIdx */
  path: PathPoint[];
  finalFacing: Facing;
}

function targetToPath(t: AnyTarget): { path: PathPoint[]; finalFacing: Facing } {
  if (isPathTarget(t)) return { path: t.path, finalFacing: t.finalFacing };
  return { path: [{ x: t.x, y: t.y }], finalFacing: t.facing };
}

/**
 * 多机器人版本: 给定一组按 id 索引的目标(可以是单点或多段路径),返回各 id 的当前 pose。
 * 内部用单个 RAF 循环驱动所有机器人,适合按当前 y 做 z-order 排序的场景。
 *
 * 路径策略: L 形, 先走 x 再走 y, 固定速度 ~280 px/s。
 * 路径变化时,从当前位置继续沿新路径的第一段走,不瞬移。
 */
export function useRobotMovements(
  targets: Record<string, AnyTarget>,
): Record<string, RobotPose> {
  const targetsRef = useRef(targets);
  targetsRef.current = targets;

  const [poses, setPoses] = useState<Record<string, RobotPose>>(() => {
    const init: Record<string, RobotPose> = {};
    for (const [id, t] of Object.entries(targets)) {
      const { path, finalFacing } = targetToPath(t);
      const last = path[path.length - 1] ?? { x: 0, y: 0 };
      init[id] = { x: last.x, y: last.y, facing: finalFacing, isMoving: false };
    }
    return init;
  });

  // 跨 render 的内部状态: 每个机器人当前在 path 第几段
  const stateRef = useRef<Record<string, InternalState>>({});
  // 同步初始化
  for (const [id, t] of Object.entries(targets)) {
    if (!stateRef.current[id]) {
      const { path, finalFacing } = targetToPath(t);
      const last = path[path.length - 1] ?? { x: 0, y: 0 };
      stateRef.current[id] = {
        pose: { x: last.x, y: last.y, facing: finalFacing, isMoving: false },
        segIdx: path.length - 1,
        path,
        finalFacing,
      };
    } else {
      // 路径换了 (referential equality), 重置 segIdx 到第一段
      const st = stateRef.current[id]!;
      const { path, finalFacing } = targetToPath(t);
      if (st.path !== path) {
        st.path = path;
        st.segIdx = 0;
        st.finalFacing = finalFacing;
      }
    }
  }
  // 删除已不在 targets 里的
  for (const id of Object.keys(stateRef.current)) {
    if (!(id in targets)) delete stateRef.current[id];
  }

  const posesRef = useRef(poses);
  posesRef.current = poses;

  useEffect(() => {
    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      const step = SPEED_PX_PER_SEC * dt;

      const cur = posesRef.current;
      let changed = false;
      const next: Record<string, RobotPose> = { ...cur };
      const states = stateRef.current;

      for (const [id, st] of Object.entries(states)) {
        const p = cur[id] ?? st.pose;
        const segIdx = st.segIdx;
        const path = st.path;
        if (path.length === 0) continue;

        // 当前要走向的目标点 (path 的下一站)
        const t = path[Math.min(segIdx, path.length - 1)]!;
        const isLast = segIdx >= path.length - 1;

        const dx = t.x - p.x;
        const dy = t.y - p.y;
        const adx = Math.abs(dx);
        const ady = Math.abs(dy);

        // 到达当前段目标
        if (adx < ARRIVE_EPSILON && ady < ARRIVE_EPSILON) {
          if (!isLast) {
            // 推进到下一段
            st.segIdx++;
            continue;
          }
          // 已到终点
          if (p.isMoving || p.facing !== st.finalFacing) {
            next[id] = { x: t.x, y: t.y, facing: st.finalFacing, isMoving: false };
            st.pose = next[id]!;
            changed = true;
          }
          continue;
        }

        // L 形: 先 x 后 y
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
        st.pose = next[id]!;
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
