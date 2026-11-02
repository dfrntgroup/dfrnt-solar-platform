// Stripe (S1–S3): PayTo and card PaymentIntents, the webhook that tells us money landed, refunds, and a daily
// reconcile for anything the webhook missed. The browser never decides an amount: every intent is built from the
// signed quote snapshot (or a variation row) on the server. Keys live in Vercel; the webhook signing secret is
// either STRIPE_WEBHOOK_SECRET or the one this app stored (sealed) when it registered its own endpoint.
import Stripe from "stripe";
import { db, write } from "@dfrnt/db";
import { getSetting, setSetting } from "./settings";
import { seal, unseal } from "./secret";

export type PayMethod = "payto" | "card";
export const PAY_METHODS: PayMethod[] = ["payto", "card"];
/** Stripe caps a single PayTo payment at A$10,000 (Stripe dashboard, Nov 2026). Above that: card, bank or finance. */
export const PAYTO_MAX = 10_000;
export const isOnline = (m: string | null | undefined): m is PayMethod => m === "payto" || m === "card";
export const METHOD_LABEL: Record<string, string> = { payto: "PayTo", card: "Card", bank: "Bank transfer" };
export const WEBHOOK_EVENTS = [
  "payment_intent.succeeded", "payment_intent.processing", "payment_intent.payment_failed", "payment_intent.canceled",
  "refund.created", "refund.updated", "refund.failed", "charge.refunded", "charge.dispute.created",
] as const;

const STRIPE_ACTOR = { type: "system" as const, id: "stripe" };
let client: Stripe | null = null;

export const stripeReady = () => !!process.env.STRIPE_SECRET_KEY;
export const stripeTestMode = () => /^(sk|rk)_test_/.test(process.env.STRIPE_SECRET_KEY ?? "");
export const publishableKey = () => process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";
export function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Online payment isn't switched on yet. Please pay by bank transfer.");
  return (client ??= new Stripe(key, { maxNetworkRetries: 2, appInfo: { name: "DFRNT Solar platform" } }));
}
export const cents = (aud: number) => Math.round(aud * 100);
export const dashboardUrl = (id: string) => `https://dashboard.stripe.com/${stripeTestMode() ? "test/" : ""}${id.startsWith("re_") ? "refunds" : "payments"}/${id}`;

/** Create the PaymentIntent for one payments row. Idempotent per row. */
export async function createIntent(o: { paymentId: string; amount: number; method: PayMethod; quoteId: string; token: string; email?: string | null; kind: string; description: string }) {
  const pi = await stripe().paymentIntents.create({
    amount: cents(o.amount), currency: "aud",
    allowed_payment_method_types: o.method === "payto" ? ["payto"] : ["card"],
    description: o.description.slice(0, 200),
    ...(o.email ? { receipt_email: o.email } : {}),
    metadata: { payment_id: o.paymentId, quote_id: o.quoteId, token: o.token, kind: o.kind },
  }, { idempotencyKey: `pi-${o.paymentId}` });
  await db()`update payments set provider_ref = ${pi.id}, provider_status = ${pi.status} where id = ${o.paymentId}`;
  return pi;
}

/** The client secret for a payments row, if it can still be paid. */
export async function clientSecretFor(paymentId: string): Promise<string | null> {
  const [p] = await db()`select provider_ref, status from payments where id = ${paymentId}`;
  if (!p?.provider_ref || !String(p.provider_ref).startsWith("pi_") || p.status !== "pending" || !stripeReady()) return null;
  const pi = await stripe().paymentIntents.retrieve(p.provider_ref as string);
  return ["requires_payment_method", "requires_confirmation", "requires_action"].includes(pi.status) ? pi.client_secret : null;
}

/** Cancel any unpaid online intent on this quote's system payment (when the customer changes how they pay). */
export async function releaseSystemPayment(quoteId: string) {
  const rows = await db()`select id, provider_ref, status from payments where quote_id = ${quoteId} and kind = 'system' and status in ('pending','review')`;
  if (rows.some((r) => r.status === "review")) throw new Error("Your payment is already being processed by your bank. We'll email you when it lands.");
  for (const r of rows) {
    if (r.provider_ref && String(r.provider_ref).startsWith("pi_") && stripeReady()) {
      await stripe().paymentIntents.cancel(r.provider_ref as string).catch(() => null);
    }
    await db()`update payments set status = 'failed', provider_status = 'canceled' where id = ${r.id} and status = 'pending'`;
  }
}

/* ---------- webhook ---------- */

async function webhookSecrets(): Promise<string[]> {
  const out: string[] = [];
  if (process.env.STRIPE_WEBHOOK_SECRET) out.push(process.env.STRIPE_WEBHOOK_SECRET);
  const s = await getSetting("stripe");
  if (s.webhook_secret_enc) { try { out.push(unseal(s.webhook_secret_enc)); } catch { /* key rotated */ } }
  return out;
}

export async function verifyEvent(raw: string, signature: string): Promise<Stripe.Event> {
  const secrets = await webhookSecrets();
  if (!secrets.length) throw new Error("Webhook not registered");
  let last: unknown;
  for (const sec of secrets) { try { return stripe().webhooks.constructEvent(raw, signature, sec); } catch (e) { last = e; } }
  throw last ?? new Error("Bad signature");
}

/** Ops → Payments: register (or re-register) this app's own webhook endpoint and keep the signing secret sealed. */
export async function registerWebhook(url: string, by: string) {
  const s = stripe();
  const existing = await s.webhookEndpoints.list({ limit: 100 });
  for (const e of existing.data) if (e.url === url) await s.webhookEndpoints.del(e.id);
  const ep = await s.webhookEndpoints.create({ url, enabled_events: [...WEBHOOK_EVENTS], description: "DFRNT Solar platform (registered from Ops)" });
  await setSetting("stripe", { webhook_id: ep.id, webhook_url: url, webhook_secret_enc: seal(ep.secret!), registered_at: new Date().toISOString(), livemode: ep.livemode }, by);
  return ep.id;
}

/** Handle one verified event, exactly once. */
export async function handleEvent(ev: Stripe.Event) {
  const obj = ev.data.object as { id?: string };
  const [fresh] = await db()`insert into stripe_events (id, type, object_id) values (${ev.id}, ${ev.type}, ${obj.id ?? null})
    on conflict (id) do update set received_at = now(), error = null where stripe_events.handled_at is null returning id`;   // retried until handled
  if (!fresh) return { duplicate: true };
  try {
    switch (ev.type) {
      case "payment_intent.succeeded": case "payment_intent.processing":
      case "payment_intent.payment_failed": case "payment_intent.canceled":
        await applyIntent(ev.data.object as Stripe.PaymentIntent); break;
      case "refund.created": case "refund.updated": case "refund.failed":
        await applyRefund(ev.data.object as Stripe.Refund); break;
      case "charge.refunded": {
        const ch = ev.data.object as Stripe.Charge;
        const list = await stripe().refunds.list({ charge: ch.id, limit: 20 });
        for (const r of list.data) await applyRefund(r);
        break;
      }
      case "charge.dispute.created": await openDispute(ev.data.object as Stripe.Dispute); break;
    }
    await db()`update stripe_events set handled_at = now() where id = ${ev.id}`;
  } catch (e) {
    await db()`update stripe_events set error = ${(e as Error).message.slice(0, 500)} where id = ${ev.id}`;
    throw e;
  }
  return { handled: true };
}

async function feeOf(pi: Stripe.PaymentIntent): Promise<number | null> {
  const chId = typeof pi.latest_charge === "string" ? pi.latest_charge : pi.latest_charge?.id;
  if (!chId) return null;
  try {
    const ch = await stripe().charges.retrieve(chId, { expand: ["balance_transaction"] });
    const bt = ch.balance_transaction as Stripe.BalanceTransaction | null;
    return bt && typeof bt === "object" ? bt.fee / 100 : null;
  } catch { return null; }
}

/** Bring our payments row (and the quote) in line with a PaymentIntent's state. Safe to call repeatedly. */
export async function applyIntent(pi: Stripe.PaymentIntent) {
  const [p] = await db()`select id, quote_id, kind, status, amount::float8 amount from payments where provider_ref = ${pi.id}`;
  if (!p) return;
  if (cents(p.amount as number) !== pi.amount) throw new Error(`Amount mismatch on ${pi.id}`);
  await db()`update payments set provider_status = ${pi.status} where id = ${p.id}`;
  const { getQuoteById, markPaid } = await import("./jobs");
  const q = await getQuoteById(p.quote_id as string);
  if (pi.status === "succeeded") {
    if (p.status === "received") return;
    const fee = await feeOf(pi);
    if (p.kind === "system") {
      if (q && ["payment_pending", "payment_review"].includes(q.status)) await markPaid(q, STRIPE_ACTOR);
      else {
        // Money arrived for a job that isn't waiting for it (cancelled, or marked paid by hand). Record it and raise it.
        await db()`update payments set status = 'received', received_at = now() where id = ${p.id}`;
        const { openTicket } = await import("./ops");
        await openTicket({ kind: "fault", subject: `Stripe payment on a job in state ${q?.status ?? "unknown"}`, quoteId: p.quote_id as string, name: q?.customer_name ?? undefined, email: q?.customer_email ?? undefined,
          body: `${pi.id} for ${(p.amount as number).toFixed(2)} succeeded but the job is ${q?.status ?? "missing"}. Check whether it needs a refund (Ops → Payments → the job).` }).catch(() => null);
      }
    } else {
      await write({ actor: STRIPE_ACTOR, action: "payments.receive" }, { paymentId: p.id }, async (tx) => {
        await tx`update payments set status = 'received', received_at = now() where id = ${p.id} and status <> 'received'`;
        return { entity: "payment", entityId: p.id as string, event: "payment.received", result: { kind: p.kind } };
      });
    }
    if (fee != null) await db()`update payments set fee = ${fee} where id = ${p.id}`;
  } else if (pi.status === "processing") {
    await db()`update payments set status = 'review' where id = ${p.id} and status = 'pending'`;
    if (p.kind === "system" && q?.status === "payment_pending") await setQuote(q.id, "payment_pending", "payment_review", "Payment is processing at the bank");
  } else if (pi.status === "requires_payment_method" || pi.status === "canceled") {
    // Failed attempt: the customer can try again (same intent) unless it was cancelled.
    if (pi.status === "canceled") await db()`update payments set status = 'failed' where id = ${p.id} and status in ('pending','review')`;
    else await db()`update payments set status = 'pending' where id = ${p.id} and status = 'review'`;
    if (p.kind === "system" && q?.status === "payment_review") await setQuote(q.id, "payment_review", "payment_pending", pi.last_payment_error?.message ?? "Payment didn't go through");
  }
}

async function setQuote(id: string, from: string, to: string, why: string) {
  await write({ actor: STRIPE_ACTOR, action: "payments.status", rationale: why }, { id, from, to }, async (tx) => {
    const [r] = await tx`update quotes set status = ${to}, updated_at = now() where id = ${id} and status = ${from} returning id`;
    return { entity: "quote", entityId: id, event: `quote.${to}`, result: { changed: !!r } };
  });
}

async function applyRefund(r: Stripe.Refund) {
  const status = r.status === "succeeded" ? "refunded" : r.status === "failed" || r.status === "canceled" ? "failed" : null;
  if (!status) return;
  await db()`update payments set status = ${status}, provider_status = ${r.status}, received_at = case when ${status} = 'refunded' then now() else received_at end
    where provider_ref = ${r.id} and kind = 'refund' and status = 'pending'`;
}

async function openDispute(d: Stripe.Dispute) {
  const piId = typeof d.payment_intent === "string" ? d.payment_intent : d.payment_intent?.id;
  const [p] = piId ? await db()`select quote_id from payments where provider_ref = ${piId}` : [];
  const { openTicket } = await import("./ops");
  await openTicket({ kind: "dispute", subject: `Card dispute opened: $${(d.amount / 100).toFixed(2)}`, quoteId: (p?.quote_id as string) ?? undefined,
    body: `Stripe dispute ${d.id} (${d.reason}). Respond in Stripe before ${d.evidence_details?.due_by ? new Date(d.evidence_details.due_by * 1000).toISOString().slice(0, 10) : "the due date"}: ${dashboardUrl(piId ?? d.id)}` });
}

/** Refund part or all of an online payment. The refunds row is created first; its id is the idempotency key. */
export async function refundOnline(o: { refundRowId: string; quoteId: string; amount: number }) {
  const [p] = await db()`select provider_ref, amount::float8 amount from payments where quote_id = ${o.quoteId} and kind = 'system' and status = 'received' and provider_ref like 'pi_%' order by created_at desc limit 1`;
  if (!p) throw new Error("No online payment to refund on this job; record a bank refund instead");
  if (o.amount > (p.amount as number) + 0.001) throw new Error("A card or PayTo refund can't be more than the original payment");
  const r = await stripe().refunds.create({ payment_intent: p.provider_ref as string, amount: cents(o.amount), metadata: { payment_id: o.refundRowId, quote_id: o.quoteId } },
    { idempotencyKey: `re-${o.refundRowId}` });
  await db()`update payments set provider_ref = ${r.id}, provider_status = ${r.status} where id = ${o.refundRowId}`;
  await applyRefund(r);
  return r.id;
}

/** Daily: anything the webhook missed (and stale intents on quotes that went back to "signed"). */
export async function reconcileStripe() {
  if (!stripeReady()) return { skipped: "no key" };
  const out = { checked: 0, refunds: 0, released: 0 };
  const open = await db()`select p.id, p.provider_ref, q.status qstatus from payments p join quotes q on q.id = p.quote_id
    where p.provider_ref like 'pi_%' and p.status in ('pending','review') and p.created_at < now() - interval '10 minutes' limit 50`;
  for (const p of open) {
    try {
      if (p.qstatus === "signed" || p.qstatus === "cancelled") {
        await stripe().paymentIntents.cancel(p.provider_ref as string).catch(() => null);
        await db()`update payments set status = 'failed', provider_status = 'canceled' where id = ${p.id} and status = 'pending'`;
        out.released++; continue;
      }
      await applyIntent(await stripe().paymentIntents.retrieve(p.provider_ref as string)); out.checked++;
    } catch { /* next run */ }
  }
  // Fees aren't always final when the payment lands; fill them in for the past week.
  const nofee = await db()`select id, provider_ref from payments where provider_ref like 'pi_%' and status = 'received' and coalesce(fee, 0) = 0 and created_at > now() - interval '7 days' limit 50`;
  for (const p of nofee) { try { const f = await feeOf(await stripe().paymentIntents.retrieve(p.provider_ref as string)); if (f) await db()`update payments set fee = ${f} where id = ${p.id}`; } catch { /* next run */ } }
  const refunds = await db()`select provider_ref from payments where kind = 'refund' and status = 'pending' and provider_ref like 're_%' limit 50`;
  for (const r of refunds) { try { await applyRefund(await stripe().refunds.retrieve(r.provider_ref as string)); out.refunds++; } catch { /* next run */ } }
  return out;
}
