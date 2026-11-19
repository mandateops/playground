/**
 * Renders one scenario the way the app renders a run: the verdict and the
 * ledger on top, the numbered story below, then how to fix it. The cursor is
 * the last step shown; picking a step moves it there.
 */
import { element } from "./dom";
import { finalLedger, ledgerAt, problemIndex, type Ledger } from "./ledger";
import { formatCents } from "./money";
import { verdictLabel, type Fix, type Scenario, type Step } from "./scenario";

/** How long each step stays on screen during a replay. */
export const REPLAY_STEP_MS = 700;

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

type LedgerParts = Readonly<{ status: string; sent: string; recorded: string }>;

/** The ledger's state and totals as words, shared by the header and the live region. */
export function ledgerParts(scenario: Scenario, ledger: Ledger): LedgerParts {
  return {
    status: ledgerStatus(scenario, ledger),
    sent: `Sent ${formatCents(ledger.sent)}`,
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

/** The ledger: two bars for sent and recorded, and the balance when there is one. */
export function ledgerPanel(scenario: Scenario): LedgerPanel {
  const full = finalLedger(scenario);
  const scale = Math.max(full.sent, full.recorded, scenario.balance ?? 0, 1);
  const marker =
    scenario.balance === undefined
      ? null
      : element("span", { class: "ws-ledger-marker" });
  const sent = ledgerRow("Provider sent", "is-sent", marker);
  const recorded = ledgerRow("Service recorded", "is-recorded", null);
  const status = element("p", { class: "ws-ledger-status" });
  const live = element("p", { class: "sr-only", role: "status" });
  // The live region already speaks the ledger; the header copy is visual only.
  const summary = element("p", { class: "ws-run-summary ws-num", "aria-hidden": "true" });
  const balance =
    scenario.balance === undefined
      ? null
      : element("p", { class: "ws-muted" }, [
          element("span", { class: "ws-ledger-swatch", "aria-hidden": "true" }),
          "Balance, marked on the sent bar: ",
          element("span", { class: "ws-num" }, [formatCents(scenario.balance)]),
        ]);
  const root = element(
    "section",
    { class: "ws-note", "aria-labelledby": "ledger-title" },
    [
      element("h3", { class: "ws-label", id: "ledger-title" }, ["Ledger"]),
      sent.row,
      recorded.row,
      balance,
      status,
      live,
    ],
  );
  if (scenario.balance !== undefined) {
    root.style.setProperty("--balance", String(scenario.balance / scale));
  }
  return {
    root,
    summary,
    show(ledger, announce) {
      sent.value.textContent = formatCents(ledger.sent);
      recorded.value.textContent = formatCents(ledger.recorded);
      sent.fill.style.setProperty("--fill", String(ledger.sent / scale));
      recorded.fill.style.setProperty("--fill", String(ledger.recorded / scale));
      const parts = ledgerParts(scenario, ledger);
      status.textContent = parts.status;
      root.dataset.state = ledger.state;
      summary.dataset.state = ledger.state;
      summary.textContent = `${parts.status} · ${parts.sent} · ${parts.recorded}`;
      if (announce)
        live.textContent = `${parts.status}. ${parts.sent}, ${parts.recorded}.`;
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
      "Adapt this where your service calls the provider.",
    ]),
  ]);
}

export type ScenarioView = Readonly<{
  root: HTMLElement;
  /** The run title, which takes focus when the replay changes. */
  title: HTMLElement;
  /** Stops a running replay. */
  dispose: () => void;
}>;

/** The whole replay; this function owns only the cursor and the replay timer. */
export function renderScenario(scenario: Scenario): ScenarioView {
  const lastIndex = scenario.steps.length - 1;
  let cursor = lastIndex;
  let timer: ReturnType<typeof setInterval> | undefined;

  const ledger = ledgerPanel(scenario);
  const steps = stepItems(scenario);
  const replayButton = element(
    "button",
    { type: "button", class: "ws-button ws-button-secondary ws-button-small" },
    ["Replay"],
  );

  function paint(announce: boolean): void {
    ledger.show(ledgerAt(scenario, cursor), announce);
    steps.forEach(({ item, button }, index) => {
      item.classList.toggle("is-pending", index > cursor);
      item.classList.toggle("is-current", index === cursor);
      // A step is only called the problem once the replay has reached it.
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
    replayButton.textContent = "Replay";
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

  replayButton.addEventListener("click", () => {
    if (timer !== undefined) {
      stop();
      return;
    }
    moveTo(0, false);
    replayButton.textContent = "Stop";
    timer = setInterval(() => {
      moveTo(cursor + 1, false);
      if (cursor >= lastIndex) stop();
    }, REPLAY_STEP_MS);
  });

  const title = element("h2", { class: "ws-run-name", tabindex: "-1" }, [scenario.title]);
  const header = element("header", { class: "ws-run-head" }, [
    title,
    ledger.summary,
    replayButton,
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
