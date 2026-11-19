/**
 * Money as integer minor units (cents). Every sum is checked so a scenario
 * can never silently overflow into a wrong total. The replays use one
 * illustrative currency, US dollars, so formatting is fixed to it.
 */

/** An amount in minor units of one currency. */
export type Cents = number;

const MINOR_UNITS_PER_DOLLAR = 100;

/** Adds two amounts, throwing if the result leaves the safe integer range. */
export function addCents(left: Cents, right: Cents): Cents {
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right)) {
    throw new RangeError("amounts must be whole minor units");
  }
  const total = left + right;
  if (!Number.isSafeInteger(total)) {
    throw new RangeError("amount overflow");
  }
  return total;
}

const dollars = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

/** Formats minor units as US dollars, for example 25000 as "$250.00". */
export function formatCents(amount: Cents): string {
  if (!Number.isSafeInteger(amount)) {
    throw new RangeError("amounts must be whole minor units");
  }
  return dollars.format(amount / MINOR_UNITS_PER_DOLLAR);
}
