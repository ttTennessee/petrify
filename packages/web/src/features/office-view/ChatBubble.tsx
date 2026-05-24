import { useEffect, useState } from "react";
import type { NodeStatus } from "@petrify/shared";

type Behavior =
  | "watching"
  | "peeking"
  | "slacking"
  | "charging"
  | "wandering"
  | "chatting";

/** 一条台词: 可以是纯文本, 或 "划掉前缀 + 真实文本" 的二段结构 */
type Line = string | { strike: string; text: string };

const LINES: Record<string, Line[]> = {
  running: [
    "// TODO: fix later",
    "looks good",
    "almost there",
    "compiling...",
    "one more test",
    "ship it 🚀",
  ],
  blocked: [
    "还没好吗?",
    "any update?",
    "ETA?",
    "...",
  ],
  completed: [
    "Hahaha",
    "LOL",
    "no way 😂",
    "刷会儿剧",
    "nice meme",
    "coffee?",
  ],
  failed: [
    "WTF",
    "rollback?",
    "ugh",
  ],
  compensating: [
    "undoing...",
    "rollback in progress",
    "saga time",
  ],
  idle: [
    "Zzz",
    "充电中",
    "ready",
  ],
  pending: [
    "ready",
    "🪫 charging",
  ],
  skipped: [
    "skipped",
  ],
};

/** 摸鱼台词: 坐在工位上但其实没在 running 的状态用这一组 */
const SLACKING_LINES: Line[] = [
  { strike: "pornhub", text: "github" },
  { strike: "twitter", text: "stackoverflow" },
  { strike: "reddit", text: "documentation" },
  { strike: "youtube", text: "tech talks" },
  { strike: "tiktok", text: "code review" },
  { strike: "睡觉", text: "深度思考" },
  { strike: "摸鱼", text: "ideating" },
  "looks busy 😎",
  "// pretend to work",
  "假装在编译",
  "AFK 5min",
];

/** 看屏幕 (peeking): 站在前置同事身后偷看的台词 */
const PEEKING_LINES: Line[] = [
  "wait, that's it?",
  "这逻辑有问题吧",
  "// why",
  "🤔",
  "PR me 🙏",
  "差不多就行了",
  "再优化下?",
];

/** 聊天 (chatting): 寒暄/吐槽/产品经理梗 */
const CHATTING_LINES: Line[] = [
  "周末加班?",
  "PM 又改需求了",
  "deadline 是明天",
  "下班吃啥",
  "this sprint is brutal",
  "any plans?",
  "did u see the standup",
  "🍕?",
  "新需求来了",
];

/** wandering: 在过道随便走 */
const WANDERING_LINES: Line[] = [
  "stretching legs",
  "🚶 walk break",
  "去倒杯水",
  "找点灵感",
  "...",
];

function pickLine(status: NodeStatus, behavior: Behavior | undefined, idx: number): Line {
  if (behavior === "slacking") return SLACKING_LINES[idx % SLACKING_LINES.length]!;
  if (behavior === "peeking") return PEEKING_LINES[idx % PEEKING_LINES.length]!;
  if (behavior === "chatting") return CHATTING_LINES[idx % CHATTING_LINES.length]!;
  if (behavior === "wandering") return WANDERING_LINES[idx % WANDERING_LINES.length]!;
  if (behavior === "watching") {
    const pool = LINES.completed!;
    return pool[idx % pool.length]!;
  }
  if (behavior === "charging") {
    const pool = LINES.idle!;
    return pool[idx % pool.length]!;
  }
  // 没有 behavior (working/resting) → 按 status
  const pool = LINES[status] ?? LINES.idle!;
  return pool[idx % pool.length]!;
}

// 简单的字符串哈希, 给每个机器人独立的初始相位 / 间隔
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export interface ChatBubbleProps {
  id: string;
  /** 机器人接地点 x */
  x: number;
  /** 机器人接地点 y */
  y: number;
  /** 机器人显示高度 */
  size: number;
  status: NodeStatus;
  /** 当前行为 — 用来选台词库; 没传就按 status 走 */
  behavior?: Behavior;
  /** 聊天对象 id (chatting 时传); 用来对话错峰 + 在锚点侧选边 */
  partnerId?: string;
  /** 移动中或不需要时隐藏 */
  visible: boolean;
}

const CHAT_BEAT_MS = 2400; // chatting 一问一答的拍长

/**
 * 头侧聊天气泡: 周期性切换一条预设台词, 在机器人头部右上方显示.
 * - 普通行为: 自己独立 4-8s 周期, 显隐交替
 * - chatting: 接 partnerId, 用两人 id 共同种子驱动节拍, 自己在偶拍/奇拍发言, 形成一问一答
 */
export function ChatBubble({ id, x, y, size, status, behavior, partnerId, visible }: ChatBubbleProps) {
  const seed = hash(id);
  const intervalMs = 4000 + (seed % 4000);
  const initialDelayMs = seed % 3000;

  const [lineIdx, setLineIdx] = useState(0);
  const [shown, setShown] = useState(false);
  // chatting 模式靠 wall clock tick 决定显隐; 用 setTick 触发重渲染
  const [, setTick] = useState(0);
  const isChat = behavior === "chatting" && !!partnerId;

  useEffect(() => {
    if (!visible) {
      setShown(false);
      return;
    }
    if (isChat) {
      // chat 模式: 每个 CHAT_BEAT_MS 重算; lineIdx 也随之推进
      const cycle = window.setInterval(() => {
        setTick((t) => t + 1);
        setLineIdx((i) => i + 1);
      }, CHAT_BEAT_MS);
      return () => window.clearInterval(cycle);
    }
    let cancelled = false;
    const startTimer = window.setTimeout(() => {
      if (cancelled) return;
      setShown(true);
    }, initialDelayMs);

    const cycle = window.setInterval(() => {
      setShown((s) => !s);
      setLineIdx((i) => i + 1);
    }, intervalMs);

    return () => {
      cancelled = true;
      window.clearTimeout(startTimer);
      window.clearInterval(cycle);
    };
  }, [visible, intervalMs, initialDelayMs, isChat]);

  if (!visible) return null;

  // chatting: 同一对 (id, partnerId) 共用节拍, 自己在偶数拍说话, 对方在奇数拍, 形成轮流
  let chatShown = shown;
  if (isChat && partnerId) {
    const pairSeed = hash([id, partnerId].sort().join("|"));
    const beat = Math.floor((performance.now() + pairSeed) / CHAT_BEAT_MS);
    // 字典序在前的那个先说 (偶拍说话, 奇拍听)
    const sortedFirst = id < partnerId;
    chatShown = sortedFirst ? beat % 2 === 0 : beat % 2 === 1;
  }
  if (!chatShown) return null;

  const line = pickLine(status, behavior, lineIdx);
  const isStruck = typeof line !== "string";
  const strikeText = isStruck ? (line as { strike: string }).strike : "";
  const mainText = isStruck ? (line as { text: string }).text : (line as string);

  // 按 id 哈希给气泡 y/x 偏移, 避免多个机器人靠近时气泡规则地重叠
  const yJitterChoices = [-28, -18, -8, 4, 16];
  const xJitterChoices = [-18, -6, 6, 18];
  const yJitter = yJitterChoices[seed % yJitterChoices.length]!;
  const xJitter = xJitterChoices[(seed >> 3) % xJitterChoices.length]!;
  const headY = y - size * 0.85 + yJitter;
  const bubbleX = x - size * 0.55 + xJitter;
  const bubbleY = headY - 6;

  // 估算文本宽度: ASCII ~6.4 px/char, CJK / 全角 / emoji ~11.5 px/char @ font-size=11
  const isWide = (code: number): boolean => {
    if (code >= 0x2e80) return true; // CJK + 各类符号 + emoji 区
    if (code >= 0x3000 && code <= 0x303f) return true; // 全角标点
    if (code >= 0xff00 && code <= 0xffef) return true; // 全角拉丁
    return false;
  };
  const measure = (s: string): number => {
    let w = 0;
    for (const ch of s) {
      const code = ch.codePointAt(0) ?? 0;
      w += isWide(code) ? 11.5 : 6.4;
    }
    return w;
  };

  const pad = 6;
  const fontSize = 11;
  const gap = 4; // strike 和正文之间的空格宽度
  const strikeWidth = measure(strikeText);
  const mainWidth = measure(mainText);
  const innerWidth = isStruck
    ? Math.max(strikeWidth + gap + mainWidth, 18)
    : Math.max(mainWidth, 18);
  const w = innerWidth + pad * 2;
  const h = fontSize + pad * 2;

  return (
    <g pointerEvents="none">
      {/* 尾巴指向机器人头部 */}
      <path
        d={`M ${bubbleX + w * 0.7} ${bubbleY + h} L ${x - size * 0.18} ${headY + 4} L ${bubbleX + w * 0.55} ${bubbleY + h - 2} Z`}
        fill="#fff"
        stroke="#241c14"
        strokeWidth={1}
      />
      <rect
        x={bubbleX}
        y={bubbleY}
        width={w}
        height={h}
        rx={6}
        ry={6}
        fill="#fff"
        stroke="#241c14"
        strokeWidth={1.2}
      />
      {isStruck ? (
        (() => {
          const textY = bubbleY + h / 2 + fontSize * 0.36;
          const strikeX = bubbleX + pad;
          const mainX = strikeX + strikeWidth + gap;
          // 划线 y 大概在文字中线
          const strikeLineY = bubbleY + h / 2 + 0.5;
          return (
            <>
              <text
                x={strikeX}
                y={textY}
                textAnchor="start"
                fontFamily="ui-monospace, monospace"
                fontSize={fontSize}
                fill="#8a7a66"
              >
                {strikeText}
              </text>
              <line
                x1={strikeX - 1}
                y1={strikeLineY}
                x2={strikeX + strikeWidth + 1}
                y2={strikeLineY}
                stroke="#c25450"
                strokeWidth={1.4}
                strokeLinecap="round"
              />
              <text
                x={mainX}
                y={textY}
                textAnchor="start"
                fontFamily="ui-monospace, monospace"
                fontSize={fontSize}
                fontWeight={600}
                fill="#241c14"
              >
                {mainText}
              </text>
            </>
          );
        })()
      ) : (
        <text
          x={bubbleX + w / 2}
          y={bubbleY + h / 2 + fontSize * 0.36}
          textAnchor="middle"
          fontFamily="ui-monospace, monospace"
          fontSize={fontSize}
          fill="#241c14"
        >
          {mainText}
        </text>
      )}
    </g>
  );
}
