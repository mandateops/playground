import { beforeEach, describe, expect, test } from "bun:test";
import { mountPlayground, revealSideways, scenarioFor, slugOf } from "./playground";
import { FLOW_LABELS, FLOWS } from "./scenario";
import { scenarios } from "./scenarios";

describe("slugOf", () => {
  test("strips the hash and decodes", () => {
    expect(slugOf("#balance-race")).toBe("balance-race");
    expect(slugOf("")).toBe("");
  });

  test("returns empty for malformed encoding instead of throwing", () => {
    expect(slugOf("#%E0%A4%A")).toBe("");
  });
});

describe("scenarioFor", () => {
  test("finds a scenario by slug", () => {
    expect(scenarioFor(scenarios, "duplicate-webhook")?.slug).toBe("duplicate-webhook");
  });

  test("falls back to the first scenario for an unknown slug", () => {
    expect(scenarioFor(scenarios, "nope")?.slug).toBe(scenarios[0]?.slug);
  });
});

describe("revealSideways", () => {
  function sized(scrollWidth: number, clientWidth: number): HTMLElement {
    const picker = document.createElement("ul");
    Object.defineProperty(picker, "scrollWidth", { value: scrollWidth });
    Object.defineProperty(picker, "clientWidth", { value: clientWidth });
    picker.getBoundingClientRect = () => ({ left: 0 }) as DOMRect;
    return picker;
  }
  const link = document.createElement("a");
  link.getBoundingClientRect = () => ({ left: 300 }) as DOMRect;

  test("leaves a picker that fits alone", () => {
    const picker = sized(200, 200);
    revealSideways(picker, link);
    expect(picker.scrollLeft).toBe(0);
  });

  test("scrolls an overflowing picker to the link", () => {
    const picker = sized(1000, 200);
    revealSideways(picker, link);
    expect(picker.scrollLeft).toBe(300);
  });
});

describe("mountPlayground", () => {
  const listeners = new Map<string, () => void>();
  const location = { hash: "" };
  const replaced: string[] = [];
  const page = { title: "" };
  let stage: HTMLElement;
  let picker: HTMLElement;
  let skip: HTMLElement;

  const shownTitle = (): string | null | undefined =>
    stage.querySelector(".ws-run-name")?.textContent;

  beforeEach(() => {
    listeners.clear();
    location.hash = "";
    replaced.length = 0;
    stage = document.createElement("div");
    stage.tabIndex = -1;
    picker = document.createElement("ul");
    skip = document.createElement("button");
    document.body.replaceChildren(skip, picker, stage);
    mountPlayground({
      stage,
      picker,
      skip,
      scenarios,
      location,
      history: {
        replaceState: (_state: unknown, _unused: string, url?: string | URL | null) => {
          replaced.push(String(url));
        },
      },
      document: page,
      window: {
        addEventListener: (type: string, listener: unknown) => {
          listeners.set(type, listener as () => void);
        },
      },
    });
  });

  test("lists every replay with its verdict", () => {
    expect(picker.querySelectorAll("a").length).toBe(scenarios.length);
    expect(picker.textContent).toContain("Passed");
  });

  test("groups replays under one labelled list per money flow", () => {
    const labels = [...picker.querySelectorAll(".ws-nav-group-label")].map(
      (node) => node.textContent,
    );
    expect(labels).toEqual(FLOWS.map((flow) => FLOW_LABELS[flow]));
    const refunds = picker.querySelector('[aria-labelledby="flow-refund"]');
    expect(refunds?.querySelectorAll("a").length).toBe(
      scenarios.filter((scenario) => scenario.flow === "refund").length,
    );
  });

  test("lists every replay exactly once across the groups", () => {
    const hrefs = [...picker.querySelectorAll(".ws-nav-group a")].map((link) =>
      link.getAttribute("href"),
    );
    expect(hrefs.sort()).toEqual(scenarios.map((scenario) => `#${scenario.slug}`).sort());
  });

  test("shows the first replay with no hash", () => {
    expect(shownTitle()).toBe(scenarios[0]?.title);
  });

  test("rewrites an unknown or empty hash to the replay it shows", () => {
    expect(replaced).toEqual([`#${scenarios[0]?.slug ?? ""}`]);
  });

  test("sets the page title", () => {
    expect(page.title).toBe(`${scenarios[0]?.title ?? ""} · MandateOps playground`);
  });

  test("a hash change swaps the replay, marks the link and moves focus", () => {
    location.hash = "#balance-race";
    listeners.get("hashchange")?.();
    expect(shownTitle()).toBe("Balance race");
    expect(picker.querySelector('[aria-current="page"]')?.getAttribute("href")).toBe(
      "#balance-race",
    );
    expect(document.activeElement).toBe(stage.querySelector(".ws-run-name"));
  });

  test("the skip button moves focus without changing the hash", () => {
    skip.click();
    expect(document.activeElement).toBe(stage.querySelector(".ws-run-name"));
    expect(location.hash).toBe("");
  });
});
