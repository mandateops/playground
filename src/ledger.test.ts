import { describe, expect, test } from "bun:test";
import { finalLedger, ledgerAt, problemIndex } from "./ledger";
import type { Scenario } from "./scenario";

const sample: Scenario = {
  slug: "sample",
  flow: "payment",
  title: "Sample",
  promise: "Money moves once.",
  verdict: "fail",
  outcome: "Paid twice.",
  result: "Sent twice.",
  fix: { pattern: "Use a key.", diff: "+ key" },
  steps: [
    { atMs: 0, actor: "Provider", text: "Sends.", moved: 100 },
    { atMs: 1, actor: "Provider", text: "Sends again.", moved: 100, problem: true },
    { atMs: 2, actor: "Backend", text: "Records.", recorded: 100 },
  ],
};

describe("ledgerAt", () => {
  test("starts empty before any step", () => {
    expect(ledgerAt(sample, -1)).toEqual({ moved: 0, recorded: 0, state: "agree" });
  });

  test("a gap before the problem step is in flight, not broken", () => {
    expect(ledgerAt(sample, 0)).toEqual({ moved: 100, recorded: 0, state: "in-flight" });
  });

  test("breaks from the problem step onward", () => {
    expect(ledgerAt(sample, 1).state).toBe("broken");
  });

  test("clamps an index past the last step", () => {
    expect(ledgerAt(sample, 99)).toEqual(ledgerAt(sample, 2));
  });

  test("rejects a fractional or negative index", () => {
    expect(() => ledgerAt(sample, 0.5)).toThrow(RangeError);
    expect(() => ledgerAt(sample, -2)).toThrow(RangeError);
  });
});

describe("finalLedger", () => {
  test("sums every step", () => {
    expect(finalLedger(sample)).toEqual({ moved: 200, recorded: 100, state: "broken" });
  });
});

describe("problemIndex", () => {
  test("finds the problem step", () => {
    expect(problemIndex(sample)).toBe(1);
  });

  test("is -1 when the promise holds", () => {
    expect(problemIndex({ ...sample, steps: [] })).toBe(-1);
  });
});

describe("finalLedger with a limit", () => {
  test("a passing run ends agreeing and within its limit", () => {
    const within: Scenario = {
      slug: "within",
      flow: "payment",
      title: "Within",
      promise: "Money stays within the limit.",
      verdict: "pass",
      outcome: "Paid once.",
      result: "Sent once.",
      limit: { label: "Original payment", amount: 100 },
      steps: [
        { atMs: 0, actor: "Provider", text: "Sends.", moved: 100 },
        { atMs: 1, actor: "Backend", text: "Records.", recorded: 100 },
      ],
    };
    const ledger = finalLedger(within);
    expect(ledger.state).toBe("agree");
    expect(ledger.moved).toBeLessThanOrEqual(within.limit?.amount ?? 0);
  });
});
