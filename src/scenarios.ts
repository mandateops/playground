/**
 * The replays. Each one is written by hand: a made-up payout service paying
 * through a made-up provider. The bugs are common integration bugs; the
 * names, amounts and timings are illustrative.
 */
import type { Scenario } from "./scenario";

export const scenarios: readonly Scenario[] = [
  {
    slug: "lost-reply",
    title: "Lost reply",
    promise: "Each payout request moves money once.",
    verdict: "fail",
    outcome: "The contractor was paid twice for one request.",
    result: "The provider sent $500.00 for a $250.00 request.",
    steps: [
      { atMs: 0, actor: "Service", text: "Gets a request to pay a contractor $250.00." },
      { atMs: 12, actor: "Service", text: "Sends the payout to the provider." },
      {
        atMs: 140,
        actor: "Provider",
        text: "Accepts the payout and sends $250.00.",
        sent: 25000,
      },
      { atMs: 141, actor: "Network", text: "Drops the provider's reply." },
      {
        atMs: 5000,
        actor: "Service",
        text: "Times out and sends the same payout again, with no idempotency key.",
      },
      {
        atMs: 5130,
        actor: "Provider",
        text: "Treats it as a new payout and sends another $250.00.",
        sent: 25000,
        problem: true,
      },
      {
        atMs: 5131,
        actor: "Service",
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
    title: "Balance race",
    promise: "Payouts never spend more than the balance.",
    verdict: "fail",
    balance: 30000,
    outcome: "Two payouts spent $400.00 from a $300.00 balance.",
    result: "$400.00 left a balance that held $300.00.",
    steps: [
      { atMs: 0, actor: "Service", text: "Gets a request to pay $200.00." },
      { atMs: 3, actor: "Service", text: "Gets a second request to pay $200.00." },
      {
        atMs: 8,
        actor: "Service",
        text: "Request one reads the balance, $300.00, and finds it enough.",
      },
      {
        atMs: 9,
        actor: "Service",
        text: "Request two reads the same $300.00 and also finds it enough.",
      },
      {
        atMs: 150,
        actor: "Provider",
        text: "Sends $200.00 for request one.",
        sent: 20000,
      },
      {
        atMs: 152,
        actor: "Service",
        text: "Records request one as paid.",
        recorded: 20000,
      },
      {
        atMs: 160,
        actor: "Provider",
        text: "Sends $200.00 for request two.",
        sent: 20000,
        problem: true,
      },
      {
        atMs: 161,
        actor: "Service",
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
    title: "Crash after sending",
    promise: "A payout ends paid or failed, never guessed.",
    verdict: "fail",
    outcome: "The money left, but the service told the user it failed.",
    result: "The provider sent $120.00 and the service recorded $0.00.",
    steps: [
      { atMs: 0, actor: "Service", text: "Gets a request to pay $120.00." },
      { atMs: 10, actor: "Service", text: "Sends the payout to the provider." },
      {
        atMs: 130,
        actor: "Provider",
        text: "Accepts the payout and sends $120.00.",
        sent: 12000,
      },
      {
        atMs: 131,
        actor: "Service",
        text: "Crashes before it saves the provider's answer.",
      },
      {
        atMs: 4000,
        actor: "Service",
        text: "Restarts and finds the payout with no answer saved.",
      },
      {
        atMs: 4010,
        actor: "Service",
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
    title: "Duplicate webhook",
    promise: "Each provider event changes the records once.",
    verdict: "fail",
    outcome: "One $80.00 payout was recorded as $160.00 paid.",
    result: "The provider sent $80.00 and the service recorded $160.00.",
    steps: [
      { atMs: 0, actor: "Service", text: "Sends a payout of $80.00." },
      { atMs: 120, actor: "Provider", text: "Sends $80.00.", sent: 8000 },
      {
        atMs: 900,
        actor: "Webhook",
        text: "Delivers the event that the payout is paid.",
      },
      {
        atMs: 905,
        actor: "Service",
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
        actor: "Service",
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
    title: "Lost reply, fixed",
    promise: "Each payout request moves money once.",
    verdict: "pass",
    outcome: "The reply was lost, but the retry paid and recorded the payout once.",
    result: "The provider sent $250.00 and the service recorded $250.00.",
    steps: [
      { atMs: 0, actor: "Service", text: "Gets a request to pay a contractor $250.00." },
      { atMs: 12, actor: "Service", text: "Sends the payout with an idempotency key." },
      {
        atMs: 140,
        actor: "Provider",
        text: "Accepts the payout and sends $250.00.",
        sent: 25000,
      },
      { atMs: 141, actor: "Network", text: "Drops the provider's reply." },
      { atMs: 5000, actor: "Service", text: "Times out and retries with the same key." },
      {
        atMs: 5120,
        actor: "Provider",
        text: "Recognises the key and returns the first payout without moving money.",
      },
      {
        atMs: 5121,
        actor: "Service",
        text: "Records one payout of $250.00.",
        recorded: 25000,
      },
    ],
  },
];
