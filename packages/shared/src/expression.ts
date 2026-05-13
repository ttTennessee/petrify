// AST node types produced by the expression DSL parser.
// Kept pure (no functions, no eval). Evaluation lives in the server runtime.

export type ExprNode =
  | { kind: "number"; value: number }
  | { kind: "string"; value: string }
  | { kind: "bool"; value: boolean }
  | { kind: "null" }
  | { kind: "path"; segments: Array<string | number> }
  | { kind: "unary"; op: "!" | "-"; arg: ExprNode }
  | { kind: "binary"; op: BinaryOp; left: ExprNode; right: ExprNode };

export type BinaryOp =
  | "||"
  | "&&"
  | "=="
  | "!="
  | "<"
  | ">"
  | "<="
  | ">="
  | "+"
  | "-"
  | "*"
  | "/"
  | "%";

export interface ExprScope {
  variables?: Record<string, unknown>;
  outputs?: Record<string, unknown>; // keyed by node ref
  env?: Record<string, string>;
}
