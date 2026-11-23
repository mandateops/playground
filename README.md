# MandateOps playground

Money movement bugs, step by step. Each replay shows a backend talking to a payment provider, a running ledger of what the provider moved against what the backend recorded, the step where they stop agreeing, and a pattern for fixing it.

The replays are hand-written illustrations. The backend, the provider, the amounts and the timings are made up. The bugs are common ones in integrations that move or reverse money:

| Flow                    | Replay                      | What goes wrong                                                                                 |
| ----------------------- | --------------------------- | ----------------------------------------------------------------------------------------------- |
| Payouts and withdrawals | Lost reply                  | A retry with no idempotency key pays the contractor twice.                                      |
| Payouts and withdrawals | Balance race                | Two payouts read the same balance and overspend it.                                             |
| Payouts and withdrawals | Crash after sending         | The backend marks a payout failed after the money has left.                                     |
| Payouts and withdrawals | Duplicate webhook           | A redelivered event records one payout as paid twice.                                           |
| Payouts and withdrawals | Lost reply, fixed           | The same lost reply, made safe with an idempotency key.                                         |
| Payouts and withdrawals | Withdrawal timeout          | A timeout returns money to the wallet after it left.                                            |
| Payments in             | Double credit               | A redelivered event credits the customer twice.                                                 |
| Payments in             | Paid, marked unpaid         | The provider charged the card, but a timeout cancels the order.                                 |
| Refunds                 | Refund retried              | A retry refunds twice and exceeds the original payment.                                         |
| Refunds                 | Refund retried, fixed       | The same retry, made safe with an idempotency key.                                              |
| Recurring charges       | Double renewal              | A retried renewal charges the customer twice in one period.                                     |
| Cancellations           | Cancel lost the race        | The provider settled first and refused the cancel, but the backend marks the payment cancelled. |
| Cancellations           | Cancel lost the race, fixed | The same race, kept pending until the provider answers, then refunded.                          |

This repository has no MandateOps product code and makes no network calls. It is a static site.

## What MandateOps does

MandateOps tests the financial correctness of your own backend on every provider call that moves or reverses money: payouts, transfers and withdrawals, payments in, refunds, recurring charges and cancellations. It runs your backend against a stand-in for your payment provider, fails the provider and the network, and reports pass or fail with evidence an engineer can inspect and recheck.

It is pre-production today. It moves no real money, is not a certification, and does not guarantee that it finds every bug.

## Run it

You need [Bun](https://bun.sh) 1.4.4 (pinned in `package.json`).

```bash
make install
make dev
```

Then open http://localhost:5173.

## Check it

```bash
make check
```

This runs the source gates (no dangling inline types, no single-character names, no decorative or trailing comments, no hard-wrapped Markdown), the type checker, ESLint, Prettier and the tests. The commit hook runs the same gates on the lines you change; install it with `make hooks`. The tests check the ledger arithmetic and that every replay is consistent: steps in time order, exactly one problem step in each failing replay, a final ledger that matches the verdict, and at least one failing replay for every money flow.

## Add a replay

Add an entry to `src/scenarios.ts` with its money flow. Amounts are whole cents. Mark the step where the promise breaks with `problem: true`, and give every failing replay a `fix`. Give it a `limit` when the moved money must stay under a ceiling, such as a balance or the original payment. `make check` tells you if the replay is inconsistent.

## Test your own backend

The playground shows what MandateOps checks. To run those checks against your own backend, read the [getting started guide](https://getmandateops.com/getting-started.md).

## Licence

MIT. See [LICENSE](LICENSE).
