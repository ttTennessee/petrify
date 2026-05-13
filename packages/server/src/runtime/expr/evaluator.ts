import type { ExprNode, ExprScope } from "@petrify/shared";
import { parseExpr } from "./parser.js";

export function evaluateExpression(src: string, scope: ExprScope): unknown {
  return evalNode(parseExpr(src), scope);
}

export function evaluateBoolean(src: string, scope: ExprScope): boolean {
  return toBool(evaluateExpression(src, scope));
}

function toBool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.length > 0;
  return true;
}

function evalNode(n: ExprNode, scope: ExprScope): unknown {
  switch (n.kind) {
    case "number":
    case "string":
    case "bool":
      return n.value;
    case "null":
      return null;
    case "path":
      return resolvePath(n.segments, scope);
    case "unary": {
      const arg = evalNode(n.arg, scope);
      if (n.op === "!") return !toBool(arg);
      if (n.op === "-") return -Number(arg);
      return arg;
    }
    case "binary": {
      // short-circuit
      if (n.op === "&&") {
        const l = evalNode(n.left, scope);
        if (!toBool(l)) return false;
        return toBool(evalNode(n.right, scope));
      }
      if (n.op === "||") {
        const l = evalNode(n.left, scope);
        if (toBool(l)) return true;
        return toBool(evalNode(n.right, scope));
      }
      const left = evalNode(n.left, scope);
      const right = evalNode(n.right, scope);
      switch (n.op) {
        case "==":
          return looseEq(left, right);
        case "!=":
          return !looseEq(left, right);
        case "<":
          return Number(left) < Number(right);
        case ">":
          return Number(left) > Number(right);
        case "<=":
          return Number(left) <= Number(right);
        case ">=":
          return Number(left) >= Number(right);
        case "+":
          if (typeof left === "string" || typeof right === "string")
            return String(left) + String(right);
          return Number(left) + Number(right);
        case "-":
          return Number(left) - Number(right);
        case "*":
          return Number(left) * Number(right);
        case "/":
          return Number(left) / Number(right);
        case "%":
          return Number(left) % Number(right);
      }
    }
  }
}

function looseEq(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (typeof a === "number" && typeof b === "number") return a === b;
  return String(a) === String(b);
}

function resolvePath(segments: Array<string | number>, scope: ExprScope): unknown {
  if (segments.length === 0) return undefined;
  const root = segments[0];
  let cursor: unknown =
    root === "variables"
      ? scope.variables ?? {}
      : root === "outputs"
        ? scope.outputs ?? {}
        : root === "env"
          ? scope.env ?? {}
          : undefined;
  for (let i = 1; i < segments.length; i++) {
    if (cursor == null) return undefined;
    const seg = segments[i]!;
    cursor = (cursor as Record<string | number, unknown>)[seg];
  }
  return cursor;
}
