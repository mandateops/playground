/** The shape of one hand-written replay. */
import type { Cents } from "./money";

/** Who acts in a step. */
export type Actor = "Service" | "Provider" | "Network" | "Webhook";

export type Step = Readonly<{
  /** Milliseconds since the run started. */
  atMs: number;
  actor: Actor;
  text: string;
  /** Money the provider moved in this step. */
  sent?: Cents;
  /** Money the service recorded as paid in this step. */
  recorded?: Cents;
  /** Marks the one step where a failing replay breaks its promise. */
  problem?: true;
}>;

export type Fix = Readonly<{
  pattern: string;
  diff: string;
}>;

type ScenarioBase = Readonly<{
  slug: string;
  title: string;
  /** The property the run checks, in plain words. */
  promise: string;
  /** One sentence on the outcome, shown in the verdict. */
  outcome: string;
  /** The closing line of the story: what the run found. */
  result: string;
  /** Money available to pay out, when the scenario has a limit. */
  balance?: Cents;
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
