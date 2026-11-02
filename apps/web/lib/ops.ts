// Ops back office: purchase orders (O19), refunds (O14), credits (O16), support (O15), STC receivables (O20).
import { randomBytes } from "node:crypto";
import { db, write, type Actor } from "@dfrnt/db";
import { refundRule } from "@dfrnt/engine";
import { todayAEST } from "./api";
import { advance, getQuoteById } from "./jobs";
import { pricingDataFor } from "./pricing-data";
import { queueMessage } from "./messages";

const round2 = (n: number) => Math.round(n * 100) / 100;

/* O19: one PO per supplier from the frozen parts list, at component cost */
export async function draftPOs(quoteId: string, actor: Actor) {
  const q = await getQuoteById(quoteId);
  if (!q) throw new Error("Job not found");
  if (!["booked", "awaiting_date"].includes(q.status)) throw new Error("POs are drafted once the job is paid");
  const [{ n }] = await db()`select count(*)::int n from purchase_orders where quote_id = ${quoteId} and status <> 'cancelled'` as never as [{ n: number }];
  if (n > 0) throw new Error("This job already has purchase orders");
  const data = await pricingDataFor(q.result.versions);
  const snap = q.snapshot ?? q.result;
  const bySupplier = new Map<string, { sku: string; description: string; qty: number; unit_cost: number }[]>();
  for (const b of snap.config.bom) {
    if (b.included) continue;
    const c = data.costs.items[b.sku];
    const supplier = (c as { supplier?: string } | undefined)?.supplier ?? (b.sku.startsWith("PNL-RISEN") || b.sku.startsWith("PNL-TRINA") || b.sku.startsWith("INV-GW") || b.sku.startsWith("PRT-GW") ? "OSW" : "Raystech");
    const list = bySupplier.get(supplier) ?? [];
    list.push({ sku: b.sku, description: b.description, qty: b.qty, unit_cost: c?.cost_ex_gst ?? 0 });
    bySupplier.set(supplier, list);
  }
  for (const [supplier, lines] of bySupplier) {
    const total = round2(lines.reduce((s, l) => s + l.qty * l.unit_cost, 0));
    await write({ actor, action: "purchase_orders.draft" }, { quoteId, supplier }, async (tx) => {
      const [po] = await tx`insert into purchase_orders (quote_id, supplier, lines, total_ex) values (${quoteId}, ${supplier}, ${tx.json(lines)}, ${total}) returning id, number`;
      return { entity: "purchase_order", entityId: po!.id as string, event: "po.drafted", result: { number: po!.number, supplier, total } };
    });
  }
}

export async function poStep(poId: string, to: "approved" | "sent" | "delivered" | "cancelled", actor: Actor, eta?: string) {
  const [po] = await db()`select id, quote_id, status from purchase_orders where id = ${poId}`;
  if (!po) throw new Error("PO not found");
  const order = ["draft", "approved", "sent", "delivered"];
  if (to !== "cancelled" && order.indexOf(to) !== order.indexOf(po.status as string) + 1) throw new Error(`Can't go from ${po.status} to ${to}`);
  await write({ actor, action: `purchase_orders.${to}` }, { poId, eta }, async (tx) => {
    await tx`update purchase_orders set status = ${to}, eta = coalesce(${eta ?? null}::date, eta),
      sent_at = case when ${to} = 'sent' then now() else sent_at end, delivered_at = case when ${to} = 'delivered' then now() else delivered_at end where id = ${poId}`;
    return { entity: "purchase_order", entityId: poId, event: `po.${to}`, result: { to } };
  });
  const q = await getQuoteById(po.quote_id as string);
  if (!q) return;
  if (to === "sent" && q.status === "booked") await advance(q, "gear_ordered", actor, "Purchase order sent to supplier");
  if (to === "delivered") {
    const [{ open }] = await db()`select count(*)::int open from purchase_orders where quote_id = ${q.id} and status not in ('delivered','cancelled')` as never as [{ open: number }];
    if (open === 0 && q.status === "gear_ordered") await advance(q, "delivered", actor, "All purchase orders delivered");
  }
}

/* O14: refunds recorded against the job; bank refunds are sent by ops, card and PayTo refunds go through Stripe */
export async function recordRefund(quoteId: string, amount: number, note: string, actor: Actor) {
  const q = await getQuoteById(quoteId);
  if (!q) throw new Error("Job not found");
  if (q.status !== "cancelled") throw new Error("Cancel the job first");
  const [paid] = await db()`select coalesce(sum(amount) filter (where kind in ('system','variation') and status = 'received'), 0)::float8 paid,
    coalesce(sum(amount) filter (where kind = 'refund' and status <> 'failed'), 0)::float8 refunded from payments where quote_id = ${quoteId}`;
  const maxRefund = round2((paid!.paid as number) - (paid!.refunded as number));
  if (!(amount > 0) || amount > maxRefund + 0.001) throw new Error(`Refund must be between $0.01 and ${maxRefund.toFixed(2)}`);
  const rule = q.signed_at ? refundRule(q.signed_at.toISOString().slice(0, 10), todayAEST(), "cancelled") : "full_cooling_off";
  const w = await write({ actor, action: "refunds.record", rationale: note }, { quoteId, amount }, async (tx) => {
    const [r] = await tx`insert into payments (quote_id, kind, method, amount, reference, status, refund_rule, note)
      values (${quoteId}, 'refund', ${q.payment_method ?? "bank"}, ${amount}, ${`RF${q.token.slice(0, 6).toUpperCase()}`}, 'pending', ${rule}, ${note}) returning id`;
    await tx`update stc_receivables set status = 'failed' where quote_id = ${quoteId}`;
    return { entity: "quote", entityId: quoteId, event: "refund.recorded", result: { refund_id: r!.id as string, amount } };
  });
  // S3: card and PayTo refunds go back through Stripe to the original method; the webhook marks them refunded.
  const { isOnline, stripeReady, refundOnline } = await import("./stripe");
  if (isOnline(q.payment_method) && stripeReady()) {
    try { await refundOnline({ refundRowId: w.result.refund_id, quoteId, amount }); }
    catch (e) { await db()`update payments set status = 'failed', note = ${`${note} · Stripe: ${(e as Error).message}`.slice(0, 500)} where id = ${w.result.refund_id}`; throw e; }
  }
}
export async function markRefundSent(paymentId: string, actor: Actor) {
  await write({ actor, action: "refunds.sent" }, { paymentId }, async (tx) => {
    await tx`update payments set status = 'refunded', received_at = now() where id = ${paymentId} and kind = 'refund'`;
    return { entity: "payment", entityId: paymentId, event: "refund.sent", result: { ok: true } };
  });
}

/* O16: credits */
export async function issueCredit(amount: number, reason: string, email: string | null, actor: Actor) {
  if (!(amount > 0 && amount <= 2000)) throw new Error("Credit between $1 and $2,000");
  const code = `CR${randomBytes(4).toString("hex").toUpperCase()}`;
  const expires = new Date(Date.now() + 90 * 86400_000).toISOString().slice(0, 10);
  await write({ actor, action: "credits.issue", rationale: reason }, { amount, email }, async (tx) => {
    await tx`insert into credits (code, amount_inc, reason, email, expires_on) values (${code}, ${amount}, ${reason}, ${email}, ${expires})`;
    return { entity: "credit", entityId: code, event: "credit.issued", result: { code, amount, expires } };
  });
  return code;
}

/* O15: support */
export async function openTicket(t: { kind: string; name?: string; email?: string; phone?: string; subject: string; body: string; quoteId?: string; postcode?: string }) {
  const [row] = await db()`insert into tickets (kind, name, email, phone, subject, body, quote_id, postcode)
    values (${t.kind}, ${t.name ?? null}, ${t.email ?? null}, ${t.phone ?? null}, ${t.subject}, ${t.body}, ${t.quoteId ?? null}, ${t.postcode ?? null}) returning id`;
  await db()`insert into events (type, entity, entity_id, payload) values ('ticket.opened', 'ticket', ${row!.id}, ${db().json({ kind: t.kind })})`;
  return row!.id as string;
}
export async function replyTicket(id: string, author: string, body: string, internal: boolean, close: boolean) {
  const [t] = await db()`select email, quote_id, subject from tickets where id = ${id}`;
  if (!t) throw new Error("Ticket not found");
  await db()`insert into ticket_replies (ticket_id, author, body, internal) values (${id}, ${author}, ${body}, ${internal})`;
  await db()`update tickets set status = ${close ? "closed" : internal ? "open" : "waiting"}, updated_at = now() where id = ${id}`;
  if (!internal && t.email) {
    await db()`insert into messages (quote_id, template, channel, recipient, subject, body) values (${t.quote_id}, 'SUPPORT', 'email', ${t.email}, ${`Re: ${t.subject}`}, ${body})`;
  }
}

/* O20: STC receivables */
export async function stcStep(id: string, to: "lodged" | "sold" | "paid" | "failed", actor: Actor, realised?: number, ref?: string) {
  await write({ actor, action: `stc.${to}` }, { id, realised, ref }, async (tx) => {
    await tx`update stc_receivables set status = ${to}, realised_value = coalesce(${realised ?? null}::numeric, realised_value),
      formbay_ref = coalesce(${ref ?? null}, formbay_ref), updated_at = now() where id = ${id}`;
    return { entity: "stc_receivable", entityId: id, event: `stc.${to}`, result: { to } };
  });
  const [r] = await db()`select quote_id from stc_receivables where id = ${id}`;
  const q = r ? await getQuoteById(r.quote_id as string) : null;
  if (!q) return;
  if (to === "lodged" && q.status === "installed") await advance(q, "lodged", actor, "Evidence passed and STCs lodged");
  if (to === "paid" && q.status === "lodged") await advance(q, "settled", actor, "STC cash received");
  if (to === "paid") await completeIfSettled(q.id, actor);
}

/** settled → complete once the installer has been paid in full. */
export async function completeIfSettled(quoteId: string, actor: Actor) {
  const q = await getQuoteById(quoteId);
  if (q?.status !== "settled") return;
  const [{ open }] = await db()`select count(*)::int open from pay_ledger where quote_id = ${quoteId} and status <> 'paid' and amount_ex > 0` as never as [{ open: number }];
  if (open === 0) await advance(q, "complete", actor, "STCs settled and installer paid");
}

export { queueMessage };
