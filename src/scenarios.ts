/**
 * The replays. Each one is written by hand: a made-up backend moving money
 * through a made-up provider. The bugs are common integration bugs; the
 * names, amounts and timings are illustrative.
 */
import type { Scenario } from "./scenario";

export const scenarios: readonly Scenario[] = [
  {
    slug: "lost-reply",
    flow: "payout",
    title: "Lost reply",
    promise: "Each payout request moves money once.",
    verdict: "fail",
    outcome: "The contractor was paid twice for one request.",
    result: "The provider sent $500.00 for a $250.00 request.",
    steps: [
      { atMs: 0, actor: "Backend", text: "Gets a request to pay a contractor $250.00." },
      { atMs: 12, actor: "Backend", text: "Sends the payout to the provider." },
      {
        atMs: 140,
        actor: "Provider",
        text: "Accepts the payout and sends $250.00.",
        moved: 25000,
      },
      { atMs: 141, actor: "Network", text: "Drops the provider's reply." },
      {
        atMs: 5000,
        actor: "Backend",
        text: "Times out and sends the same payout again, with no idempotency key.",
      },
      {
        atMs: 5130,
        actor: "Provider",
        text: "Treats it as a new payout and sends another $250.00.",
        moved: 25000,
        problem: true,
      },
      {
        atMs: 5131,
        actor: "Backend",
        text: "Records one payout of $250.00.",
        recorded: 25000,
      },
    ],
    fix: {
      pattern:
        "Give each payout request one idempotency key and send the same key on every retry, so the provider runs it once.",
      diff: [
        "- await provider.payouts.create({ amount, destination });",
        "+ const idempotencyKey = `payout-${request.id}`;",
        "+ await provider.payouts.create(",
        "+   { amount, destination },",
        "+   { idempotencyKey },",
        "+ );",
      ].join("\n"),
    },
  },
  {
    slug: "balance-race",
    flow: "payout",
    title: "Balance race",
    promise: "Payouts never spend more than the balance.",
    verdict: "fail",
    limit: { label: "Balance", amount: 30000 },
    outcome: "Two payouts spent $400.00 from a $300.00 balance.",
    result: "$400.00 left a balance that held $300.00.",
    steps: [
      { atMs: 0, actor: "Backend", text: "Gets a request to pay $200.00." },
      { atMs: 3, actor: "Backend", text: "Gets a second request to pay $200.00." },
      {
        atMs: 8,
        actor: "Backend",
        text: "Request one reads the balance, $300.00, and finds it enough.",
      },
      {
        atMs: 9,
        actor: "Backend",
        text: "Request two reads the same $300.00 and also finds it enough.",
      },
      {
        atMs: 150,
        actor: "Provider",
        text: "Sends $200.00 for request one.",
        moved: 20000,
      },
      {
        atMs: 152,
        actor: "Backend",
        text: "Records request one as paid.",
        recorded: 20000,
      },
      {
        atMs: 160,
        actor: "Provider",
        text: "Sends $200.00 for request two.",
        moved: 20000,
        problem: true,
      },
      {
        atMs: 161,
        actor: "Backend",
        text: "Records request two as paid.",
        recorded: 20000,
      },
    ],
    fix: {
      pattern:
        "Reserve the amount in the same database transaction that checks the balance, so two requests cannot both see the old balance.",
      diff: [
        "- const balance = await db.balance(accountId);",
        "- if (balance < amount) throw new InsufficientFunds();",
        "+ const reserved = await db.reserve(accountId, amount);",
        "+ if (!reserved) throw new InsufficientFunds();",
      ].join("\n"),
    },
  },
  {
    slug: "crash-after-send",
    flow: "payout",
    title: "Crash after sending",
    promise: "A payout ends paid or failed, never guessed.",
    verdict: "fail",
    outcome: "The money left, but the backend told the user it failed.",
    result: "The provider sent $120.00 and the backend recorded $0.00.",
    steps: [
      { atMs: 0, actor: "Backend", text: "Gets a request to pay $120.00." },
      { atMs: 10, actor: "Backend", text: "Sends the payout to the provider." },
      {
        atMs: 130,
        actor: "Provider",
        text: "Accepts the payout and sends $120.00.",
        moved: 12000,
      },
      {
        atMs: 131,
        actor: "Backend",
        text: "Crashes before it saves the provider's answer.",
      },
      {
        atMs: 4000,
        actor: "Backend",
        text: "Restarts and finds the payout with no answer saved.",
      },
      {
        atMs: 4010,
        actor: "Backend",
        text: "Marks the payout failed without asking the provider.",
        problem: true,
      },
    ],
    fix: {
      pattern:
        "When a payout has no saved answer, ask the provider for its status before deciding. A missing reply is not a failure.",
      diff: [
        "- if (!payout.result) await markFailed(payout);",
        "+ if (!payout.result) {",
        "+   const status = await provider.payouts.find(payout.idempotencyKey);",
        "+   await settle(payout, status);",
        "+ }",
      ].join("\n"),
    },
  },
  {
    slug: "duplicate-webhook",
    flow: "payout",
    title: "Duplicate webhook",
    promise: "Each provider event changes the records once.",
    verdict: "fail",
    outcome: "One $80.00 payout was recorded as $160.00 paid.",
    result: "The provider sent $80.00 and the backend recorded $160.00.",
    steps: [
      { atMs: 0, actor: "Backend", text: "Sends a payout of $80.00." },
      { atMs: 120, actor: "Provider", text: "Sends $80.00.", moved: 8000 },
      {
        atMs: 900,
        actor: "Webhook",
        text: "Delivers the event that the payout is paid.",
      },
      {
        atMs: 905,
        actor: "Backend",
        text: "Records $80.00 as paid, then takes over 10 seconds to reply.",
        recorded: 8000,
      },
      {
        atMs: 11000,
        actor: "Webhook",
        text: "Gets no reply in time and delivers the same event again.",
      },
      {
        atMs: 11004,
        actor: "Backend",
        text: "Records $80.00 as paid a second time.",
        recorded: 8000,
        problem: true,
      },
    ],
    fix: {
      pattern:
        "Store each event's id when you apply it, and skip any event you have already applied.",
      diff: [
        "+ if (await db.eventApplied(event.id)) return reply(200);",
        "  await db.markPaid(event.payoutId, event.amount);",
        "+ await db.recordEvent(event.id);",
      ].join("\n"),
    },
  },
  {
    slug: "lost-reply-fixed",
    flow: "payout",
    title: "Lost reply, fixed",
    promise: "Each payout request moves money once.",
    verdict: "pass",
    outcome: "The reply was lost, but the retry paid and recorded the payout once.",
    result: "The provider sent $250.00 and the backend recorded $250.00.",
    steps: [
      { atMs: 0, actor: "Backend", text: "Gets a request to pay a contractor $250.00." },
      { atMs: 12, actor: "Backend", text: "Sends the payout with an idempotency key." },
      {
        atMs: 140,
        actor: "Provider",
        text: "Accepts the payout and sends $250.00.",
        moved: 25000,
      },
      { atMs: 141, actor: "Network", text: "Drops the provider's reply." },
      { atMs: 5000, actor: "Backend", text: "Times out and retries with the same key." },
      {
        atMs: 5120,
        actor: "Provider",
        text: "Recognises the key and returns the first payout without moving money.",
      },
      {
        atMs: 5121,
        actor: "Backend",
        text: "Records one payout of $250.00.",
        recorded: 25000,
      },
    ],
  },
  {
    slug: "withdrawal-marked-failed",
    flow: "payout",
    title: "Withdrawal timeout",
    promise: "A withdrawal ends sent or returned, never guessed.",
    verdict: "fail",
    outcome: "The money left, but the backend put it back in the wallet.",
    result: "The provider moved $300.00 and the backend recorded $0.00.",
    steps: [
      {
        atMs: 0,
        actor: "Backend",
        text: "Gets a request to withdraw $300.00 to a bank account.",
      },
      { atMs: 15, actor: "Backend", text: "Sends the withdrawal to the provider." },
      {
        atMs: 160,
        actor: "Provider",
        text: "Accepts the withdrawal and sends $300.00.",
        moved: 30000,
      },
      { atMs: 161, actor: "Network", text: "Drops the provider's reply." },
      {
        atMs: 10000,
        actor: "Backend",
        text: "Times out, records the withdrawal as failed and returns $300.00 to the wallet.",
        problem: true,
      },
    ],
    fix: {
      pattern:
        "Treat a timeout as unknown, not failed. Keep the funds held and ask the provider for the withdrawal's status before returning anything.",
      diff: [
        "- catch (error) { await markFailed(withdrawal); await wallet.release(hold); }",
        "+ catch (error) {",
        "+   const status = await provider.withdrawals.find(withdrawal.idempotencyKey);",
        "+   await settle(withdrawal, status);",
        "+ }",
      ].join("\n"),
    },
  },
  {
    slug: "payment-webhook-twice",
    flow: "payment",
    title: "Double credit",
    promise: "Each payment credits the customer once.",
    verdict: "fail",
    outcome: "One $50.00 payment credited the customer $100.00.",
    result: "The provider collected $50.00 and the backend credited $100.00.",
    steps: [
      {
        atMs: 0,
        actor: "Provider",
        text: "Collects a $50.00 top up from the customer.",
        moved: 5000,
      },
      {
        atMs: 800,
        actor: "Webhook",
        text: "Delivers the event that the payment succeeded.",
      },
      {
        atMs: 806,
        actor: "Backend",
        text: "Credits the customer $50.00, then takes over 10 seconds to reply.",
        recorded: 5000,
      },
      {
        atMs: 11000,
        actor: "Webhook",
        text: "Gets no reply in time and delivers the same event again.",
      },
      {
        atMs: 11005,
        actor: "Backend",
        text: "Credits the customer $50.00 a second time.",
        recorded: 5000,
        problem: true,
      },
    ],
    fix: {
      pattern:
        "Credit the customer and store the event id in one transaction, and skip any event you have already applied.",
      diff: [
        "+ if (await db.eventApplied(event.id)) return reply(200);",
        "  await db.transaction(async (tx) => {",
        "    await tx.credit(event.customerId, event.amount);",
        "+   await tx.recordEvent(event.id);",
        "  });",
      ].join("\n"),
    },
  },
  {
    slug: "paid-but-unpaid",
    flow: "payment",
    title: "Paid, marked unpaid",
    promise: "An order paid at the provider is paid in the records.",
    verdict: "fail",
    outcome: "The customer paid $40.00, but the order was cancelled as unpaid.",
    result: "The provider collected $40.00 and the backend recorded $0.00.",
    steps: [
      {
        atMs: 0,
        actor: "Backend",
        text: "Asks the provider to charge $40.00 for an order.",
      },
      {
        atMs: 180,
        actor: "Provider",
        text: "Charges the customer's card $40.00.",
        moved: 4000,
      },
      { atMs: 181, actor: "Network", text: "Drops the provider's reply." },
      {
        atMs: 8000,
        actor: "Backend",
        text: "Times out and marks the order unpaid.",
        problem: true,
      },
      { atMs: 8010, actor: "Backend", text: "Cancels the order and releases the stock." },
    ],
    fix: {
      pattern:
        "Leave the order pending after a timeout and settle it from the provider's status or the payment webhook, never from the timeout alone.",
      diff: [
        "- catch (error) { await markUnpaid(order); }",
        "+ catch (error) {",
        "+   await markPending(order);",
        "+   const status = await provider.payments.find(order.idempotencyKey);",
        "+   await settle(order, status);",
        "+ }",
      ].join("\n"),
    },
  },
  {
    slug: "refund-retried",
    flow: "refund",
    title: "Refund retried",
    promise: "A refund never returns more than the original payment.",
    verdict: "fail",
    limit: { label: "Original payment", amount: 6000 },
    outcome: "A $60.00 payment was refunded $120.00.",
    result: "The provider refunded $120.00 against a $60.00 payment.",
    steps: [
      {
        atMs: 0,
        actor: "Backend",
        text: "Gets a request to refund a $60.00 payment in full.",
      },
      { atMs: 10, actor: "Backend", text: "Sends the refund to the provider." },
      {
        atMs: 150,
        actor: "Provider",
        text: "Accepts the refund and returns $60.00 to the customer.",
        moved: 6000,
      },
      { atMs: 151, actor: "Network", text: "Drops the provider's reply." },
      {
        atMs: 5000,
        actor: "Backend",
        text: "Times out and sends the refund again, with no idempotency key.",
      },
      {
        atMs: 5140,
        actor: "Provider",
        text: "Treats it as a new refund and returns another $60.00.",
        moved: 6000,
        problem: true,
      },
      {
        atMs: 5141,
        actor: "Backend",
        text: "Records one refund of $60.00.",
        recorded: 6000,
      },
    ],
    fix: {
      pattern:
        "Key each refund on the refund request and send the same key on every retry, so the provider refunds once.",
      diff: [
        "- await provider.refunds.create({ paymentId, amount });",
        "+ await provider.refunds.create(",
        "+   { paymentId, amount },",
        "+   { idempotencyKey: `refund-${request.id}` },",
        "+ );",
      ].join("\n"),
    },
  },
  {
    slug: "refund-retried-fixed",
    flow: "refund",
    title: "Refund retried, fixed",
    promise: "A refund never returns more than the original payment.",
    verdict: "pass",
    limit: { label: "Original payment", amount: 6000 },
    outcome: "The reply was lost, but the retry refunded the customer once.",
    result: "The provider refunded $60.00 and the backend recorded $60.00.",
    steps: [
      {
        atMs: 0,
        actor: "Backend",
        text: "Gets a request to refund a $60.00 payment in full.",
      },
      { atMs: 10, actor: "Backend", text: "Sends the refund with an idempotency key." },
      {
        atMs: 150,
        actor: "Provider",
        text: "Accepts the refund and returns $60.00 to the customer.",
        moved: 6000,
      },
      { atMs: 151, actor: "Network", text: "Drops the provider's reply." },
      { atMs: 5000, actor: "Backend", text: "Times out and retries with the same key." },
      {
        atMs: 5130,
        actor: "Provider",
        text: "Recognises the key and returns the first refund without moving money.",
      },
      {
        atMs: 5131,
        actor: "Backend",
        text: "Records one refund of $60.00.",
        recorded: 6000,
      },
    ],
  },
  {
    slug: "renewal-charged-twice",
    flow: "recurring",
    title: "Double renewal",
    promise: "A subscription is charged once per period.",
    verdict: "fail",
    outcome: "The customer was charged $29.00 twice for one month.",
    result: "The provider collected $58.00 for one $29.00 renewal.",
    steps: [
      { atMs: 0, actor: "Backend", text: "Starts the monthly renewal of a $29.00 plan." },
      {
        atMs: 200,
        actor: "Provider",
        text: "Charges the saved card $29.00.",
        moved: 2900,
      },
      { atMs: 201, actor: "Network", text: "Drops the provider's reply." },
      {
        atMs: 30000,
        actor: "Backend",
        text: "Times out, leaves the period unpaid and queues the renewal again.",
      },
      {
        atMs: 60000,
        actor: "Provider",
        text: "Charges the saved card another $29.00.",
        moved: 2900,
        problem: true,
      },
      {
        atMs: 60001,
        actor: "Backend",
        text: "Records the period as paid, $29.00.",
        recorded: 2900,
      },
    ],
    fix: {
      pattern:
        "Key each renewal on the subscription and billing period, so a retry for the same period cannot charge again.",
      diff: [
        "- await provider.charges.create({ customerId, amount });",
        "+ await provider.charges.create(",
        "+   { customerId, amount },",
        "+   { idempotencyKey: `renewal-${subscription.id}-${period.start}` },",
        "+ );",
      ].join("\n"),
    },
  },
  {
    slug: "cancel-lost-race",
    flow: "cancellation",
    title: "Cancel lost the race",
    promise: "A cancelled payment moved no money.",
    verdict: "fail",
    outcome: "The customer paid $75.00, but the order was cancelled and released.",
    result: "The provider settled $75.00 and the backend recorded $0.00.",
    steps: [
      { atMs: 0, actor: "Backend", text: "Creates a $75.00 payment link for an order." },
      {
        atMs: 60000,
        actor: "Provider",
        text: "Settles the customer's $75.00 payment.",
        moved: 7500,
      },
      {
        atMs: 60050,
        actor: "Backend",
        text: "Gets the customer's request to cancel and sends the cancel to the provider.",
      },
      {
        atMs: 60200,
        actor: "Provider",
        text: "Refuses the cancel because the payment has already settled.",
      },
      {
        atMs: 60201,
        actor: "Backend",
        text: "Ignores the refusal and marks the payment cancelled.",
        problem: true,
      },
      { atMs: 60210, actor: "Backend", text: "Releases the order." },
    ],
    fix: {
      pattern:
        "Treat the cancel reply as authoritative. Keep the record pending until the provider confirms it cancelled, and if the payment already settled, follow up with a refund.",
      diff: [
        "- await provider.payments.cancel(payment.id);",
        "- await markCancelled(payment);",
        "+ await markPending(payment);",
        "+ const reply = await provider.payments.cancel(payment.id);",
        '+ if (reply.status === "cancelled") await markCancelled(payment);',
        "+ else await settleThenRefund(payment, reply);",
      ].join("\n"),
    },
  },
  {
    slug: "cancel-lost-race-fixed",
    flow: "cancellation",
    title: "Cancel lost the race, fixed",
    promise: "A cancelled payment moved no money.",
    verdict: "pass",
    outcome:
      "The cancel was refused, so the payment was recorded as paid and a refund followed.",
    result: "The provider settled $75.00 and the backend recorded $75.00.",
    steps: [
      { atMs: 0, actor: "Backend", text: "Creates a $75.00 payment link for an order." },
      {
        atMs: 60000,
        actor: "Provider",
        text: "Settles the customer's $75.00 payment.",
        moved: 7500,
      },
      {
        atMs: 60050,
        actor: "Backend",
        text: "Gets the customer's request to cancel and sends the cancel to the provider.",
      },
      {
        atMs: 60200,
        actor: "Provider",
        text: "Refuses the cancel because the payment has already settled.",
      },
      {
        atMs: 60201,
        actor: "Backend",
        text: "Keeps the payment pending and reads the refusal as settled.",
      },
      {
        atMs: 60210,
        actor: "Backend",
        text: "Records the $75.00 payment and queues a refund for the customer.",
        recorded: 7500,
      },
    ],
  },
];
