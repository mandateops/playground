import { beforeEach, describe, expect, test } from "bun:test";
import { mountPlayground, scenarioFor, slugOf } from "./playground";
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
