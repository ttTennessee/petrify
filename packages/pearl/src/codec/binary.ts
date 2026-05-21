// Pearl 二进制 IR(简单 TLV)。
//
// 设计目标:把任何 Value(意图/Entity/Event/查询结果)序列化到 Buffer,
// 以及反向解码。本身不绑定具体类型,纯粹按 JSON 兼容值编解码。
//
// Tags:
//   0x00 NULL
//   0x01 FALSE
//   0x02 TRUE
//   0x03 INT_POS varint(n)            非负安全整数
//   0x04 FLOAT64 big-endian 8B IEEE754
//   0x05 STR     varint(byteLen) + utf8
//   0x06 ARR     varint(count) + items
//   0x07 OBJ     varint(pairs) + (strKeyLen + key + value)*
//   0x08 INT_NEG varint(|n|)          负安全整数 — 解码后取负
//
// varint:LEB128 无符号,小端,每字节最高位为 continuation flag。
// 拆 POS/NEG 而非 zigzag:避免在 |n| 接近 MAX_SAFE_INTEGER 时 (n*2) 越界丢精度。

import type { Value } from "../types.js";

const TAG_NULL = 0x00;
const TAG_FALSE = 0x01;
const TAG_TRUE = 0x02;
const TAG_INT_POS = 0x03;
const TAG_FLOAT = 0x04;
const TAG_STR = 0x05;
const TAG_ARR = 0x06;
const TAG_OBJ = 0x07;
const TAG_INT_NEG = 0x08;

class Encoder {
  private parts: Buffer[] = [];
  private scratch = Buffer.alloc(10);

  push(byte: number): void {
    const b = Buffer.alloc(1);
    b[0] = byte;
    this.parts.push(b);
  }

  pushBuffer(b: Buffer): void {
    this.parts.push(b);
  }

  pushVarint(n: number): void {
    if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
      throw new Error(`varint requires non-negative integer, got ${n}`);
    }
    let i = 0;
    while (n >= 128) {
      this.scratch[i++] = (n % 128) | 0x80;
      n = Math.floor(n / 128);
    }
    this.scratch[i++] = n;
    this.parts.push(Buffer.from(this.scratch.subarray(0, i)));
  }

  encode(v: Value): void {
    if (v === null) {
      this.push(TAG_NULL);
      return;
    }
    if (v === false) {
      this.push(TAG_FALSE);
      return;
    }
    if (v === true) {
      this.push(TAG_TRUE);
      return;
    }
    if (typeof v === "number") {
      if (Number.isFinite(v) && Number.isInteger(v) && Number.isSafeInteger(v)) {
        if (v >= 0) {
          this.push(TAG_INT_POS);
          this.pushVarint(v);
        } else {
          this.push(TAG_INT_NEG);
          this.pushVarint(-v);
        }
      } else {
        this.push(TAG_FLOAT);
        const b = Buffer.alloc(8);
        b.writeDoubleBE(v, 0);
        this.pushBuffer(b);
      }
      return;
    }
    if (typeof v === "string") {
      this.push(TAG_STR);
      const buf = Buffer.from(v, "utf8");
      this.pushVarint(buf.length);
      this.pushBuffer(buf);
      return;
    }
    if (Array.isArray(v)) {
      this.push(TAG_ARR);
      this.pushVarint(v.length);
      for (const item of v) this.encode(item);
      return;
    }
    if (typeof v === "object") {
      this.push(TAG_OBJ);
      const keys = Object.keys(v).filter((k) => v[k] !== undefined);
      this.pushVarint(keys.length);
      for (const k of keys) {
        const kBuf = Buffer.from(k, "utf8");
        this.pushVarint(kBuf.length);
        this.pushBuffer(kBuf);
        this.encode(v[k] as Value);
      }
      return;
    }
    throw new Error(`Cannot encode value of type ${typeof v}`);
  }

  finish(): Buffer {
    return Buffer.concat(this.parts);
  }
}

class Decoder {
  private pos = 0;
  constructor(private readonly buf: Buffer) {}

  private readByte(): number {
    if (this.pos >= this.buf.length) throw new Error("decoder: unexpected EOF");
    return this.buf[this.pos++]!;
  }

  private readVarint(): number {
    let result = 0;
    let shift = 1;
    while (true) {
      const b = this.readByte();
      result += (b & 0x7f) * shift;
      if ((b & 0x80) === 0) return result;
      shift *= 128;
      if (shift > 2 ** 49) throw new Error("decoder: varint too long");
    }
  }

  decode(): Value {
    const tag = this.readByte();
    switch (tag) {
      case TAG_NULL:
        return null;
      case TAG_FALSE:
        return false;
      case TAG_TRUE:
        return true;
      case TAG_INT_POS:
        return this.readVarint();
      case TAG_INT_NEG:
        return -this.readVarint();
      case TAG_FLOAT: {
        if (this.pos + 8 > this.buf.length) throw new Error("decoder: short float");
        const v = this.buf.readDoubleBE(this.pos);
        this.pos += 8;
        return v;
      }
      case TAG_STR: {
        const len = this.readVarint();
        if (this.pos + len > this.buf.length) throw new Error("decoder: short str");
        const s = this.buf.toString("utf8", this.pos, this.pos + len);
        this.pos += len;
        return s;
      }
      case TAG_ARR: {
        const count = this.readVarint();
        const arr: Value[] = [];
        for (let i = 0; i < count; i++) arr.push(this.decode());
        return arr;
      }
      case TAG_OBJ: {
        const count = this.readVarint();
        const obj: Record<string, Value> = {};
        for (let i = 0; i < count; i++) {
          const klen = this.readVarint();
          if (this.pos + klen > this.buf.length) throw new Error("decoder: short key");
          const k = this.buf.toString("utf8", this.pos, this.pos + klen);
          this.pos += klen;
          obj[k] = this.decode();
        }
        return obj;
      }
      default:
        throw new Error(`decoder: unknown tag 0x${tag.toString(16).padStart(2, "0")}`);
    }
  }

  remaining(): number {
    return this.buf.length - this.pos;
  }
}

export function encode(value: Value): Buffer {
  const enc = new Encoder();
  enc.encode(value);
  return enc.finish();
}

export function decode(buf: Buffer): Value {
  const dec = new Decoder(buf);
  const v = dec.decode();
  if (dec.remaining() > 0) {
    throw new Error(`decoder: ${dec.remaining()} trailing bytes`);
  }
  return v;
}
