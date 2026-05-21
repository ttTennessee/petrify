// Pearl 客户端门面:db.commit / db.get / db.match。
// 后续 W2+ 会加 traverse / history / at。

import { join } from "node:path";

import type {
  CommitIntent,
  CommitReceipt,
  Entity,
  MatchWhere,
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
    // 回放:重建内存视图。W2 加 IntentStarted/Committed 边界过滤。
    for (const ev of log.readAll()) {
      indexes.apply(ev);
    }

    const writer = new Writer(log, indexes, indexes.lastSeq);
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

  /** 内部:供调试 / 后续 history() 用。 */
  _eventsFor(entityId: string) {
    return this.indexes.eventsFor(entityId);
  }

  /** 内部:当前 seq 上限。 */
  _lastSeq(): number {
    return this.indexes.lastSeq;
  }
}
