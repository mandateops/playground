import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import { ledgerAt } from "./ledger";
import { scenarios } from "./scenarios";
import {
  laterLine,
  ledgerStatus,
  renderScenario,
  STEP_MS,
  stepLabel,
  writeHeadRoom,
  HEAD_ROOM_VARIABLE,
  ledgerParts,
} from "./view";

const lostReply = scenarios.find((scenario) => scenario.slug === "lost-reply");
if (!lostReply) throw new Error("lost-reply scenario missing");

describe("laterLine", () => {
  test("says nothing for the first step or a short gap", () => {
    expect(laterLine(lostReply.steps, 0)).toBeNull();
    expect(laterLine(lostReply.steps, 1)).toBeNull();
  });

  test("words a gap of five seconds or more as the app does", () => {
    const webhook = scenarios.find(
      (scenario) => scenario.slug === "payment-webhook-twice",
    );
    expect(laterLine(webhook?.steps ?? [], 3)).toBe("10 s later");
  });

  test("says nothing for an index past the end", () => {
    expect(laterLine(lostReply.steps, 99)).toBeNull();
  });
});

describe("stepLabel", () => {
  test("follows the app's pattern", () => {
    expect(stepLabel(0, false)).toBe("Step 1");
    expect(stepLabel(5, true)).toBe("Step 6, the problem");
  });
});

describe("ledgerParts", () => {
  test("words the state and both totals", () => {
    expect(ledgerParts(lostReply, ledgerAt(lostReply, 2))).toEqual({
      status: "Records not caught up yet",
      moved: "Moved $250.00",
      recorded: "Recorded $0.00",
    });
  });
});

describe("writeHeadRoom", () => {
  test("writes the header height, rounded up, to the page root", () => {
    const pageRoot = document.createElement("div");
    writeHeadRoom(pageRoot, 82.4);
    expect(pageRoot.style.getPropertyValue(HEAD_ROOM_VARIABLE)).toBe("83px");
  });
});

describe("ledgerStatus", () => {
  test("names the 1-based problem step when broken", () => {
    expect(ledgerStatus(lostReply, ledgerAt(lostReply, 5))).toBe("Fails at step 6");
  });

  test("says when records have not caught up", () => {
    expect(ledgerStatus(lostReply, ledgerAt(lostReply, 2))).toBe(
      "Records not caught up yet",
    );
  });

  test("says when both sides agree", () => {
    expect(ledgerStatus(lostReply, ledgerAt(lostReply, 0))).toBe("Both sides agree");
  });
});

describe("renderScenario", () => {
  let view: ReturnType<typeof renderScenario>;

  const stepButtons = (): HTMLButtonElement[] => [
    ...view.root.querySelectorAll<HTMLButtonElement>(".ws-story-select"),
  ];
  const stepItems = (): HTMLElement[] => [
    ...view.root.querySelectorAll<HTMLElement>(".ws-story-step"),
  ];
  const currentIndex = (): number =>
    stepButtons().findIndex((button) => button.getAttribute("aria-current") === "step");
  const ledgerValues = (): string[] =>
    [...view.root.querySelectorAll(".ws-ledger-value")].map(
      (node) => node.textContent ?? "",
    );
  const playButton = (): HTMLButtonElement => {
    const button = [...view.root.querySelectorAll<HTMLButtonElement>("button")].find(
      (each) => each.textContent === "Play" || each.textContent === "Stop",
    );
    if (!button) throw new Error("no play button");
    return button;
  };

  beforeEach(() => {
    jest.useFakeTimers();
    view = renderScenario(lostReply);
    document.body.replaceChildren(view.root);
  });

  afterEach(() => {
    view.dispose();
    jest.useRealTimers();
  });

  test("starts on the last step with the final ledger", () => {
    expect(currentIndex()).toBe(lostReply.steps.length - 1);
    expect(ledgerValues()).toEqual(["$500.00", "$250.00"]);
  });

  test("clicking a step moves the cursor and the ledger", () => {
    stepButtons()[2]?.click();
    expect(currentIndex()).toBe(2);
    expect(ledgerValues()).toEqual(["$250.00", "$0.00"]);
  });

  test("the sticky header carries the ledger for the selected step", () => {
    stepButtons()[2]?.click();
    const summary = view.root.querySelector(".ws-run-head .ws-run-summary");
    expect(summary?.textContent).toBe(
      "Records not caught up yet · Moved $250.00 · Recorded $0.00",
    );
    expect(summary?.getAttribute("aria-hidden")).toBe("true");
  });

  test("every step stays in the tab order", () => {
    expect(stepButtons().every((button) => button.tabIndex === 0)).toBe(true);
  });

  test("steps after the cursor are pending and not yet called the problem", () => {
    stepButtons()[2]?.click();
    const problem = stepItems()[5];
    expect(problem?.classList.contains("is-pending")).toBe(true);
    expect(problem?.getAttribute("aria-label")).toBe("Step 6");
    stepButtons()[5]?.click();
    expect(problem?.classList.contains("is-pending")).toBe(false);
    expect(problem?.getAttribute("aria-label")).toBe("Step 6, the problem");
  });

  test("play advances one step per interval and stops at the end", () => {
    playButton().click();
    expect(currentIndex()).toBe(0);
    expect(playButton().textContent).toBe("Stop");
    jest.advanceTimersByTime(STEP_MS * 2);
    expect(currentIndex()).toBe(2);
    jest.advanceTimersByTime(STEP_MS * lostReply.steps.length);
    expect(currentIndex()).toBe(lostReply.steps.length - 1);
    expect(playButton().textContent).toBe("Play");
  });

  test("clicking Stop halts playback", () => {
    playButton().click();
    jest.advanceTimersByTime(STEP_MS);
    playButton().click();
    const stoppedAt = currentIndex();
    jest.advanceTimersByTime(STEP_MS * 3);
    expect(currentIndex()).toBe(stoppedAt);
    expect(playButton().textContent).toBe("Play");
  });

  test("dispose clears a running playback", () => {
    playButton().click();
    view.dispose();
    jest.advanceTimersByTime(STEP_MS * 3);
    expect(currentIndex()).toBe(0);
  });

  test("the title can take focus", () => {
    view.title.focus();
    expect(document.activeElement).toBe(view.title);
  });
});
