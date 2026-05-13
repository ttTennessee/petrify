export type TokenKind =
  | "number"
  | "string"
  | "bool"
  | "null"
  | "ident"
  | "$"
  | "."
  | "["
  | "]"
  | "("
  | ")"
  | "+"
  | "-"
  | "*"
  | "/"
  | "%"
  | "!"
  | "=="
  | "!="
  | "<"
  | ">"
  | "<="
  | ">="
  | "&&"
  | "||"
  | "and"
  | "or"
  | "eof";

export interface Token {
  kind: TokenKind;
  value: string;
  pos: number;
}

const KEYWORDS = new Set(["true", "false", "null", "and", "or"]);

export function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  const push = (kind: TokenKind, value: string, pos: number) =>
    out.push({ kind, value, pos });

  while (i < src.length) {
    const c = src[i]!;
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i++;
      continue;
    }
    const start = i;

    // numbers
    if ((c >= "0" && c <= "9") || (c === "." && src[i + 1]! >= "0" && src[i + 1]! <= "9")) {
      let j = i;
      while (j < src.length && ((src[j]! >= "0" && src[j]! <= "9") || src[j] === ".")) j++;
      push("number", src.slice(i, j), start);
      i = j;
      continue;
    }

    // strings
    if (c === '"' || c === "'") {
      const quote = c;
      let j = i + 1;
      let buf = "";
      while (j < src.length && src[j] !== quote) {
        if (src[j] === "\\" && j + 1 < src.length) {
          buf += src[j + 1];
          j += 2;
          continue;
        }
        buf += src[j];
        j++;
      }
      if (src[j] !== quote) throw new ExprError(`unterminated string at ${start}`);
      push("string", buf, start);
      i = j + 1;
      continue;
    }

    // identifiers / keywords
    if ((c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_") {
      let j = i;
      while (
        j < src.length &&
        ((src[j]! >= "a" && src[j]! <= "z") ||
          (src[j]! >= "A" && src[j]! <= "Z") ||
          (src[j]! >= "0" && src[j]! <= "9") ||
          src[j] === "_")
      )
        j++;
      const word = src.slice(i, j);
      if (word === "true" || word === "false") push("bool", word, start);
      else if (word === "null") push("null", word, start);
      else if (word === "and") push("&&", word, start);
      else if (word === "or") push("||", word, start);
      else push("ident", word, start);
      i = j;
      continue;
    }

    // multi-char operators
    const two = src.slice(i, i + 2);
    if (two === "==" || two === "!=" || two === "<=" || two === ">=" || two === "&&" || two === "||") {
      push(two as TokenKind, two, start);
      i += 2;
      continue;
    }

    // single-char
    if (
      c === "$" ||
      c === "." ||
      c === "[" ||
      c === "]" ||
      c === "(" ||
      c === ")" ||
      c === "+" ||
      c === "-" ||
      c === "*" ||
      c === "/" ||
      c === "%" ||
      c === "!" ||
      c === "<" ||
      c === ">"
    ) {
      push(c as TokenKind, c, start);
      i++;
      continue;
    }

    throw new ExprError(`unexpected character '${c}' at ${i}`);
  }
  push("eof", "", i);
  return out;
}

export class ExprError extends Error {}

// keep KEYWORDS exported so future tooling can reuse it
export const _RESERVED = KEYWORDS;
