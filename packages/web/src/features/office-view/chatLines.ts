import type { NodeStatus } from "@petrify/shared";

export type Lang = "en" | "zh-CN";

/** 一条台词: 纯文本, 或 "划掉前缀 + 真实文本" 二段结构 */
export type Line = string | { strike: string; text: string };

/** 一问一答对 (chatting 专用) */
export interface QA {
  q: Line;
  a: Line;
}

type Behavior =
  | "watching"
  | "peeking"
  | "slacking"
  | "charging"
  | "wandering"
  | "chatting";

// ============ 按状态/行为分组的独白台词 (非 chatting) ============

const STATUS_LINES: Record<Lang, Record<string, Line[]>> = {
  en: {
    running: [
      "// TODO: fix later",
      "looks good",
      "almost there",
      "compiling...",
      "one more test",
      "ship it 🚀",
    ],
    blocked: ["any update?", "ETA?", "still waiting", "..."],
    completed: ["Hahaha", "LOL", "no way 😂", "nice meme", "coffee?"],
    failed: ["WTF", "rollback?", "ugh"],
    compensating: ["undoing...", "rollback in progress", "saga time"],
    idle: ["Zzz", "charging", "ready"],
    pending: ["ready", "🪫 charging"],
    skipped: ["skipped"],
  },
  "zh-CN": {
    running: [
      "// TODO:之后再修",
      "看起来不错",
      "快好了",
      "编译中...",
      "再跑个测试",
      "提交收工 🚀",
    ],
    blocked: ["还没好吗?", "啥时候好?", "继续等", "..."],
    completed: ["哈哈哈", "笑死", "不会吧 😂", "段子不错", "咖啡?"],
    failed: ["卧槽", "回滚?", "完蛋"],
    compensating: ["撤销中...", "正在回滚", "saga 时间"],
    idle: ["Zzz", "充电中", "准备好了"],
    pending: ["准备好了", "🪫 充电中"],
    skipped: ["跳过"],
  },
};

const SLACKING_LINES: Record<Lang, Line[]> = {
  en: [
    { strike: "pornhub", text: "github" },
    { strike: "twitter", text: "stackoverflow" },
    { strike: "reddit", text: "documentation" },
    { strike: "youtube", text: "tech talks" },
    { strike: "tiktok", text: "code review" },
    { strike: "napping", text: "deep thinking" },
    { strike: "slacking", text: "ideating" },
    { strike: "shopping", text: "spec research" },
    { strike: "gossiping", text: "team alignment" },
    { strike: "memes", text: "industry insights" },
    "looks busy 😎",
    "// pretend to work",
    "AFK 5min",
    "🎧 deep focus",
    "/* don't ask */",
    "in the zone",
  ],
  "zh-CN": [
    { strike: "pornhub", text: "github" },
    { strike: "微博", text: "技术博客" },
    { strike: "红果", text: "文档" },
    { strike: "B站", text: "技术分享" },
    { strike: "抖音", text: "代码评审" },
    { strike: "睡觉", text: "深度思考" },
    { strike: "摸鱼", text: "构思方案" },
    { strike: "购物", text: "调研需求" },
    { strike: "八卦", text: "团队对齐" },
    { strike: "表情包", text: "行业洞察" },
    "看起来很忙 😎",
    "// 假装在干活",
    "假装在编译",
    "离开 5 分钟",
    "🎧 深度专注",
    "/* 别问 */",
    "状态来了",
  ],
};

const PEEKING_LINES: Record<Lang, Line[]> = {
  en: [
    "wait, that's it?",
    "this logic seems off",
    "// why",
    "🤔",
    "PR me 🙏",
    "good enough",
    "optimize this?",
    "is that O(n²)?",
    "any tests for this?",
    "naming is hard",
    "👀",
    "ship it anyway",
    "needs more comments",
    "looks fine to me",
    "wait, where's the lock?",
    "lgtm 👍",
  ],
  "zh-CN": [
    "就这?",
    "这逻辑有问题吧",
    "// 为啥",
    "🤔",
    "PR 我一下 🙏",
    "差不多就行了",
    "再优化下?",
    "这是 O(n²) 吧",
    "测试呢?",
    "命名好难",
    "👀",
    "管它呢, 发了",
    "注释加一下",
    "我看挺好",
    "等下, 锁呢?",
    "lgtm 👍",
  ],
};

const WANDERING_LINES: Record<Lang, Line[]> = {
  en: [
    "stretching legs",
    "🚶 walk break",
    "grab some water",
    "need inspiration",
    "smoking break",
    "where's the restroom",
    "let's circle the office",
    "thinking...",
    "10k steps today 💪",
    "back in a sec",
    "...",
  ],
  "zh-CN": [
    "伸个懒腰",
    "🚶 出去走走",
    "去倒杯水",
    "找点灵感",
    "抽根烟",
    "厕所在哪",
    "绕一圈思考下",
    "想想...",
    "今天一万步 💪",
    "马上回来",
    "...",
  ],
};

// ============ chatting 的一问一答对 ============

const CHATTING_PAIRS: Record<Lang, QA[]> = {
  en: [
    { q: "weekend overtime?", a: "again? ugh" },
    { q: "PM changed the spec again", a: "of course they did" },
    { q: "deadline is tomorrow", a: "we're cooked" },
    { q: "what's for lunch?", a: "anything but salad" },
    { q: "this sprint is brutal", a: "tell me about it" },
    { q: "any weekend plans?", a: "sleep. just sleep." },
    { q: "did u see the standup?", a: "I was muted 😅" },
    { q: "🍕?", a: "always 🍕" },
    { q: "new requirements just dropped", a: "are you serious" },
    { q: "coffee run?", a: "lifesaver, let's go" },
    { q: "is the build green?", a: "for now... 🤞" },
    { q: "did the tests pass?", a: "flaky as usual" },
  ],
  "zh-CN": [
    { q: "周末加班吗?", a: "又加? 心累" },
    { q: "PM 又改需求了", a: "意料之中" },
    { q: "deadline 是明天", a: "完了完了" },
    { q: "中午吃啥?", a: "随便, 别吃沙拉" },
    { q: "这个 sprint 太狠了", a: "可不是嘛" },
    { q: "周末有啥安排?", a: "睡觉, 只想睡觉" },
    { q: "你看 standup 了吗?", a: "我静音了 😅" },
    { q: "🍕?", a: "永远 🍕" },
    { q: "新需求又来了", a: "你认真的吗" },
    { q: "去倒咖啡吗?", a: "救命稻草, 走" },
    { q: "构建过了吗?", a: "暂时绿了 🤞" },
    { q: "测试过了吗?", a: "老样子 flaky" },
  ],
};

function normalizeLang(lang: string | undefined): Lang {
  if (lang && lang.toLowerCase().startsWith("zh")) return "zh-CN";
  return "en";
}

/**
 * chatting: 同一对话 (pairKey + exchangeIdx) 上, 发起者说 q, 被聊者说 a.
 *
 * 用 isInitiator 决定身份, 而不是字典序 — 这样当 A 从聊 B 切到聊 C 时, 不会因为 A
 * 在 A<B 时是 q-说话者, 而在 A>C 时变成 a-说话者, 导致对 C 一开口就是答句.
 *
 * 调用方 (ChatBubble) 已经过滤过 "听" 的拍, 走到这里的只有正在说话的一方:
 * initiator 永远偶拍说话, partner 永远奇拍说话.
 */
export function pickChatLine(
  lang: string | undefined,
  selfId: string,
  partnerId: string,
  beatIdx: number,
  isInitiator: boolean,
): Line {
  const L = normalizeLang(lang);
  const pool = CHATTING_PAIRS[L];
  const pairKey = [selfId, partnerId].sort().join("|");
  // 用 pairKey + beatIdx/2 (一对 q/a 共享同一索引) 选 QA 对
  let h = 0;
  for (let i = 0; i < pairKey.length; i++)
    h = ((h << 5) - h + pairKey.charCodeAt(i)) | 0;
  const exchangeIdx = Math.floor(beatIdx / 2);
  const qa = pool[(Math.abs(h) + exchangeIdx) % pool.length]!;
  return isInitiator ? qa.q : qa.a;
}

/** 非 chatting 的台词选择 */
export function pickLine(
  lang: string | undefined,
  status: NodeStatus,
  behavior: Behavior | undefined,
  idx: number,
): Line {
  const L = normalizeLang(lang);
  if (behavior === "slacking") {
    const pool = SLACKING_LINES[L];
    return pool[idx % pool.length]!;
  }
  if (behavior === "peeking") {
    const pool = PEEKING_LINES[L];
    return pool[idx % pool.length]!;
  }
  if (behavior === "wandering") {
    const pool = WANDERING_LINES[L];
    return pool[idx % pool.length]!;
  }
  if (behavior === "watching") {
    const pool = STATUS_LINES[L].completed!;
    return pool[idx % pool.length]!;
  }
  if (behavior === "charging") {
    const pool = STATUS_LINES[L].idle!;
    return pool[idx % pool.length]!;
  }
  const pool = STATUS_LINES[L][status] ?? STATUS_LINES[L].idle!;
  return pool[idx % pool.length]!;
}
