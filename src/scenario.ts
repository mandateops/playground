/** The shape of one hand-written replay. */
import type { Cents } from "./money";

/** Who acts in a step. */
export type Actor = "Backend" | "Provider" | "Network" | "Webhook";

/** The money flows a replay can show, in the order the picker lists them. */
export const FLOWS = ["payout", "payment", "refund", "recurring"] as const;

export type Flow = (typeof FLOWS)[number];

/** The picker's short label for each flow. */
export const FLOW_LABELS: Readonly<Record<Flow, string>> = {
  payout: "Payouts and withdrawals",
  payment: "Payments in",
  refund: "Refunds",
  recurring: "Recurring charges",
};

export type Step = Readonly<{
  /** Milliseconds since the run started. */
  atMs: number;
  actor: Actor;
  text: string;
  /** Money the provider moved in this step, in either direction. */
  moved?: Cents;
  /** Money the backend recorded as moved in this step. */
  recorded?: Cents;
  /** Marks the one step where a failing replay breaks its promise. */
  problem?: true;
}>;

/** A ceiling the moved money must stay within, such as a balance or the original payment. */
export type Limit = Readonly<{
  label: string;
  amount: Cents;
}>;

export type Fix = Readonly<{
  pattern: string;
  diff: string;
}>;

type ScenarioBase = Readonly<{
  slug: string;
  flow: Flow;
  title: string;
  /** The property the run checks, in plain words. */
  promise: string;
  /** One sentence on the outcome, shown in the verdict. */
  outcome: string;
  /** The closing line of the story: what the run found. */
  result: string;
  limit?: Limit;
  steps: readonly Step[];
}>;

/** A failing replay always carries a fix; a passing one never does. */
export type Scenario = ScenarioBase &
  (Readonly<{ verdict: "fail"; fix: Fix }> | Readonly<{ verdict: "pass" }>);

export type Verdict = Scenario["verdict"];

/** The app's word for a verdict. */
export function verdictLabel(verdict: Verdict): string {
  return verdict === "fail" ? "Failed" : "Passed";
}
