/**
 * Renders one scenario the way the app renders a run: the verdict and the
 * ledger on top, the numbered story below, then how to fix it. The cursor is
 * the last step shown; picking a step moves it there.
 */
import { element } from "./dom";
import { finalLedger, ledgerAt, problemIndex, type Ledger } from "./ledger";
import { formatCents } from "./money";
import { verdictLabel, type Fix, type Scenario, type Step } from "./scenario";

/** How long each step stays on screen while a scenario reproduces. */
export const STEP_MS = 700;

/** The app's threshold for saying a gap: shorter gaps get no line. */
export const LATER_MS = 5000;

/** The gap since the step before, worded as the app does, or null when short. */
export function laterLine(steps: readonly Step[], index: number): string | null {
  const step = steps[index];
  const previous = steps[index - 1];
  if (!step || !previous) return null;
  const gapMs = step.atMs - previous.atMs;
  return gapMs >= LATER_MS ? `${String(Math.round(gapMs / 1000))} s later` : null;
}

/** The line under the ledger for its state. */
export function ledgerStatus(scenario: Scenario, ledger: Ledger): string {
  switch (ledger.state) {
    case "broken":
      return `Fails at step ${String(problemIndex(scenario) + 1)}`;
    case "in-flight":
      return "Records not caught up yet";
    case "agree":
      return "Both sides agree";
  }
}

type LedgerParts = Readonly<{ status: string; moved: string; recorded: string }>;

/** The ledger's state and totals as words, shared by the header and the live region. */
export function ledgerParts(scenario: Scenario, ledger: Ledger): LedgerParts {
  return {
    status: ledgerStatus(scenario, ledger),
    moved: `Moved ${formatCents(ledger.moved)}`,
    recorded: `Recorded ${formatCents(ledger.recorded)}`,
  };
}

/** The variable that keeps anchor jumps clear of the sticky run header. */
export const HEAD_ROOM_VARIABLE = "--ws-run-head-room";

/**
 * Writes the sticky header's measured height to the page root, as the app
 * does: the header wraps on narrow screens, so a fixed value would let anchor
 * jumps stop underneath it.
 */
export function writeHeadRoom(pageRoot: HTMLElement, heightPx: number): void {
  pageRoot.style.setProperty(HEAD_ROOM_VARIABLE, `${String(Math.ceil(heightPx))}px`);
}

type LedgerPanel = Readonly<{
  root: HTMLElement;
  /** A one-line copy of the ledger for the sticky run header. */
  summary: HTMLElement;
  show: (ledger: Ledger, announce: boolean) => void;
}>;

type LedgerRow = Readonly<{ row: HTMLElement; fill: HTMLElement; value: HTMLElement }>;

function ledgerRow(label: string, tone: string, marker: HTMLElement | null): LedgerRow {
  const value = element("span", { class: "ws-ledger-value ws-num" });
  const fill = element("span", { class: `ws-ledger-fill ${tone}` });
  const row = element("div", { class: "ws-ledger-row" }, [
    element("span", { class: "ws-muted" }, [label]),
    value,
    element("span", { class: "ws-ledger-track", "aria-hidden": "true" }, [fill, marker]),
  ]);
  return { row, fill, value };
}

/** The ledger: two bars for moved and recorded, and the limit when there is one. */
export function ledgerPanel(scenario: Scenario): LedgerPanel {
  const full = finalLedger(scenario);
  const limit = scenario.limit;
  const scale = Math.max(full.moved, full.recorded, limit?.amount ?? 0, 1);
  const marker = limit ? element("span", { class: "ws-ledger-marker" }) : null;
  const moved = ledgerRow("Provider moved", "is-moved", marker);
  const recorded = ledgerRow("Backend recorded", "is-recorded", null);
  const status = element("p", { class: "ws-ledger-status" });
  const live = element("p", { class: "sr-only", role: "status" });
  // The live region already speaks the ledger; the header copy is visual only.
  const summary = element("p", { class: "ws-run-summary ws-num", "aria-hidden": "true" });
  const limitLine = limit
    ? element("p", { class: "ws-muted" }, [
        element("span", { class: "ws-ledger-swatch", "aria-hidden": "true" }),
        `${limit.label}, marked on the moved bar: `,
        element("span", { class: "ws-num" }, [formatCents(limit.amount)]),
      ])
    : null;
  const root = element(
    "section",
    { class: "ws-note", "aria-labelledby": "ledger-title" },
    [
      element("h3", { class: "ws-label", id: "ledger-title" }, ["Ledger"]),
      moved.row,
      recorded.row,
      limitLine,
      status,
      live,
    ],
  );
  if (limit) root.style.setProperty("--limit", String(limit.amount / scale));
  return {
    root,
    summary,
    show(ledger, announce) {
      moved.value.textContent = formatCents(ledger.moved);
      recorded.value.textContent = formatCents(ledger.recorded);
      moved.fill.style.setProperty("--fill", String(ledger.moved / scale));
      recorded.fill.style.setProperty("--fill", String(ledger.recorded / scale));
      const parts = ledgerParts(scenario, ledger);
      status.textContent = parts.status;
      root.dataset.state = ledger.state;
      summary.dataset.state = ledger.state;
      summary.textContent = `${parts.status} · ${parts.moved} · ${parts.recorded}`;
      if (announce)
        live.textContent = `${parts.status}. ${parts.moved}, ${parts.recorded}.`;
    },
  };
}

/** The verdict card: the badge, the promise and the outcome. */
export function verdictSection(scenario: Scenario): HTMLElement {
  return element(
    "section",
    {
      class: `ws-verdict ws-verdict-${scenario.verdict}`,
      "aria-labelledby": "verdict-title",
    },
    [
      element("h3", { class: "ws-verdict-badge", id: "verdict-title" }, [
        verdictLabel(scenario.verdict),
      ]),
      element("div", { class: "ws-headline" }, [
        element("p", { class: "ws-headline-verdict" }, [scenario.promise]),
        element("p", {}, [scenario.outcome]),
      ]),
    ],
  );
}

/** A step's label, the app's pattern: "Step 6" or "Step 6, the problem". */
export function stepLabel(index: number, problem: boolean): string {
  return `Step ${String(index + 1)}${problem ? ", the problem" : ""}`;
}

type StepItem = Readonly<{ item: HTMLLIElement; button: HTMLButtonElement }>;

/** One list item per step, numbered as in the app's run story. */
export function stepItems(scenario: Scenario): StepItem[] {
  return scenario.steps.map((step, index) => {
    const later = laterLine(scenario.steps, index);
    const button = element("button", { type: "button", class: "ws-story-select" }, [
      element("span", { class: "ws-story-number", "aria-hidden": "true" }, [
        String(index + 1),
      ]),
      element("span", { class: "ws-story-body" }, [
        later ? element("span", { class: "ws-story-later" }, [later]) : null,
        element("span", { class: "ws-story-text" }, [
          element("span", { class: "ws-story-actor" }, [step.actor]),
          step.text,
        ]),
      ]),
    ]);
    const item = element(
      "li",
      {
        class: step.problem ? "ws-story-step is-problem" : "ws-story-step",
        "aria-label": stepLabel(index, step.problem === true),
      },
      [button],
    );
    return { item, button };
  });
}

/** How to fix: the pattern and an example change. */
export function fixSection(fix: Fix): HTMLElement {
  const lines = fix.diff
    .split("\n")
    .map((line) =>
      element(
        "span",
        { class: line.startsWith("+") ? "is-add" : line.startsWith("-") ? "is-del" : "" },
        [line],
      ),
    );
  return element("section", { class: "ws-story-fix", "aria-labelledby": "fix-title" }, [
    element("h3", { class: "ws-label", id: "fix-title" }, ["How to fix"]),
    element("p", {}, [fix.pattern]),
    element(
      "pre",
      {
        class: "ws-raw ws-diff",
        tabindex: "0",
        "aria-label": "Example change in TypeScript",
      },
      [element("code", {}, lines)],
    ),
    element("p", { class: "ws-muted" }, [
      "Adapt this where your backend calls the provider.",
    ]),
  ]);
}

export type ScenarioView = Readonly<{
  root: HTMLElement;
  /** The run title, which takes focus when the scenario changes. */
  title: HTMLElement;
  /** Stops a running reproduction. */
  dispose: () => void;
}>;

/** The whole scenario; this function owns only the cursor and the reproduction timer. */
export function renderScenario(scenario: Scenario): ScenarioView {
  const lastIndex = scenario.steps.length - 1;
  let cursor = lastIndex;
  let timer: ReturnType<typeof setInterval> | undefined;

  const ledger = ledgerPanel(scenario);
  const steps = stepItems(scenario);
  const reproduceButton = element(
    "button",
    { type: "button", class: "ws-button ws-button-secondary ws-button-small" },
    ["Reproduce"],
  );

  function paint(announce: boolean): void {
    ledger.show(ledgerAt(scenario, cursor), announce);
    steps.forEach(({ item, button }, index) => {
      item.classList.toggle("is-pending", index > cursor);
      item.classList.toggle("is-current", index === cursor);
      // A step is only called the problem once the reproduction has reached it.
      const reached = scenario.steps[index]?.problem === true && index <= cursor;
      item.setAttribute("aria-label", stepLabel(index, reached));
      if (index === cursor) button.setAttribute("aria-current", "step");
      else button.removeAttribute("aria-current");
    });
  }

  function clearTimer(): void {
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
  }

  function stop(): void {
    if (timer === undefined) return;
    clearTimer();
    reproduceButton.textContent = "Reproduce";
    paint(true);
  }

  function moveTo(index: number, announce: boolean): void {
    cursor = Math.max(0, Math.min(index, lastIndex));
    paint(announce);
  }

  steps.forEach(({ button }, index) => {
    button.addEventListener("click", () => {
      stop();
      moveTo(index, true);
    });
  });

  reproduceButton.addEventListener("click", () => {
    if (timer !== undefined) {
      stop();
      return;
    }
    moveTo(0, false);
    reproduceButton.textContent = "Stop";
    timer = setInterval(() => {
      moveTo(cursor + 1, false);
      if (cursor >= lastIndex) stop();
    }, STEP_MS);
  });

  const title = element("h2", { class: "ws-run-name", tabindex: "-1" }, [scenario.title]);
  const header = element("header", { class: "ws-run-head" }, [
    title,
    ledger.summary,
    reproduceButton,
  ]);
  const headObserver =
    typeof ResizeObserver === "undefined"
      ? undefined
      : new ResizeObserver((entries) => {
          const size = entries[0]?.borderBoxSize[0];
          if (size) writeHeadRoom(document.documentElement, size.blockSize);
        });
  headObserver?.observe(header);
  const root = element("article", { class: "ws-run ws-stack" }, [
    header,
    element("div", { class: "ws-run-top" }, [verdictSection(scenario), ledger.root]),
    element("p", { class: "ws-muted" }, [
      "Pick a step to see the ledger at that moment.",
    ]),
    element("ol", { class: "ws-story", "aria-label": "What happened" }, [
      ...steps.map(({ item }) => item),
      element("li", { class: "ws-story-result" }, [scenario.result]),
    ]),
    scenario.verdict === "fail" ? fixSection(scenario.fix) : null,
  ]);

  paint(false);
  return {
    root,
    title,
    dispose: () => {
      clearTimer();
      headObserver?.disconnect();
    },
  };
}
