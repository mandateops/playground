/**
 * The running ledger: what the provider sent against what the service
 * recorded, up to a chosen step.
 */
import { addCents, type Cents } from "./money";
import type { Scenario } from "./scenario";

/**
 * `agree`: both sides match. `in-flight`: they differ while work is still
 * running, which is expected. `broken`: the promise has failed.
 */
export type LedgerState = "agree" | "in-flight" | "broken";

export type Ledger = Readonly<{
  sent: Cents;
  recorded: Cents;
  state: LedgerState;
}>;

/** The index of the step where the promise breaks, or -1 when it holds. */
export function problemIndex(scenario: Scenario): number {
  return scenario.steps.findIndex((step) => step.problem === true);
}

/** The ledger after steps `0..=through` of `scenario`. */
export function ledgerAt(scenario: Scenario, through: number): Ledger {
  if (!Number.isInteger(through) || through < -1) {
    throw new RangeError("step index out of range");
  }
  const last = Math.min(through, scenario.steps.length - 1);
  let sent: Cents = 0;
  let recorded: Cents = 0;
  for (const step of scenario.steps.slice(0, last + 1)) {
    sent = addCents(sent, step.sent ?? 0);
    recorded = addCents(recorded, step.recorded ?? 0);
  }
  const problem = problemIndex(scenario);
  const state: LedgerState =
    problem !== -1 && last >= problem
      ? "broken"
      : sent === recorded
        ? "agree"
        : "in-flight";
  return { sent, recorded, state };
}

/** The ledger once every step has run. */
export function finalLedger(scenario: Scenario): Ledger {
  return ledgerAt(scenario, scenario.steps.length - 1);
}
