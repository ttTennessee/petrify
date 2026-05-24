/**
 * 办公室导航图.
 *
 * 主要过道:
 *   y=210  — 充电桩下方
 *   y=380  — 北排工位身后 (北排桌 y=420, 留空 380)
 *   y=510  — 北南排桌之间 (北桌 y∈[420,476], 南桌 y∈[540,596])
 *   y=720  — 南排工位下方 (南排坐姿 y=650, 椅子下方过道)
 *
 * 横向连接节点 x:
 *   90   — 西墙
 *   320  — 充电桩与第一组桌之间
 *   560  — 第二/三组桌之间, 也是沙发左侧
 *   830  — 沙发右侧 (与第四组桌之间)
 *   1090 — 东墙
 *
 * 沙发 (y=240-300, x=710-1070) 是障碍, 中间走道 y=510 / y=720 都绕过它.
 */

export interface NavNode {
  id: string;
  x: number;
  y: number;
}

// 网格节点 — 5 列 x 4 行 = 20 节点
const COLS = [90, 320, 560, 830, 1090];
const ROWS = [
  { id: "n", y: 210 }, // 充电桩区下方
  { id: "u", y: 380 }, // 北排身后 (peek)
  { id: "m", y: 510 }, // 中央过道 (北南排之间)
  { id: "s", y: 720 }, // 南排下方
];

export const NAV_NODES: NavNode[] = [];
for (const row of ROWS) {
  for (let i = 0; i < COLS.length; i++) {
    NAV_NODES.push({ id: `${row.id}${i}`, x: COLS[i]!, y: row.y });
  }
}

const nodeIdByCoord = new Map<string, string>();
for (const n of NAV_NODES) nodeIdByCoord.set(`${n.x},${n.y}`, n.id);

// 邻接表 (无向)
export const NAV_EDGES = new Map<string, string[]>();
for (const n of NAV_NODES) NAV_EDGES.set(n.id, []);

function connect(a: string, b: string) {
  NAV_EDGES.get(a)!.push(b);
  NAV_EDGES.get(b)!.push(a);
}

// 横向连接 (同行)
for (const row of ROWS) {
  for (let i = 0; i < COLS.length - 1; i++) {
    // 跳过 y=210 行中"充电桩之间" — n0(90) 到 n1(320) 横向 OK (西过道→桩右)
    // n2/n3/n4 之间没必要连 (那是工位上方虚空); 不过连了也没害, 因为没机器人在 n 行做事
    // 沙发遮挡: y=210 在沙发上方 (沙发 y=240-300), 所以 y=210 的 n2->n3 (x=560→830) 横向 OK
    // 我们保留所有横向连接 — 沙发实际在 y=240+, 所以 y=210 这条线是穿过沙发上方空气, 不算穿模
    // 但 wandering 视觉上还是更自然走 y=380, 不强制
    connect(`${row.id}${i}`, `${row.id}${i + 1}`);
  }
}

// 纵向连接 (同列)
for (let i = 0; i < COLS.length; i++) {
  // 注意: 沙发在 x=710-1070, y=240-300。x=830 列 (i=3) 在沙发内部, 不能 n3(210)→u3(380) 直接连?
  // 实际 x=830 是"沙发与右侧桌之间", 沙发右沿 1070, 我的 x=830 落在沙发内 (710-1070).
  // 修正: 中央那列应该走 580 或更窄
  connect(`n${i}`, `u${i}`);
  connect(`u${i}`, `m${i}`);
  connect(`m${i}`, `s${i}`);
}

// 沙发 (y=240-300, x=710-1070) 实际上挡住了 i=2 (x=560) 到 i=3 (x=830) 在 y=210 这一行的横向直连吗?
// x=560 到 x=830 在 y=210 是沙发上方 — 视觉上不算穿模 (机器人是顶视).
// 但 i=3 (x=830) 的 n 节点 (y=210) 实际正好在沙发左部 (沙发 x=710-1070 包含 830), 应该禁用 n3.
// 简化处理: 删除 n3 节点 (x=830 在沙发覆盖区)
const NAV_NODES_FILTERED = NAV_NODES.filter((n) => !(n.id === "n3"));
const removed = new Set(["n3"]);
for (const id of removed) NAV_EDGES.delete(id);
for (const [k, v] of NAV_EDGES) {
  NAV_EDGES.set(
    k,
    v.filter((nb) => !removed.has(nb)),
  );
}
NAV_NODES.length = 0;
NAV_NODES.push(...NAV_NODES_FILTERED);

const NODE_BY_ID = new Map(NAV_NODES.map((n) => [n.id, n] as const));

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
