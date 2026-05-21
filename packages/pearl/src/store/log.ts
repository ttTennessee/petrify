// Append-only NDJSON 事件日志
//
// W1 用同步 IO + 单写队列保证顺序;fsync 默认开启(每次 commit 落盘),
// 测试可关闭。后期(W5)替换为 MessagePack + 批写。

import { closeSync, existsSync, mkdirSync, openSync, readFileSync, writeSync, fsyncSync } from "node:fs";
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
    // 'a' = append,文件不存在则创建
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

  /** 同步全量读取(W1 简单实现;后期改为流式 + snapshot)。 */
  readAll(): Event[] {
    if (!existsSync(this.path)) return [];
    const text = readFileSync(this.path, "utf8");
    if (text.length === 0) return [];
    const out: Event[] = [];
    for (const line of text.split("\n")) {
      if (line.length === 0) continue;
      out.push(JSON.parse(line) as Event);
    }
    return out;
  }
}
