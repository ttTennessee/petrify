// Pearl 客户端门面:commit / get / match / traverse / history / at。

import { join } from "node:path";

import type {
  CommitIntent,
  CommitReceipt,
  Entity,
  Event,
  HistoryOptions,
  MatchWhere,
  TraverseOptions,
} from "../types.js";
import { EventLog, type LogOptions } from "../store/log.js";
import { Indexes } from "../store/indexes.js";
import { Writer } from "../engine/writer.js";

export type PearlOptions = {
  /** 数据目录,events.log/meta.json/snapshot.bin 都放这里。 */
  dir: string;
  /** 每次 commit 是否 fsync(默认 true;测试可关闭)。 */
  fsync?: boolean;
};

export class Pearl {
  private constructor(
    private readonly log: EventLog,
    private readonly indexes: Indexes,
    private readonly writer: Writer,
  ) {}

  static open(opts: PearlOptions): Pearl {
    const logOpts: LogOptions = { fsync: opts.fsync ?? true };
    const log = new EventLog(join(opts.dir, "events.log"), logOpts);
    log.open();

    const indexes = new Indexes();
    // 回放:基于 IntentCommitted 边界回滚未完成的意图。
    let maxSeq = 0;
    let buffer: Event[] = [];
    for (const ev of log.readAll()) {
      if (ev.seq > maxSeq) maxSeq = ev.seq;
      buffer.push(ev);
      if (ev.type === "IntentCommitted") {
        for (const b of buffer) indexes.apply(b);
        buffer = [];
      }
    }
    // EOF 时残留的 buffer = 未完成意图,丢弃但 seq 已"烧掉"(下次从 maxSeq+1 继续)

    const writer = new Writer(log, indexes, maxSeq);
    return new Pearl(log, indexes, writer);
  }

  close(): void {
    this.log.close();
  }

  commit(intent: CommitIntent): Promise<CommitReceipt> {
    return this.writer.commit(intent);
  }

  get(id: string): Entity | undefined {
    return this.indexes.get(id);
  }

  match(type: string, where?: MatchWhere): Entity[] {
    return this.indexes.match(type, where);
  }

  traverse(fromId: string, opts: TraverseOptions = {}): Entity[] {
    return this.indexes.traverse(fromId, opts);
  }

  history(entityId: string, opts: HistoryOptions = {}): Event[] {
    return this.indexes.history(entityId, opts);
  }

  at(entityId: string, asOfSeq: number): Entity | undefined {
    return this.indexes.at(entityId, asOfSeq);
  }

  /** 内部:当前 seq 上限。 */
  _lastSeq(): number {
    return this.indexes.lastSeq;
  }

  /** 内部:供调试。 */
  _eventsFor(entityId: string) {
    return this.indexes.eventsFor(entityId);
  }

  /** 内部:暴露 shape registry 给调试/测试。 */
  _shapeOf(entityType: string) {
    return this.indexes.shapes.shapeOf(entityType);
  }
}
