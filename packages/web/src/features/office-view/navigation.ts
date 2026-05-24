/**
 * 办公室导航图.
 *
 * 由 /office-nav-editor 手绘后整理 (坐标对齐成正交).
 *
 * 拓扑:
 *   - 外圈环路 (西墙/北墙/东墙/南墙) 是真走道
 *   - 中央横走道 y=387 (北南排桌之间)
 *   - 北侧走道 y=197 (沙发/充电桩前)
 *   - 南排走道 y=693 (南排桌前)
 *   - 每个工位 / 充电桩 由"入口短刺"接入主走道
 */

export interface NavNode {
  id: string;
  x: number;
  y: number;
}

// 行: 北墙 197, 沙发上沿 175 (充电桩入口), 西中 330, 沙发右侧入口 320,
//     中央走道 387, 北排桌后 430, 南排椅前 650, 南排走道 693
// 列: 125 (西墙), 165/240/315/380 (西侧 4 个充电桩 x), 280/520/760/1000 (4 排工位),
//     405/655/895 (4 排工位之间), 595 (中央桥接), 752/874/1008 (东侧 3 充电桩), 1125 (东墙)

const N = (id: string, x: number, y: number): NavNode => ({ id, x, y });

export const NAV_NODES: NavNode[] = [
  // ===== 外圈四角 =====
  N("NW", 125, 197), // 西北
  N("NE", 1125, 197), // 东北
  N("SW", 125, 693), // 西南
  N("SE", 1125, 693), // 东南

  // ===== 中央走道 y=387 =====
  N("mW", 125, 387), // 西墙中点
  N("mE", 1125, 387), // 东墙中点
  N("m1", 280, 387), // 北桌1后下
  N("ma", 405, 387), // 桌1-桌2 之间
  N("m2", 520, 387), // 北桌2后下
  N("mb", 655, 387), // 桌2-桌3 之间
  N("m3", 760, 387), // 北桌3后下
  N("mc", 895, 387), // 桌3-桌4 之间
  N("m4", 1000, 387), // 北桌4后下

  // ===== 北排桌入口 (中央走道 → 桌后 y=430) =====
  N("d1", 280, 430),
  N("d2", 520, 430),
  N("d3", 760, 430),
  N("d4", 1000, 430),

  // ===== 南排走道 y=693 =====
  N("s1", 280, 693), // 南桌1前
  N("sa", 405, 693), // 桌1-桌2 之间
  N("s2", 520, 693), // 南桌2前
  N("sb", 655, 693), // 桌2-桌3 之间
  N("s3", 760, 693), // 南桌3前
  N("sc", 895, 693), // 桌3-桌4 之间
  N("s4", 1000, 693), // 南桌4前

  // ===== 南排椅入口 (南走道 → 椅前 y=650) =====
  N("c1", 280, 650),
  N("c2", 520, 650),
  N("c3", 760, 650),
  N("c4", 1000, 650),

  // ===== 北墙走道 y=197 (沙发/充电桩区) =====
  // 西侧 4 个充电桩 (x = 165, 240, 315, 380)
  N("p1", 165, 197),
  N("p2", 240, 197),
  N("p3", 315, 197),
  N("p4", 380, 197),
  // 西侧充电桩进站点 (墙边短刺 y=175)
  N("p1in", 165, 175),
  N("p2in", 240, 175),
  N("p3in", 315, 175),
  N("p4in", 380, 175),
  // 沙发左上 / 中央桥接
  N("cm", 595, 197), // 沙发左上前
  // 东侧 3 个充电桩 (x = 752, 874, 1008)
  N("p5", 752, 197),
  N("p6", 874, 197),
  N("p7", 1008, 197),
  // 东侧充电桩进站点 (沙发右下方 y=320)
  N("p5in", 752, 320),
  N("p6in", 874, 320),
  N("p7in", 1008, 320),

  // ===== 西中纵向 (西中走道 → 沙发上方) =====
  N("wm", 125, 330), // 西墙 y=330
  N("xm", 595, 330), // 中央 y=330 (桥接 cm 和 wm)
];

const NODE_BY_ID = new Map(NAV_NODES.map((n) => [n.id, n] as const));

export const NAV_EDGES = new Map<string, string[]>();
for (const n of NAV_NODES) NAV_EDGES.set(n.id, []);

function connect(a: string, b: string) {
  NAV_EDGES.get(a)!.push(b);
  NAV_EDGES.get(b)!.push(a);
}

// ===== 外圈 (4 条墙边走道) =====
// 北墙 NW → p1 → p2 → p3 → p4 → cm → p5 → p6 → p7 → NE
connect("NW", "p1");
connect("p1", "p2");
connect("p2", "p3");
connect("p3", "p4");
connect("p4", "cm");
connect("cm", "p5");
connect("p5", "p6");
connect("p6", "p7");
connect("p7", "NE");
// 东墙 NE → mE → SE
connect("NE", "mE");
connect("mE", "SE");
// 南墙 SE → s4 → sc → s3 → sb → s2 → sa → s1 → SW
connect("SE", "s4");
connect("s4", "sc");
connect("sc", "s3");
connect("s3", "sb");
connect("sb", "s2");
connect("s2", "sa");
connect("sa", "s1");
connect("s1", "SW");
// 西墙 SW → mW → NW
connect("SW", "mW");
connect("mW", "NW");

// ===== 中央走道 y=387 =====
connect("mW", "m1");
connect("m1", "ma");
connect("ma", "m2");
connect("m2", "mb");
connect("mb", "m3");
connect("m3", "mc");
connect("mc", "m4");
connect("m4", "mE");

// ===== 北排桌入口 (中央走道 → 桌后) =====
connect("m1", "d1");
connect("m2", "d2");
connect("m3", "d3");
connect("m4", "d4");

// ===== 南排椅入口 (南走道 → 椅前) =====
connect("s1", "c1");
connect("s2", "c2");
connect("s3", "c3");
connect("s4", "c4");

// ===== 充电桩进站短刺 =====
connect("p1", "p1in");
connect("p2", "p2in");
connect("p3", "p3in");
connect("p4", "p4in");
connect("p5", "p5in");
connect("p6", "p6in");
connect("p7", "p7in");

// ===== 西中纵向 (西墙 wm → 中央 xm → 沙发前 cm) =====
connect("mW", "wm"); // mW(125,387) 到 wm(125,330) — 沿西墙
connect("wm", "xm"); // 西中横向
connect("xm", "cm"); // 中央 y=330 到 沙发前 y=197

/** A* 在 nav 图上找从 startId 到 goalId 的最短路径 (节点 id 列表). */
function aStar(startId: string, goalId: string): string[] {
  if (startId === goalId) return [startId];
  const goal = NODE_BY_ID.get(goalId);
  if (!goal) return [startId];

  const h = (id: string): number => {
    const n = NODE_BY_ID.get(id)!;
    return Math.hypot(n.x - goal.x, n.y - goal.y);
  };

  const open = new Set([startId]);
  const cameFrom = new Map<string, string>();
  const gScore = new Map<string, number>();
  gScore.set(startId, 0);
  const fScore = new Map<string, number>();
  fScore.set(startId, h(startId));

  while (open.size > 0) {
    let current: string | null = null;
    let best = Infinity;
    for (const id of open) {
      const f = fScore.get(id) ?? Infinity;
      if (f < best) {
        best = f;
        current = id;
      }
    }
    if (!current) break;
    if (current === goalId) {
      const path = [current];
      while (cameFrom.has(path[0]!)) path.unshift(cameFrom.get(path[0]!)!);
      return path;
    }
    open.delete(current);
    for (const nb of NAV_EDGES.get(current) ?? []) {
      const cn = NODE_BY_ID.get(current)!;
      const nn = NODE_BY_ID.get(nb)!;
      const tentative = (gScore.get(current) ?? Infinity) + Math.hypot(cn.x - nn.x, cn.y - nn.y);
      if (tentative < (gScore.get(nb) ?? Infinity)) {
        cameFrom.set(nb, current);
        gScore.set(nb, tentative);
        fScore.set(nb, tentative + h(nb));
        open.add(nb);
      }
    }
  }
  return [startId]; // 找不到
}

/** 找离一个任意点 (x,y) 最近的 nav 节点 */
function nearestNode(x: number, y: number): NavNode {
  let best = NAV_NODES[0]!;
  let bestD = Infinity;
  for (const n of NAV_NODES) {
    const d = Math.hypot(n.x - x, n.y - y);
    if (d < bestD) {
      bestD = d;
      best = n;
    }
  }
  return best;
}

export interface PathPoint {
  x: number;
  y: number;
}

/**
 * 规划从 (fromX, fromY) 到 (toX, toY) 的路径.
 * 返回点序列, 不含起点 (机器人从当前位置出发), 含终点.
 * 如果起点或终点离 nav 图很近 (< 60px), 跳过对应过道点直接走.
 */
export function planPath(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): PathPoint[] {
  // 如果起终点距离很短 (< 80px), 直接直线
  const direct = Math.hypot(toX - fromX, toY - fromY);
  if (direct < 80) return [{ x: toX, y: toY }];

  const startNode = nearestNode(fromX, fromY);
  const goalNode = nearestNode(toX, toY);

  // 起终点已经离对应节点很近 — 可以省掉入图/出图
  const startClose = Math.hypot(startNode.x - fromX, startNode.y - fromY) < 40;
  const goalClose = Math.hypot(goalNode.x - toX, goalNode.y - toY) < 40;

  const pathIds = aStar(startNode.id, goalNode.id);
  const points: PathPoint[] = [];
  if (!startClose) points.push({ x: startNode.x, y: startNode.y });
  for (let i = 1; i < pathIds.length - 1; i++) {
    const n = NODE_BY_ID.get(pathIds[i]!)!;
    points.push({ x: n.x, y: n.y });
  }
  if (!goalClose) points.push({ x: goalNode.x, y: goalNode.y });
  points.push({ x: toX, y: toY });
  return points;
}
