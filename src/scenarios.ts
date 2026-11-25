/**
 * The scenarios. Each one is written by hand: a made-up backend moving money
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
    result: "The provider moved $500.00 for a $250.00 request.",
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
    slug: "payment-webhook-twice",
    flow: "payment",
    title: "Double credit",
    promise: "Each payment credits the customer once.",
    verdict: "fail",
    outcome: "One $50.00 payment credited the customer $100.00.",
    result: "The provider moved $50.00 and the backend recorded $100.00.",
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
        "  await db.transaction(async (tx) => {",
        "+   // A unique key on the event id: a conflict means it was already applied.",
        "+   const fresh = await tx.insertEventOnce(event.id);",
        "+   if (!fresh) return;",
        "    await tx.credit(event.customerId, event.amount);",
        "  });",
      ].join("\n"),
    },
  },
  {
    slug: "renewal-charged-twice",
    flow: "recurring",
    title: "Double renewal",
    promise: "A subscription is charged once per period.",
    verdict: "fail",
    outcome: "The customer was charged $29.00 twice for one month.",
    result: "The provider moved $58.00 for one $29.00 renewal.",
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
];
