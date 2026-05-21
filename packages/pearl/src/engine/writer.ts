// 单写队列:Node.js 单线程下用 Promise 链串行化 commit。
//
// W1:意图内事件原子追加到 events.log,再批量灌入 indexes。
// IntentStarted/Committed 边界事件留给 W2(配合回放回滚)。

import { nanoid } from "nanoid";

import type {
  CommitIntent,
  CommitReceipt,
  Event,
} from "../types.js";
import type { EventLog } from "../store/log.js";
import type { Indexes } from "../store/indexes.js";

export class Writer {
  private tail: Promise<unknown> = Promise.resolve();
  private nextSeq: number;

  constructor(
    private readonly log: EventLog,
    private readonly indexes: Indexes,
    startSeq: number,
  ) {
    this.nextSeq = startSeq + 1;
  }

  commit(intent: CommitIntent): Promise<CommitReceipt> {
    const task = (): Promise<CommitReceipt> => this.runOne(intent);
    const next = this.tail.then(task, task);
    // 即使本次失败也要让队列继续往前走
    this.tail = next.catch(() => undefined);
    return next;
  }

  private async runOne(intent: CommitIntent): Promise<CommitReceipt> {
    if (intent.events.length === 0) {
      throw new Error("commit: events must be non-empty");
    }
    const intentId = nanoid();
    const ts = Date.now();
    const events: Event[] = intent.events.map((e) => ({
      id: nanoid(),
      seq: this.nextSeq++,
      entityId: e.entityId,
      type: e.type,
      payload: e.payload ?? {},
      ts,
      intentId,
    }));

    // 1) 先落盘(append-only 日志)
    this.log.append(events);
    // 2) 再灌内存索引(失败时整库需要重启回放;W2 加 try/rollback)
    for (const ev of events) this.indexes.apply(ev);

    return {
      intentId,
      fromSeq: events[0]!.seq,
      toSeq: events[events.length - 1]!.seq,
      count: events.length,
    };
  }
}
