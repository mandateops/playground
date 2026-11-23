import { describe, expect, test } from "bun:test";
import { finalLedger } from "./ledger";
import { readFileSync } from "node:fs";
import { FLOW_LABELS, FLOW_LIST_PLACEHOLDER, FLOWS, flowList } from "./scenario";
import { scenarios } from "./scenarios";

describe("scenarios", () => {
  test("slugs are unique and URL safe", () => {
    const slugs = scenarios.map((scenario) => scenario.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9-]+$/);
  });

  test("a passing replay with a limit ends within it", () => {
    const fixed = scenarios.find((scenario) => scenario.slug === "refund-retried-fixed");
    if (!fixed?.limit) throw new Error("refund-retried-fixed needs a limit");
    const ledger = finalLedger(fixed);
    expect(fixed.verdict).toBe("pass");
    expect(ledger.state).toBe("agree");
    expect(ledger.moved).toBeLessThanOrEqual(fixed.limit.amount);
  });

  test("every money flow has a failing replay", () => {
    for (const flow of FLOWS) {
      const failing = scenarios.filter(
        (scenario) => scenario.flow === flow && scenario.verdict === "fail",
      );
      expect(failing.length).toBeGreaterThan(0);
    }
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
        const overLimit =
          scenario.limit !== undefined && ledger.moved > scenario.limit.amount;
        expect(ledger.moved !== ledger.recorded || overLimit).toBe(true);
      });

      test("copy has no em or en dashes", () => {
        const copy = [
          scenario.title,
          scenario.promise,
          scenario.outcome,
          scenario.result,
          scenario.limit?.label ?? "",
          scenario.verdict === "fail" ? scenario.fix.pattern : "",
          ...scenario.steps.map((step) => step.text),
        ].join(" ");
        expect(copy).not.toMatch(/[–—]|--/);
      });
    });
  }
});

describe("flow copy", () => {
  test("the flow list names every flow once, in order", () => {
    const list = flowList();
    const positions = FLOWS.map((flow) => list.indexOf(FLOW_LABELS[flow].toLowerCase()));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
  });

  test("the page takes its flow list from the shared definition", () => {
    const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
    expect(html.split(FLOW_LIST_PLACEHOLDER).length - 1).toBe(2);
    for (const flow of FLOWS) {
      expect(html.toLowerCase()).not.toContain(FLOW_LABELS[flow].toLowerCase());
    }
  });
});
