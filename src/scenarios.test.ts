import { describe, expect, test } from "bun:test";
import { finalLedger } from "./ledger";
import { scenarios } from "./scenarios";

describe("scenarios", () => {
  test("slugs are unique and URL safe", () => {
    const slugs = scenarios.map((scenario) => scenario.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9-]+$/);
  });

  for (const scenario of scenarios) {
    describe(scenario.slug, () => {
      test("steps run in time order", () => {
        const times = scenario.steps.map((step) => step.atMs);
        expect(times).toEqual([...times].sort((left, right) => left - right));
      });

      test("a failing run breaks at exactly one step, a passing run never", () => {
        const problems = scenario.steps.filter((step) => step.problem);
        expect(problems.length).toBe(scenario.verdict === "fail" ? 1 : 0);
      });

      test("the final ledger matches the verdict", () => {
        const ledger = finalLedger(scenario);
        if (scenario.verdict === "pass") {
          expect(ledger.state).toBe("agree");
          return;
        }
        expect(ledger.state).toBe("broken");
        const overBalance =
          scenario.balance !== undefined && ledger.sent > scenario.balance;
        expect(ledger.sent !== ledger.recorded || overBalance).toBe(true);
      });

      test("copy has no em or en dashes", () => {
        const copy = [
          scenario.title,
          scenario.promise,
          scenario.outcome,
          scenario.result,
          scenario.verdict === "fail" ? scenario.fix.pattern : "",
          ...scenario.steps.map((step) => step.text),
        ].join(" ");
        expect(copy).not.toMatch(/[–—]|--/);
      });
    });
  }
});
