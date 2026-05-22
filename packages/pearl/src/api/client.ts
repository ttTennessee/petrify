// Pearl 客户端门面:commit / get / match / traverse / history / at / execute。

import { join } from "node:path";

import type {
  CommitIntent,
  CommitReceipt,
  Entity,
  Event,
  HistoryOptions,
  MatchWhere,
  TraverseOptions,
  Value,
} from "../types.js";
import { EventLog, type LogOptions } from "../store/log.js";
import { Indexes } from "../store/indexes.js";
import { Writer } from "../engine/writer.js";
import { execute as executeIntent, type ReadIntent, type ReadResult } from "./intent.js";
import { decode as binaryDecode, encode as binaryEncode } from "../codec/binary.js";
import {
  generateTypes,
  writeTypes,
  type GenTypesOptions,
} from "../tools/gen-types.js";

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

    const writer = new Writer(log, indexes, maxSeq);
    return new Pearl(log, indexes, writer);
  }

  close(): void {
    this.log.close();
  }

  // ---- 写 ----
  commit(intent: CommitIntent): CommitReceipt {
    return this.writer.commit(intent);
  }

  // ---- 读(命令式) ----
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

  // ---- 读(声明式意图) ----
  execute(intent: ReadIntent): ReadResult {
    return executeIntent(this.indexes, intent);
  }

  // ---- 二进制 IR ----
  // 静态方法:与具体实例无关,但放在 Pearl 上方便发现。
  static toBinary(value: Value): Buffer {
    return binaryEncode(value);
  }

  static fromBinary(buf: Buffer): Value {
    return binaryDecode(buf);
  }

  // ---- 类型生成 ----
  generateTypes(opts?: GenTypesOptions): string {
    return generateTypes(this.indexes.shapes, opts);
  }

  writeTypes(outputPath: string, opts?: GenTypesOptions): void {
    writeTypes(this.indexes.shapes, outputPath, opts);
  }

  // ---- 内部 / 调试 ----
  _lastSeq(): number {
    return this.indexes.lastSeq;
  }

  _eventsFor(entityId: string) {
    return this.indexes.eventsFor(entityId);
  }

  _shapeOf(entityType: string) {
    return this.indexes.shapes.shapeOf(entityType);
  }

  _entityTypes(): string[] {
    return this.indexes.shapes.entityTypes();
  }
}
