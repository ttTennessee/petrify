import { describe, expect, it } from "vitest";
import { evaluateBoolean, evaluateExpression } from "./evaluator.js";
import { parseExpr } from "./parser.js";
import { ExprError } from "./lexer.js";

describe("expression DSL", () => {
  it("evaluates arithmetic precedence", () => {
    expect(evaluateExpression("1 + 2 * 3", {})).toBe(7);
    expect(evaluateExpression("(1 + 2) * 3", {})).toBe(9);
    expect(evaluateExpression("10 % 3", {})).toBe(1);
  });

  it("evaluates comparisons and booleans", () => {
    expect(evaluateBoolean("3 > 2 && 1 < 5", {})).toBe(true);
    expect(evaluateBoolean("3 > 2 && 1 > 5", {})).toBe(false);
    expect(evaluateBoolean("3 > 2 || 1 > 5", {})).toBe(true);
    expect(evaluateBoolean("!(3 > 2)", {})).toBe(false);
  });

  it("short-circuits && and ||", () => {
    // If short-circuit works, missing path on the dead branch shouldn't throw.
    expect(evaluateBoolean("false && $.variables.missing", {})).toBe(false);
    expect(evaluateBoolean("true || $.variables.missing", {})).toBe(true);
  });

  it("resolves variables / outputs / env paths", () => {
    const scope = {
      variables: { count: 4, name: "alice" },
      outputs: { intake: { brief: "ok" } },
      env: { API_KEY: "secret" },
    };
    expect(evaluateExpression("$.variables.count", scope)).toBe(4);
    expect(evaluateExpression("$.outputs.intake.brief", scope)).toBe("ok");
    expect(evaluateBoolean("$.variables.count > 2", scope)).toBe(true);
    expect(evaluateExpression("$.env.API_KEY", scope)).toBe("secret");
  });

  it("returns undefined / falsy for missing paths", () => {
    expect(evaluateExpression("$.variables.missing", {})).toBeUndefined();
    expect(evaluateBoolean("$.variables.missing", {})).toBe(false);
  });

  it("supports string concat with +", () => {
    expect(evaluateExpression("'hello ' + 'world'", {})).toBe("hello world");
  });

  it("rejects malformed expressions", () => {
    expect(() => parseExpr("1 +")).toThrow(ExprError);
    expect(() => parseExpr("$.")).toThrow(ExprError);
    expect(() => parseExpr("trailing tokens here")).toThrow(ExprError);
  });

  it("'and' / 'or' word forms parse same as && / ||", () => {
    expect(evaluateBoolean("1 < 2 and 3 < 4", {})).toBe(true);
    expect(evaluateBoolean("1 > 2 or 3 < 4", {})).toBe(true);
  });
});
