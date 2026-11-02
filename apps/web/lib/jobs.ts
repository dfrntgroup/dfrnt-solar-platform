// Job operations. Every state change goes through `write` (audited, evented, idempotent) and the engine's state machine.
import { db, write, type Actor } from "@dfrnt/db";
import {
  assertTransition, autoStacks, instantPriceBlockers, quote, rebateWindow, variationAmount, variationLine,
  labourLines, type ConfigInput, type JobState, type Quote, type SiteAnswers, type StandardScope, type LabourRequest,
} from "@dfrnt/engine";
import { todayAEST } from "./api";
import { queueMessage } from "./messages";
import { pricingData, pricingDataFor } from "./pricing-data";

export const SYSTEM: Actor = { type: "system", id: "app" };
export const CUSTOMER: Actor = { type: "customer", id: "record-link" };

import { AGREEMENT_VERSION } from "./legal";
export interface QuoteRow {
  id: string; token: string; status: JobState; title: string | null; input: ConfigInput; result: Quote; snapshot: Quote | null;
  site: SiteAnswers | null; installer_id: string | null; pricing_reasons: string[] | null; lock_until: string; install_date: string | null;
  signed_at: Date | null; signed_name: string | null; agreement_version: string | null; invoice_number: string | null; payment_method: string | null; payment_reference: string | null; paid_at: Date | null;
  customer_email: string | null; customer_name: string | null; customer_phone: string | null; postcode: string; created_at: Date;
  discount_code: string | null; referral_discount: number | null; credit_code: string | null; credit_amount: number | null;
  site_draft: (Partial<SiteAnswers> & { address?: SiteAnswers["address"] }) | null; checkout_at: Date | null; design_review: boolean; design_fee_status: string | null;
  revision: Revision | null; chosen_installer_id: string | null;
  heard_from: string | null; heard_note: string | null; serials: { serial: string; kind?: string; model?: string }[] | null; commissioned_on: string | null;
  warranty: Record<string, { registered_at?: string; by?: string; ref?: string }> | null; attribution: Record<string, string> | null;
  crew_id: string | null; job_days: number | null; install_part: string | null; booked_via: string | null; booked_at: Date | null;
  decline_until: Date | null; google_event_id: string | null; rebook: boolean; access_notes: string | null; desk_called_at: Date | null; desk_notes: string | null;
}

/** C6: a design change proposed by ops or the installer, priced on the same locked versions, waiting for the customer. */
export interface Revision {
  input: ConfigInput; base: Quote; priced: Quote; extraCodes: string[]; reason: string; by: string; at: string;
  from: { summary: string; amount: number; title: string | null }; title: string;
}

export async function getQuote(token: string): Promise<QuoteRow | null> {
  const [row] = await db()`select id, token, status, title, input, result, snapshot, site, installer_id, pricing_reasons,
    lock_until::text as lock_until, install_date::text as install_date, signed_at, signed_name, agreement_version, invoice_number, payment_method, payment_reference, paid_at,
    customer_email, customer_name, customer_phone, postcode, created_at, discount_code, credit_code,
    site_draft, checkout_at, design_review, design_fee_status, revision, chosen_installer_id,
    heard_from, heard_note, serials, commissioned_on::text as commissioned_on, warranty, attribution, crew_id, job_days::float8 as job_days, install_part, booked_via, booked_at, decline_until, google_event_id, rebook, access_notes, desk_called_at, desk_notes,
    (select amount_inc::float8 from credits c where c.code = quotes.credit_code) as credit_amount,
    (select discount_inc::float8 from codes c where c.code = quotes.discount_code and c.active) as referral_discount from quotes where token = ${token}`;
  return (row as unknown as QuoteRow) ?? null;
}

export async function getQuoteById(id: string) {
  const [row] = await db()`select token from quotes where id = ${id}`;
  return row ? getQuote(row.token as string) : null;
}

/** Re-price with the customer's real site answers, any confirmed extra labour and discounts. */
export async function reprice(q: QuoteRow, extra: { site?: SiteAnswers; input?: ConfigInput; extraLabour?: LabourRequest[]; bank?: boolean; variations?: ReturnType<typeof variationLine>[] } = {}) {
  const site = extra.site ?? q.site;
  const input: ConfigInput = {
    ...(extra.input ?? q.input),
    ...(site ? {
      phases: site.phases, roofType: site.roofType, storeys: site.storeys, batteryLocation: site.batteryLocation,
      againstHabitableRoom: site.againstHabitableRoom, vehicleExposure: site.vehicleExposure ?? false, priorBatteryClaim: site.priorBatteryClaim,
      postcode: site.address.postcode,
    } : {}),
  };
  const data = await pricingDataFor(q.result.versions);
  const { contractAddonLines } = await import("./addons");
  const addons = await contractAddonLines(q.id, data.margins).catch(() => []);
  return quote(input, { ...data, asOf: todayAEST(), extraLabour: extra.extraLabour, variations: [...(extra.variations ?? []), ...addons], discounts: { ...(q.referral_discount ? { referral: q.referral_discount } : {}), ...(q.credit_amount ? { reportCredit: q.credit_amount } : {}), ...(extra.bank ? { bankTransferPct: 0.01 } : {}) } });
}

/** The installer for a job: the customer's choice if it covers the postcode and can do this job (C7, scheduling "who"),
 *  otherwise the first real installer who can, then a test one. */
async function installerFor(q: QuoteRow, site: SiteAnswers) {
  const pc = parseInt(site.address.postcode, 10);
  const rows = await db()`select id, scope, capacity, profile from installers where active and exists (select 1 from unnest(postcode_ranges) r where r @> ${pc}::int)
    order by (id::text = ${q.chosen_installer_id ?? ""}) desc, is_test, created_at`;
  const { profileOf, needsOf } = await import("./schedule");
  const { cannotDo } = await import("@dfrnt/engine");
  const needs = needsOf({ ...q, site });
  const row = rows.find((r) => !cannotDo(profileOf(r as never), needs).length);
  return row as { id: string; scope: StandardScope } | undefined;
}

async function move(q: QuoteRow, to: JobState, actor: Actor, action: string, set: Record<string, unknown> = {}, rationale?: string, payload?: Record<string, unknown>) {
  assertTransition(q.status, to);
  return write({ actor, action, rationale }, { token: q.token, to, ...set }, async (tx) => {
    const fields = { ...set, status: to, updated_at: new Date() };
    const [row] = await tx`update quotes set ${tx(fields as unknown as Record<string, never>)} where id = ${q.id} and status = ${q.status} returning id`;
    if (!row) throw new Error("Quote changed while you were working; reload and try again");
    return { entity: "quote", entityId: q.id, event: `quote.${to}`, result: { from: q.status, to }, payload };
  });
}

/* C1–C3: home + photos → instant price or installer pricing */
export async function submitSite(q: QuoteRow, site: SiteAnswers, contact: { name: string; email: string; phone: string }, opts: { feePaid?: boolean } = {}) {
  if (!["saved", "secured", "lapsed"].includes(q.status)) throw new Error("This quote has already been priced");
  if (q.status === "saved" || q.status === "lapsed") { await move(q, "secured", CUSTOMER, "quotes.secure"); q = (await getQuote(q.token))!; }
  const inst = await installerFor(q, site);
  const priced = await reprice(q, { site });
  const reasons = inst ? instantPriceBlockers(site, inst.scope) : ["No installer covers this postcode yet"];
  if (!priced.config.ok) reasons.push(...priced.config.blockers.map((b) => b.message));
  // C8: standard homes are priced instantly and free. A home that needs an installer's photo check can carry a design-check fee,
  // but only when ops switches it on; the fee comes back as a credit on purchase.
  if (reasons.length && inst && q.design_fee_status !== "paid" && !opts.feePaid) {
    const { getSetting } = await import("./settings");
    const dc = await getSetting("design_check");
    if (dc.fee_on) {
      const reference = `DSD${q.token.slice(0, 5).toUpperCase()}`;
      await db()`update quotes set site_draft = ${db().json(site as never)}, design_fee_status = 'due', pricing_reasons = ${reasons}, updated_at = now() where id = ${q.id}`;
      await db()`insert into payments (quote_id, kind, method, amount, reference) select ${q.id}, 'report', 'bank', ${dc.amount}, ${reference}
        where not exists (select 1 from payments where quote_id = ${q.id} and kind = 'report' and status = 'pending')`;
      await queueMessage("M15", q.token, contact.email, { name: contact.name, amount: dc.amount, reference });
      return;
    }
  }
  const common = {
    site: db().json(site as never), customer_name: contact.name, customer_email: contact.email, customer_phone: contact.phone,
    installer_id: inst?.id ?? null, scope_version: inst?.scope.version ?? null, design_review: reasons.length > 0,
  };
  { const { trackConversion } = await import("./conversions"); await trackConversion(q.id, "SubmitApplication", priced.stack.amount_payable); }
  if (!reasons.length) {
    await move(q, "pricing_instant", CUSTOMER, "quotes.submit_site", common);
    q = (await getQuote(q.token))!;
    await freezePrice(q, priced, SYSTEM, "Instant price: site inside the installer's standard scope");
  } else {
    await move(q, "pricing_installer", CUSTOMER, "quotes.submit_site", { ...common, pricing_reasons: reasons }, undefined, { reasons });
    await queueMessage("M1", q.token, contact.email, { name: contact.name });
  }
}

/** Freeze the priced snapshot (v2) that D1, the invoice and installer pay all read. */
async function freezePrice(q: QuoteRow, p: Quote, actor: Actor, rationale: string) {
  await move(q, "priced", actor, "quotes.price", {
    snapshot: db().json(p as never), priced_at: new Date(), amount_payable: p.stack.amount_payable, price_inc_gst: p.stack.price_inc_gst,
    stcs: p.stack.stcs, checkout_allowed: p.checkout_allowed, pricing_reasons: null,
  }, rationale, { amount_payable: p.stack.amount_payable });
  await queueMessage("M2", q.token, q.customer_email, { name: q.customer_name, amount: p.stack.amount_payable });
}

/* I2: installer confirms price, optionally adding named lines from the menu */
export async function installerPrice(q: QuoteRow, actor: Actor, extraCodes: string[], note?: string) {
  if (q.status !== "pricing_installer" && q.status !== "tech_review") throw new Error("Not waiting for a price");
  // "CODE" or "CODE:qty" (per-metre / per-km items carry a quantity)
  const extraLabour = extraCodes.filter(Boolean).map((c) => { const [code, q] = c.split(":"); return { code: code!, qty: Math.min(500, Math.max(1, Math.round(Number(q) || 1))) }; });
  const p = await reprice(q, { extraLabour });
  await freezePrice(q, p, actor, note || (extraCodes.length ? `Installer added ${extraCodes.map((c) => c.replace(":", " × ")).join(", ")}` : "Installer confirmed standard price"));
}

/* D2: sign the agreement */
export async function sign(q: QuoteRow, name: string) {
  if (q.status !== "priced") throw new Error("Nothing to sign");
  if (q.lock_until < todayAEST()) { await move(q, "lapsed", SYSTEM, "quotes.lapse", {}, "Lock expired before signing"); throw new Error("This price has expired. Secure it again at today's price."); }
  await move(q, "signed", CUSTOMER, "quotes.sign", { signed_at: new Date(), signed_name: name, agreement_version: AGREEMENT_VERSION });
  { const { trackConversion } = await import("./conversions"); await trackConversion(q.id, "SignedAgreement", (q.snapshot ?? q.result).stack.amount_payable); }
}

/* D3/D4b: bank transfer (card switches on with Stripe at go-live) */
export async function chooseBank(q: QuoteRow) {
  if (q.status !== "signed") throw new Error("Sign first");
  const p = await reprice(q, { bank: true, extraLabour: extraFromSnapshot(q) });
  const reference = `DS${q.token.slice(0, 6).toUpperCase()}`;
  await write({ actor: CUSTOMER, action: "payments.create" }, { token: q.token, method: "bank" }, async (tx) => {
    const [pay] = await tx`insert into payments (quote_id, kind, method, amount, reference) values (${q.id}, 'system', 'bank', ${p.stack.amount_payable}, ${reference}) returning id`;
    await tx`update quotes set status = 'payment_pending', payment_method = 'bank', payment_reference = ${reference}, snapshot = ${tx.json(p as never)},
      amount_payable = ${p.stack.amount_payable}, updated_at = now() where id = ${q.id} and status = 'signed'`;
    return { entity: "quote", entityId: q.id, event: "quote.payment_pending", result: { payment_id: pay!.id, amount: p.stack.amount_payable, reference } };
  });
}

/* S1: PayTo or card through Stripe. Amount comes from the signed snapshot; PayTo gets the bank price. */
export async function startOnlinePayment(q: QuoteRow, method: "payto" | "card") {
  if (q.status !== "signed") throw new Error("Sign first");
  const { stripeReady, createIntent } = await import("./stripe");
  if (!stripeReady()) throw new Error("Online payment isn't switched on yet. Please pay by bank transfer.");
  const p = await reprice(q, { bank: method === "payto", extraLabour: extraFromSnapshot(q) });
  const { PAYTO_MAX } = await import("./stripe");
  if (method === "payto" && p.stack.amount_payable > PAYTO_MAX) throw new Error("PayTo is limited to $10,000 per payment. Please pay by card or bank transfer.");
  const reference = `DS${q.token.slice(0, 6).toUpperCase()}`;
  const paymentId = await write({ actor: CUSTOMER, action: "payments.create" }, { token: q.token, method }, async (tx) => {
    const [pay] = await tx`insert into payments (quote_id, kind, method, amount, reference) values (${q.id}, 'system', ${method}, ${p.stack.amount_payable}, ${reference}) returning id`;
    const [row] = await tx`update quotes set status = 'payment_pending', payment_method = ${method}, payment_reference = ${reference}, snapshot = ${tx.json(p as never)},
      amount_payable = ${p.stack.amount_payable}, updated_at = now() where id = ${q.id} and status = 'signed' returning id`;
    if (!row) throw new Error("Quote changed while you were working; reload and try again");
    return { entity: "quote", entityId: q.id, event: "quote.payment_pending", result: { payment_id: pay!.id as string, amount: p.stack.amount_payable, method } };
  }).then((r) => r.result.payment_id);
  try {
    await createIntent({ paymentId, amount: p.stack.amount_payable, method, quoteId: q.id, token: q.token, email: q.customer_email, kind: "system",
      description: `DFRNT Solar ${reference} — ${q.title ?? "solar and battery system"}` });
  } catch (e) {
    // Couldn't reach Stripe: put the customer back at "how would you like to pay" rather than a dead form.
    console.error("stripe intent", (e as Error).message);
    await db()`update payments set status = 'failed', provider_status = 'create_failed' where id = ${paymentId}`;
    await db()`update quotes set status = 'signed', payment_method = null, updated_at = now() where id = ${q.id} and status = 'payment_pending'`;
    throw new Error(`We couldn't start the ${method === "payto" ? "PayTo" : "card"} payment just now. Please try again, or pay by bank transfer.`);
  }
}

/* Change how I pay: back to "signed" so the customer can choose again (cancels an unpaid online intent). */
export async function changePayment(q: QuoteRow) {
  if (q.status !== "payment_pending") throw new Error("Nothing to change");
  const { releaseSystemPayment } = await import("./stripe");
  await releaseSystemPayment(q.id);
  await db()`update payments set status = 'failed' where quote_id = ${q.id} and kind = 'system' and status = 'pending'`;
  await move(q, "signed", CUSTOMER, "payments.change", { payment_method: null });
}

/* S4: finance link-out. The lender pays us; Ops marks it paid when they confirm. */
export async function chooseFinance(q: QuoteRow, providerId: string) {
  if (q.status !== "signed") throw new Error("Sign first");
  const { getSetting } = await import("./settings");
  const fp = (await getSetting("finance")).providers.find((x) => x.id === providerId && x.on && x.url);
  if (!fp) throw new Error("That finance option isn't available");
  const p = await reprice(q, { extraLabour: extraFromSnapshot(q) });
  const reference = `DS${q.token.slice(0, 6).toUpperCase()}`;
  await write({ actor: CUSTOMER, action: "payments.create" }, { token: q.token, method: `finance:${fp.id}` }, async (tx) => {
    await tx`insert into payments (quote_id, kind, method, amount, reference) values (${q.id}, 'system', ${`finance:${fp.id}`}, ${p.stack.amount_payable}, ${reference})`;
    await tx`update quotes set status = 'payment_pending', payment_method = ${`finance:${fp.id}`}, payment_reference = ${reference}, snapshot = ${tx.json(p as never)},
      amount_payable = ${p.stack.amount_payable}, updated_at = now() where id = ${q.id} and status = 'signed'`;
    return { entity: "quote", entityId: q.id, event: "quote.payment_pending", result: { method: fp.id } };
  });
}
export const financeLink = (url: string, ref: string, amount: number) =>
  url.replaceAll("{ref}", encodeURIComponent(ref)).replaceAll("{amount}", amount.toFixed(2));

/* S3: pay an approved variation or add-on online. */
export async function payVariationOnline(q: QuoteRow, paymentId: string, method: "payto" | "card") {
  const [v] = await db()`select id, amount::float8 amount, status, provider_ref, reference from payments where id = ${paymentId} and quote_id = ${q.id} and kind = 'variation'`;
  if (!v || v.status !== "pending") throw new Error("Nothing to pay");
  if (method === "payto" && (v.amount as number) > 10_000) throw new Error("PayTo is limited to $10,000 per payment. Please pay by card.");
  const { stripeReady, createIntent, stripe } = await import("./stripe");
  if (!stripeReady()) throw new Error("Online payment isn't switched on yet. Please pay by bank transfer.");
  if (v.provider_ref) await stripe().paymentIntents.cancel(v.provider_ref as string).catch(() => null);
  const [fresh] = await db()`insert into payments (quote_id, variation_id, kind, method, amount, reference)
    select quote_id, variation_id, kind, ${method}, amount, reference from payments where id = ${paymentId} returning id`;
  await db()`update payments set status = 'failed', provider_status = 'replaced' where id = ${paymentId}`;
  await createIntent({ paymentId: fresh!.id as string, amount: v.amount as number, method, quoteId: q.id, token: q.token, email: q.customer_email, kind: "variation",
    description: `DFRNT Solar ${v.reference} — change to your install` });
  return fresh!.id as string;
}

export const extraLabourOf = (q: QuoteRow) => extraFromSnapshot(q);
/** Installation lines the installer added at pricing (anything beyond the configuration's own triggers). */
function extraFromSnapshot(q: QuoteRow): LabourRequest[] {
  const base = new Set(q.result.stack.lines.filter((l) => l.kind === "installation").map((l) => l.code));
  return (q.snapshot?.stack.lines ?? []).filter((l) => l.kind === "installation" && !base.has(l.code)).map((l) => ({ code: l.code, qty: l.qty }));
}

/* Ops: funds received → awaiting_date (D5) */
export async function markPaid(q: QuoteRow, actor: Actor) {
  if (!["payment_pending", "payment_review"].includes(q.status)) throw new Error("Not awaiting payment");
  await db()`update payments set status = 'received', received_at = now() where quote_id = ${q.id} and kind = 'system' and status in ('pending','review')`;
  await move(q, "awaiting_date", actor, "payments.receive", { paid_at: new Date(), slot_hold_until: new Date(Date.now() + 48 * 3600_000) }, "Funds matched to reference");
  // Tax invoice number is issued at the moment payment is received.
  await db()`update quotes set invoice_number = 'INV-' || nextval('invoice_seq') where id = ${q.id} and invoice_number is null`;
  await queueMessage("M3", q.token, q.customer_email, { name: q.customer_name });
  { const { trackConversion } = await import("./conversions"); await trackConversion(q.id, "Purchase", (q.snapshot ?? q.result).stack.amount_payable); }
  const { requestOffer } = await import("./schedule");
  await requestOffer((await getQuote(q.token))!).catch(() => null);   // installer not on a live calendar: ask them for days
}

/* Stage moves by ops / installer (O2, I4) */
export async function advance(q: QuoteRow, to: JobState, actor: Actor, rationale: string) {
  await move(q, to, actor, "jobs.advance", {}, rationale);
  if (to === "installed") {
    const st = (q.snapshot ?? q.result);
    await db()`insert into stc_receivables (quote_id, solar_stcs, battery_stcs, expected_value) values (${q.id}, ${st.rebate.solar_stcs}, ${st.rebate.battery_stcs}, ${st.stack.less_stcs}) on conflict do nothing`;
    await db()`update pay_ledger set status = 'eligible' where quote_id = ${q.id} and status = 'accrued'`;
    if (q.discount_code) await db()`insert into payouts (code, quote_id, amount, status) select code, ${q.id}, reward, 'eligible' from codes where code = ${q.discount_code} on conflict do nothing`;
    const first = (q.customer_name ?? "FRIEND").split(" ")[0]!.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 8) || "FRIEND";
    await db()`insert into codes (code, kind, owner_quote_id) values (${`${first}${q.token.slice(0, 4).toUpperCase()}`}, 'referral', ${q.id}) on conflict do nothing`;
    await queueMessage("M6", q.token, q.customer_email, { name: q.customer_name });
  }
}

/* D6: variation after payment */
export async function raiseVariation(q: QuoteRow, actor: Actor, code: string, description: string, installerCostEx?: number) {
  if (!["booked", "gear_ordered", "delivered", "on_site"].includes(q.status)) throw new Error("Variations are raised after payment and before install");
  const { menu, margins } = await pricingData();
  const item = menu.items.find((i) => i.code === code);
  const line = installerCostEx != null ? variationLine(code, description, installerCostEx, margins)
    : labourLines([{ code }], { kw: 0, panels: 0 }, { kind: "variation", menu, margins })[0];
  if (!line || line.sell_ex_gst == null) throw new Error("Unknown variation; give an installer cost");
  const amt = variationAmount(line);
  await write({ actor, action: "variations.raise" }, { token: q.token, code, description, installerCostEx }, async (tx) => {
    const [v] = await tx`insert into variations (quote_id, code, description, installer_cost_ex, sell_ex, gst, sell_inc, raised_by)
      values (${q.id}, ${code}, ${description || item?.description || code}, ${line.cost_ex_gst}, ${amt.ex_gst}, ${amt.gst}, ${amt.inc_gst}, ${actor.id}) returning id`;
    if (q.status === "on_site") await tx`update quotes set status = 'variation_pending', updated_at = now() where id = ${q.id}`;
    return { entity: "quote", entityId: q.id, event: "variation.raised", result: { variation_id: v!.id, ...amt } };
  });
  await queueMessage("M8", q.token, q.customer_email, { name: q.customer_name, amount: amt.inc_gst });
}

export async function decideVariation(q: QuoteRow, variationId: string, approve: boolean) {
  await write({ actor: CUSTOMER, action: approve ? "variations.approve" : "variations.decline" }, { token: q.token, variationId }, async (tx) => {
    const [v] = await tx`update variations set status = ${approve ? "approved" : "declined"}, decided_at = now()
      where id = ${variationId} and quote_id = ${q.id} and status = 'proposed' returning id, sell_inc, installer_cost_ex, description`;
    if (!v) throw new Error("Variation not found");
    if (approve) {
      await tx`insert into payments (quote_id, variation_id, kind, method, amount, reference) values (${q.id}, ${variationId}, 'variation', 'bank', ${v.sell_inc}, ${`DSV${q.token.slice(0, 5).toUpperCase()}`})`;
      if (q.installer_id) await tx`insert into pay_ledger (installer_id, quote_id, variation_id, description, amount_ex) values (${q.installer_id}, ${q.id}, ${variationId}, ${`Variation: ${v.description}`}, ${v.installer_cost_ex})`;
    }
    if (q.status === "variation_pending") await tx`update quotes set status = 'on_site', updated_at = now() where id = ${q.id}`;
    return { entity: "quote", entityId: q.id, event: approve ? "variation.approved" : "variation.declined", result: { variationId } };
  });
}

/* D7: cancellation (refund handled by ops; Stripe refunds switch on at go-live) */
export async function cancel(q: QuoteRow, actor: Actor, reason: string) {
  await move(q, "cancelled", actor, "jobs.cancel", { cancelled_at: new Date(), cancel_reason: reason, install_date: null }, reason);
  if (q.install_date) {
    const { offerEarlier } = await import("./schedule");
    const { removeEvent } = await import("./google");
    if (q.crew_id && q.google_event_id) {
      const [c] = await db()`select dfrnt_calendar_id from installer_crews where id = ${q.crew_id}`;
      if (c?.dfrnt_calendar_id) for (const id of q.google_event_id.split(",")) await removeEvent(q.crew_id, c.dfrnt_calendar_id as string, id);
    }
    await offerEarlier(q.installer_id, q.crew_id, q.install_date, q.id).catch(() => 0);
  }
  await db()`update pay_ledger set status = 'accrued', amount_ex = 0 where quote_id = ${q.id} and status in ('accrued','eligible')`;
  await queueMessage("M7", q.token, q.customer_email, { name: q.customer_name });
}

/* Referral / creator code: $250 off before GST; the referrer is paid after this job is installed. */
export async function applyCode(q: QuoteRow, raw: string) {
  if (!["secured", "pricing_installer", "priced"].includes(q.status)) throw new Error("Codes can be added before you sign");
  const code = raw.trim().toUpperCase();
  const [credit] = await db()`select code from credits where code = ${code} and status = 'issued' and expires_on >= current_date`;
  if (credit) {
    await write({ actor: CUSTOMER, action: "quotes.apply_credit" }, { token: q.token, code }, async (tx) => {
      await tx`update quotes set credit_code = ${code}, updated_at = now() where id = ${q.id}`;
      await tx`update credits set status = 'applied', applied_quote_id = ${q.id} where code = ${code}`;
      return { entity: "quote", entityId: q.id, event: "quote.credit_applied", result: { code } };
    });
    return repriceFrozen(q);
  }
  const [c] = await db()`select code, owner_quote_id from codes where code = ${code} and active`;
  if (!c) throw new Error("That code isn't valid");
  if (c.owner_quote_id === q.id) throw new Error("You can't use your own code");
  await write({ actor: CUSTOMER, action: "quotes.apply_code" }, { token: q.token, code }, async (tx) => {
    await tx`update quotes set discount_code = ${code}, updated_at = now() where id = ${q.id}`;
    return { entity: "quote", entityId: q.id, event: "quote.code_applied", result: { code } };
  });
  await repriceFrozen(q);
}

async function repriceFrozen(q: QuoteRow) {
  if (q.status !== "priced") return;
  const fresh = (await getQuote(q.token))!;
  const p = await reprice(fresh, { extraLabour: extraFromSnapshot(fresh) });
  await db()`update quotes set snapshot = ${db().json(p as never)}, amount_payable = ${p.stack.amount_payable}, price_inc_gst = ${p.stack.price_inc_gst} where id = ${q.id}`;
}

/* C8: design-check fee received (only when the $99 switch is on) → credit for the same amount, then on to the installer. */
export async function designFeePaid(q: QuoteRow, actor: Actor) {
  if (q.design_fee_status !== "due" || !q.site_draft) throw new Error("No design-check fee is due on this job");
  const [pay] = await db()`update payments set status = 'received', received_at = now() where quote_id = ${q.id} and kind = 'report' and status = 'pending' returning amount::float8 amount`;
  const amount = (pay?.amount as number) ?? 99;
  const code = `DESIGN${q.token.slice(0, 5).toUpperCase()}`;
  await write({ actor, action: "payments.design_fee", rationale: "Design-check fee received; credited back on purchase" }, { token: q.token, amount }, async (tx) => {
    await tx`insert into credits (code, amount_inc, reason, email, status, applied_quote_id, expires_on)
      values (${code}, ${amount}, 'Design check fee, credited on purchase', ${q.customer_email}, 'applied', ${q.id}, current_date + 180) on conflict (code) do nothing`;
    await tx`update quotes set design_fee_status = 'paid', credit_code = ${code}, updated_at = now() where id = ${q.id}`;
    return { entity: "quote", entityId: q.id, event: "quote.design_fee_paid", result: { code, amount } };
  });
  const fresh = (await getQuote(q.token))!;
  await submitSite(fresh, fresh.site_draft as SiteAnswers, { name: fresh.customer_name ?? "", email: fresh.customer_email ?? "", phone: fresh.customer_phone ?? "" }, { feePaid: true });
}

/* C6: revised design. Ops or the installer changes panels, battery modules, backup or adds named work; the change is priced on the
   job's own locked versions and rebate date, and the customer accepts or keeps the original. */
export const REVISABLE: JobState[] = ["pricing_installer", "tech_review", "priced"];

export async function proposeRevision(q: QuoteRow, actor: Actor, change: { panels: number; modules: number; backup: "none" | "whole_home"; extraCodes: string[]; reason: string }) {
  if (!REVISABLE.includes(q.status)) throw new Error("A design can be changed while pricing, or once priced before signing");
  if (change.reason.trim().length < 5) throw new Error("Say why the design changes (the customer sees this)");
  const data = await pricingDataFor(q.result.versions);
  const panelsChanged = change.panels !== q.input.panelCount;
  const next = { ...q.input, panelCount: q.input.panelCount > 0 ? change.panels : 0, batteryModules: change.modules, backup: change.backup,
    ...(panelsChanged ? { inverterSku: undefined, preferInverterSku: (q.input as { preferInverterSku?: string }).preferInverterSku } : {}) } as ConfigInput;
  const stacks = autoStacks(next, data.rules);
  const input = { ...next, stacks: stacks ?? next.stacks } as ConfigInput;
  const base = quote(input, { ...data, asOf: todayAEST() });
  if (!base.config.ok) throw new Error(`That design doesn't work: ${base.config.blockers.map((b) => b.message).join("; ")}`);
  const keep = extraFromSnapshot(q).filter((l) => !change.extraCodes.includes(l.code));
  const priced = await reprice(q, { input, extraLabour: [...keep, ...change.extraCodes.filter(Boolean).map((code) => ({ code }))] });
  const from = q.snapshot ?? q.result;
  const brand = (q.title ?? "").split(" · ")[0] || "System";
  const rev: Revision = {
    input, base, priced, extraCodes: change.extraCodes, reason: change.reason.trim().slice(0, 500), by: `${actor.type}:${actor.id}`, at: new Date().toISOString(),
    from: { summary: from.config.summary, amount: from.stack.amount_payable, title: q.title },
    title: `${brand} · ${base.config.panel_kw ? `${base.config.panel_kw} kW solar + ` : ""}${base.config.usable_kwh} kWh battery${change.backup === "whole_home" ? " + whole-home backup" : ""}`,
  };
  await write({ actor, action: "quotes.propose_revision", rationale: rev.reason }, { token: q.token, change }, async (tx) => {
    await tx`update quotes set revision = ${tx.json(rev as never)}, updated_at = now() where id = ${q.id}`;
    return { entity: "quote", entityId: q.id, event: "quote.revision_proposed", result: { from: rev.from.amount, to: priced.stack.amount_payable } };
  });
  await queueMessage("M14", q.token, q.customer_email, { name: q.customer_name, amount: priced.stack.amount_payable, was: rev.from.amount });
}

export async function answerRevision(q: QuoteRow, accept: boolean) {
  const rev = q.revision;
  if (!rev) throw new Error("There's no change waiting");
  if (!REVISABLE.includes(q.status)) throw new Error("This job has moved on; call us to change the design");
  if (!accept) {
    await write({ actor: CUSTOMER, action: "quotes.decline_revision" }, { token: q.token }, async (tx) => {
      await tx`update quotes set revision = null, updated_at = now() where id = ${q.id}`;
      return { entity: "quote", entityId: q.id, event: "quote.revision_declined", result: {} };
    });
    return;
  }
  await write({ actor: CUSTOMER, action: "quotes.accept_revision" }, { token: q.token }, async (tx) => {
    await tx`update quotes set input = ${tx.json(rev.input as never)}, result = ${tx.json(rev.base as never)}, title = ${rev.title}, revision = null, updated_at = now() where id = ${q.id}`;
    return { entity: "quote", entityId: q.id, event: "quote.revision_accepted", result: { amount: rev.priced.stack.amount_payable } };
  });
  const fresh = (await getQuote(q.token))!;
  if (fresh.status === "priced") {
    await db()`update quotes set snapshot = ${db().json(rev.priced as never)}, amount_payable = ${rev.priced.stack.amount_payable}, price_inc_gst = ${rev.priced.stack.price_inc_gst}, stcs = ${rev.priced.stack.stcs} where id = ${q.id}`;
  } else {
    await freezePrice(fresh, rev.priced, CUSTOMER, `Customer accepted the revised design: ${rev.reason}`);
  }
}
