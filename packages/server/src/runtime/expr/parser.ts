import type { ExprNode, BinaryOp } from "@petrify/shared";
import { type Token, tokenize, ExprError } from "./lexer.js";

// Recursive-descent parser for the small DSL.

export function parseExpr(src: string): ExprNode {
  const tokens = tokenize(src);
  let i = 0;
  const peek = () => tokens[i]!;
  const eat = (kind: string) => {
    if (peek().kind !== kind)
      throw new ExprError(`expected ${kind} at ${peek().pos}, got ${peek().kind}`);
    const t = tokens[i]!;
    i++;
    return t;
  };
  const match = (...kinds: string[]): Token | null => {
    if (kinds.includes(peek().kind)) {
      const t = tokens[i]!;
      i++;
      return t;
    }
    return null;
  };

  const parseOr = (): ExprNode => {
    let left = parseAnd();
    while (match("||")) {
      const right = parseAnd();
      left = { kind: "binary", op: "||", left, right };
    }
    return left;
  };
  const parseAnd = (): ExprNode => {
    let left = parseCmp();
    while (match("&&")) {
      const right = parseCmp();
      left = { kind: "binary", op: "&&", left, right };
    }
    return left;
  };
  const parseCmp = (): ExprNode => {
    let left = parseAdd();
    let op;
    while ((op = match("==", "!=", "<", ">", "<=", ">="))) {
      const right = parseAdd();
      left = { kind: "binary", op: op.kind as BinaryOp, left, right };
    }
    return left;
  };
  const parseAdd = (): ExprNode => {
    let left = parseMul();
    let op;
    while ((op = match("+", "-"))) {
      const right = parseMul();
      left = { kind: "binary", op: op.kind as BinaryOp, left, right };
    }
    return left;
  };
  const parseMul = (): ExprNode => {
    let left = parseUnary();
    let op;
    while ((op = match("*", "/", "%"))) {
      const right = parseUnary();
      left = { kind: "binary", op: op.kind as BinaryOp, left, right };
    }
    return left;
  };
  const parseUnary = (): ExprNode => {
    const op = match("!", "-");
    if (op) {
      const arg = parseUnary();
      return { kind: "unary", op: op.kind as "!" | "-", arg };
    }
    return parsePrimary();
  };
  const parsePrimary = (): ExprNode => {
    const t = peek();
    if (t.kind === "number") {
      i++;
      return { kind: "number", value: Number(t.value) };
    }
    if (t.kind === "string") {
      i++;
      return { kind: "string", value: t.value };
    }
    if (t.kind === "bool") {
      i++;
      return { kind: "bool", value: t.value === "true" };
    }
    if (t.kind === "null") {
      i++;
      return { kind: "null" };
    }
    if (t.kind === "$") {
      i++;
      const segments: Array<string | number> = [];
      while (peek().kind === "." || peek().kind === "[") {
        if (match(".")) {
          const id = eat("ident");
          segments.push(id.value);
        } else if (match("[")) {
          const tok = peek();
          if (tok.kind === "number") {
            i++;
            segments.push(Number(tok.value));
          } else if (tok.kind === "string") {
            i++;
            segments.push(tok.value);
          } else {
            throw new ExprError(`invalid index at ${tok.pos}`);
          }
          eat("]");
        }
      }
      return { kind: "path", segments };
    }
    if (t.kind === "(") {
      i++;
      const inner = parseOr();
      eat(")");
      return inner;
    }
    throw new ExprError(`unexpected token ${t.kind} ('${t.value}') at ${t.pos}`);
  };

  const ast = parseOr();
  if (peek().kind !== "eof") throw new ExprError(`trailing input at ${peek().pos}`);
  return ast;
}
