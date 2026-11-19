# MandateOps playground

Payout bugs replayed step by step. Each replay shows a payout service talking to a payment provider, a running ledger of what the provider sent against what the service recorded, the step where they stop agreeing, and a pattern for fixing it.

The replays are written by hand. The service, the provider, the amounts and the timings are made up. The bugs are common ones in payout integrations:

| Replay              | What goes wrong                                             |
| ------------------- | ----------------------------------------------------------- |
| Lost reply          | A retry with no idempotency key pays the contractor twice.  |
| Balance race        | Two payouts read the same balance and overspend it.         |
| Crash after sending | The service marks a payout failed after the money has left. |
| Duplicate webhook   | A redelivered event records one payout as paid twice.       |
| Lost reply, fixed   | The same lost reply, made safe with an idempotency key.     |

This repository has no MandateOps engine code and makes no network calls. It is a static site.

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

This runs the source gates (no dangling inline types, no single-character names, no decorative or trailing comments, no hard-wrapped Markdown), the type checker, ESLint, Prettier and the tests. The commit hook runs the same gates on the lines you change; install it with `make hooks`. The tests check the ledger arithmetic and that every replay is consistent: steps in time order, exactly one problem step in each failing replay, and a final ledger that matches the verdict.

## Add a replay

Add an entry to `src/scenarios.ts`. Amounts are whole cents. Mark the step where the promise breaks with `problem: true`, and give every failing replay a `fix`. `make check` tells you if the replay is inconsistent.

## Test your own service

The playground shows what MandateOps checks. To run those checks against your own payout service, read the [getting started guide](https://getmandateops.com/getting-started.md).

## Licence

MIT. See [LICENSE](LICENSE).
