// Append-only NDJSON 事件日志。
//
// W1 用同步 IO + 单写队列保证顺序;fsync 默认开启(每次 commit 落盘),
// 测试可关闭。后期(W5)替换为 MessagePack + 批写。

import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeSync,
} from "node:fs";
import { dirname } from "node:path";

import type { Event } from "../types.js";

export type LogOptions = {
  fsync?: boolean;
};

export class EventLog {
  private fd: number | null = null;

  constructor(
    private readonly path: string,
    private readonly opts: LogOptions = {},
  ) {}

  open(): void {
    if (this.fd !== null) return;
    mkdirSync(dirname(this.path), { recursive: true });
    this.fd = openSync(this.path, "a");
  }

  close(): void {
    if (this.fd === null) return;
    closeSync(this.fd);
    this.fd = null;
  }

  /** 追加一批 events,整体写入一次 buffer 后(可选) fsync。 */
  append(events: readonly Event[]): void {
    if (this.fd === null) throw new Error("EventLog not opened");
    if (events.length === 0) return;
    const buf = Buffer.from(
      events.map((e) => JSON.stringify(e)).join("\n") + "\n",
      "utf8",
    );
    writeSync(this.fd, buf, 0, buf.length);
    if (this.opts.fsync !== false) fsyncSync(this.fd);
  }

  /**
   * 同步全量读取。容忍最后一行 JSON 解析失败(进程崩溃导致的尾部截断),
   * 其它行解析失败则抛出(数据明确损坏)。
   */
  readAll(): Event[] {
    if (!existsSync(this.path)) return [];
    const text = readFileSync(this.path, "utf8");
    if (text.length === 0) return [];
    const lines = text.split("\n");
    // split 末尾会产生一个空字符串(因为日志以 \n 结尾)
    const out: Event[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (line.length === 0) continue;
      try {
        out.push(JSON.parse(line) as Event);
      } catch (err) {
        const isLast = i === lines.length - 1 || allRemainingEmpty(lines, i + 1);
        if (isLast) break; // 末尾撕裂,丢弃
        throw new Error(`EventLog: malformed line ${i + 1}: ${(err as Error).message}`);
      }
    }
    return out;
  }
}

function allRemainingEmpty(lines: string[], from: number): boolean {
  for (let i = from; i < lines.length; i++) {
    if (lines[i]!.length > 0) return false;
  }
  return true;
}
