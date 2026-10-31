// Job operations. Every state change goes through `write` (audited, evented, idempotent) and the engine's state machine.
import { db, write, type Actor } from "@dfrnt/db";
import {
  assertTransition, bookableDates, instantPriceBlockers, quote, rebateWindow, variationAmount, variationLine,
  labourLines, type Capacity, type ConfigInput, type JobState, type Quote, type SiteAnswers, type StandardScope, type LabourRequest,
} from "@dfrnt/engine";
import { todayAEST } from "./api";
import { queueMessage } from "./messages";
import { pricingData, pricingDataFor } from "./pricing-data";

export const SYSTEM: Actor = { type: "system", id: "app" };
export const CUSTOMER: Actor = { type: "customer", id: "record-link" };

export interface QuoteRow {
  id: string; token: string; status: JobState; title: string | null; input: ConfigInput; result: Quote; snapshot: Quote | null;
  site: SiteAnswers | null; installer_id: string | null; pricing_reasons: string[] | null; lock_until: string; install_date: string | null;
  signed_at: Date | null; signed_name: string | null; payment_method: string | null; payment_reference: string | null; paid_at: Date | null;
  customer_email: string | null; customer_name: string | null; customer_phone: string | null; postcode: string; created_at: Date;
  discount_code: string | null; referral_discount: number | null; credit_code: string | null; credit_amount: number | null;
}

export async function getQuote(token: string): Promise<QuoteRow | null> {
  const [row] = await db()`select id, token, status, title, input, result, snapshot, site, installer_id, pricing_reasons,
    lock_until::text as lock_until, install_date::text as install_date, signed_at, signed_name, payment_method, payment_reference, paid_at,
    customer_email, customer_name, customer_phone, postcode, created_at, discount_code, credit_code,
    (select amount_inc::float8 from credits c where c.code = quotes.credit_code) as credit_amount,
    (select discount_inc::float8 from codes c where c.code = quotes.discount_code and c.active) as referral_discount from quotes where token = ${token}`;
  return (row as unknown as QuoteRow) ?? null;
}

export async function getQuoteById(id: string) {
  const [row] = await db()`select token from quotes where id = ${id}`;
  return row ? getQuote(row.token as string) : null;
}

/** Re-price with the customer's real site answers, any confirmed extra labour and discounts. */
export async function reprice(q: QuoteRow, extra: { site?: SiteAnswers; extraLabour?: LabourRequest[]; bank?: boolean; variations?: ReturnType<typeof variationLine>[] } = {}) {
  const site = extra.site ?? q.site;
  const input: ConfigInput = {
    ...q.input,
    ...(site ? {
      phases: site.phases, roofType: site.roofType, storeys: site.storeys, batteryLocation: site.batteryLocation,
      againstHabitableRoom: site.againstHabitableRoom, vehicleExposure: site.vehicleExposure ?? false, priorBatteryClaim: site.priorBatteryClaim,
      postcode: site.address.postcode,
    } : {}),
  };
  const data = await pricingDataFor(q.result.versions);
  return quote(input, { ...data, asOf: todayAEST(), extraLabour: extra.extraLabour, variations: extra.variations, discounts: { ...(q.referral_discount ? { referral: q.referral_discount } : {}), ...(q.credit_amount ? { reportCredit: q.credit_amount } : {}), ...(extra.bank ? { bankTransferPct: 0.01 } : {}) } });
}

async function installerFor(postcode: string) {
  const pc = parseInt(postcode, 10);
  const [row] = await db()`select id, scope, capacity from installers where active and exists (select 1 from unnest(postcode_ranges) r where r @> ${pc}::int) order by is_test desc, created_at limit 1`;
  return row as { id: string; scope: StandardScope; capacity: Omit<Capacity, "booked"> } | undefined;
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
export async function submitSite(q: QuoteRow, site: SiteAnswers, contact: { name: string; email: string; phone: string }) {
  if (!["saved", "secured", "lapsed"].includes(q.status)) throw new Error("This quote has already been priced");
  if (q.status === "saved" || q.status === "lapsed") { await move(q, "secured", CUSTOMER, "quotes.secure"); q = (await getQuote(q.token))!; }
  const inst = await installerFor(site.address.postcode);
  const priced = await reprice(q, { site });
  const reasons = inst ? instantPriceBlockers(site, inst.scope) : ["No installer covers this postcode yet"];
  if (!priced.config.ok) reasons.push(...priced.config.blockers.map((b) => b.message));
  const common = {
    site: db().json(site as never), customer_name: contact.name, customer_email: contact.email, customer_phone: contact.phone,
    installer_id: inst?.id ?? null, scope_version: inst?.scope.version ?? null,
  };
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
  const extraLabour = extraCodes.filter(Boolean).map((code) => ({ code }));
  const p = await reprice(q, { extraLabour });
  await freezePrice(q, p, actor, note || (extraCodes.length ? `Installer added ${extraCodes.join(", ")}` : "Installer confirmed standard price"));
}

/* D2: sign the agreement */
export async function sign(q: QuoteRow, name: string) {
  if (q.status !== "priced") throw new Error("Nothing to sign");
  if (q.lock_until < todayAEST()) { await move(q, "lapsed", SYSTEM, "quotes.lapse", {}, "Lock expired before signing"); throw new Error("This price has expired. Secure it again at today's price."); }
  await move(q, "signed", CUSTOMER, "quotes.sign", { signed_at: new Date(), signed_name: name });
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
  await queueMessage("M3", q.token, q.customer_email, { name: q.customer_name });
}

/* E1: dates offered from installer capacity, inside the rebate window */
export async function availableDates(q: QuoteRow) {
  if (!q.installer_id) return [];
  const [inst] = await db()`select capacity from installers where id = ${q.installer_id}`;
  const booked = await db()`select install_date::text as d, count(*)::int as n from quotes
    where installer_id = ${q.installer_id} and install_date is not null and status in ('booked','gear_ordered','delivered','on_site','variation_pending') group by 1`;
  const cap = { ...(inst!.capacity as Omit<Capacity, "booked">), booked: Object.fromEntries(booked.map((r) => [r.d, r.n])) };
  const created = q.created_at.toISOString().slice(0, 10);
  return bookableDates(todayAEST(), cap, rebateWindow(created, (await pricingDataFor(q.result.versions)).rebates).window_end, 0, 15);
}

export async function book(q: QuoteRow, date: string) {
  if (q.status !== "awaiting_date") throw new Error("Not ready to book");
  if (!(await availableDates(q)).includes(date)) throw new Error("That date is no longer available");
  await move(q, "booked", CUSTOMER, "jobs.book", { install_date: date, slot_hold_until: null });
  if (q.installer_id) await db()`insert into pay_ledger (installer_id, quote_id, description, amount_ex)
    values (${q.installer_id}, ${q.id}, 'Installation (frozen at pricing)', ${(q.snapshot ?? q.result).stack.installer_pay_ex_gst})`;
  await queueMessage("M4", q.token, q.customer_email, { name: q.customer_name, date });
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
