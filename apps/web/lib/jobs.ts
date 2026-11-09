// Job operations. Every state change goes through transition() (lib/transition.ts): asserted against the engine's machine, owned
// by the action that does the work, audited, evented with from/to. Nothing in this file writes quotes.status directly.
import { db, write, type Actor } from "@dfrnt/db";
import {
  autoStacks, instantPriceBlockers, isManualEdge, JOB_SETS, QUOTE, quote, rebateWindow, variationAmount, variationLine,
  labourLines, requiredPhotos, type ConfigInput, type JobState, type Quote, type SiteAnswers, type StandardScope, type LabourRequest, requestFromLine, type Tier,
} from "@dfrnt/engine";
import { manualTransition, registerHook, transition, type Tx } from "./transition";
import { todayAEST } from "./api";
import { queueMessage } from "./messages";
import { pricingData, pricingDataFor } from "./pricing-data";

export const SYSTEM: Actor = { type: "system", id: "app" };
export const CUSTOMER: Actor = { type: "customer", id: "record-link" };

import { AGREEMENT_VERSION } from "./legal";
export interface QuoteRow {
  id: string; token: string; status: JobState; title: string | null; input: ConfigInput; result: Quote; snapshot: Quote | null;
  site: SiteAnswers | null; installer_id: string | null; pricing_reasons: string[] | null; lock_until: string; install_date: string | null; status_before_cancel: JobState | null;
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
    lock_until::text as lock_until, install_date::text as install_date, status_before_cancel, signed_at, signed_name, agreement_version, invoice_number, payment_method, payment_reference, paid_at,
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
  // P6 (4 Nov 2026): a test installer is never assigned to a real quote unless Ops has switched that on.
  const { allow_test_installer } = await (await import("./settings")).getSetting("pricing_mode");
  const rows = await db()`select id, scope, capacity, profile, email, business_name from installers where active and (${allow_test_installer} or not is_test)
    and exists (select 1 from unnest(postcode_ranges) r where r @> ${pc}::int)
    order by (id::text = ${q.chosen_installer_id ?? ""}) desc, is_test, created_at`;
  const { profileOf, needsOf } = await import("./schedule");
  const { cannotDo } = await import("@dfrnt/engine");
  const needs = needsOf({ ...q, site });
  const row = rows.find((r) => !cannotDo(profileOf(r as never), needs).length);
  return row as { id: string; scope: StandardScope; email: string | null; business_name: string | null } | undefined;
}

/** Photos this quote needs: battery-only jobs swap the roof for the existing inverter (P3, 4 Nov 2026). */
export const photosFor = (q: Pick<QuoteRow, "input">) => requiredPhotos((q.input.panelCount ?? 0) > 0);

/** P2: tell the installer a job is waiting for their price (I5), with the 5 pm promise. */
export async function notifyInstallerToPrice(q: QuoteRow, installerId: string, why: "new" | "reassigned" | "retake") {
  const [inst] = await db()`select email, business_name from installers where id = ${installerId}`;
  if (!inst?.email) return;
  const { placeOf } = await import("./schedule");
  await queueMessage("I5", q.token, inst.email as string, { name: inst.business_name as string, place: placeOf(q), title: q.title ?? q.result.config.summary, jobId: q.id, why });
}

/** Move a quote through the one door. `via` names the effect this action owns (see JOB_EFFECTS). */
const move = (q: QuoteRow, to: JobState, actor: Actor, action: string, set: Record<string, unknown> = {}, rationale?: string, payload?: Record<string, unknown>, via?: string, work?: (tx: Tx) => Promise<Record<string, unknown> | void>) =>
  transition(q, to, actor, { action, set, rationale, payload, via, work });

/* C1–C3: home + photos → instant price or installer pricing */
export async function submitSite(q: QuoteRow, site: SiteAnswers, contact: { name: string; email: string; phone: string }, opts: { feePaid?: boolean } = {}) {
  if (!JOB_SETS.OPEN_CHECKOUT.includes(q.status)) throw new Error("This quote has already been priced");
  if (q.status === "saved" || q.status === "lapsed") {
    // A fresh lock from today: new lock date and a rebate date inside today's window (a lapsed quote kept the old ones).
    const { rebateFromFor } = await import("./rebate-from");
    const w = rebateWindow(todayAEST(), (await pricingDataFor(q.result.versions)).rebates, await rebateFromFor(q.postcode));
    await move(q, "secured", CUSTOMER, "quotes.secure", { lock_until: w.lock_until, input: db().json({ ...q.input, installDate: w.rebate_date } as never) }, undefined, undefined, "secure");
    q = (await getQuote(q.token))!;
  }
  const inst = await installerFor(q, site);
  const priced = await reprice(q, { site });
  // Scope check runs whatever the mode, so Ops → Pricing can show which home patterns would have priced instantly (P7).
  const scopeReasons = inst ? instantPriceBlockers(site, inst.scope, photosFor(q)) : ["No installer covers this postcode yet"];
  if (!priced.config.ok) scopeReasons.push(...priced.config.blockers.map((b) => b.message));
  const { getSetting } = await import("./settings");
  const mode = await getSetting("pricing_mode");
  // P1 (decided 4 Nov 2026): at launch every home is confirmed by the installer from the photos before any payment.
  const reasons = mode.installer_confirms_all && inst && !scopeReasons.length ? ["Installer confirms every job"] : scopeReasons;
  // C8: standard homes are priced instantly and free. A home that needs an installer's photo check can carry a design-check fee,
  // but only when ops switches it on; the fee comes back as a credit on purchase. Never charged when the only reason is the launch rule.
  if (scopeReasons.length && inst && q.design_fee_status !== "paid" && !opts.feePaid) {
    const dc = await getSetting("design_check");
    if (dc.fee_on) {
      const reference = `DSD${q.token.slice(0, 5).toUpperCase()}`;
      await db()`update quotes set site_draft = ${db().json(site as never)}, design_fee_status = 'due', pricing_reasons = ${scopeReasons}, updated_at = now() where id = ${q.id}`;
      await db()`insert into payments (quote_id, kind, method, amount, reference) select ${q.id}, 'report', 'bank', ${dc.amount}, ${reference}
        where not exists (select 1 from payments where quote_id = ${q.id} and kind = 'report' and status = 'pending')`;
      await queueMessage("M15", q.token, contact.email, { name: contact.name, amount: dc.amount, reference });
      return;
    }
  }
  const common = {
    site: db().json(site as never), customer_name: contact.name, customer_email: contact.email, customer_phone: contact.phone,
    installer_id: inst?.id ?? null, scope_version: inst?.scope.version ?? null, design_review: scopeReasons.length > 0,
    // P7: what the scope check said, kept even when the launch rule sends the job to the installer anyway.
    scope_result: db().json({ in_scope: scopeReasons.length === 0, reasons: scopeReasons, pattern: patternOf(site) } as never),
  };
  { const { trackConversion } = await import("./conversions"); await trackConversion(q.id, "SubmitApplication", priced.stack.amount_payable); }
  if (!reasons.length) {
    await move(q, "pricing_instant", CUSTOMER, "quotes.submit_site", common, undefined, undefined, "submitSite");
    q = (await getQuote(q.token))!;
    await freezePrice(q, priced, SYSTEM, "Instant price: site inside the installer's standard scope", { by: "instant", changed: false });
  } else if (!inst) {
    // P5: nobody covers this address. Straight to Ops, not a day in a queue no installer will open.
    await move(q, "tech_review", CUSTOMER, "quotes.submit_site", { ...common, pricing_reasons: reasons }, "No installer covers this postcode", { reasons }, "submitSite");
    await queueMessage("M1", q.token, contact.email, { name: contact.name });
  } else {
    await move(q, "pricing_installer", CUSTOMER, "quotes.submit_site", { ...common, pricing_reasons: reasons, pricing_requested_at: new Date() }, undefined, { reasons }, "submitSite");
    await queueMessage("M1", q.token, contact.email, { name: contact.name });
    await notifyInstallerToPrice((await getQuote(q.token))!, inst.id, "new");
  }
}

/** The home pattern the scope rules look at, as one short key for Ops → Pricing (P7). */
export const patternOf = (s: SiteAnswers) => `${s.storeys} storey · ${s.roofType} · switchboard ${s.switchboard} · ${s.phases === "unknown" ? "phases unknown" : `${s.phases}P`}`;

/** Freeze the priced snapshot (v2) that D1, the invoice and installer pay all read. */
async function freezePrice(q: QuoteRow, p: Quote, actor: Actor, rationale: string, who: { by: "instant" | "installer" | "ops"; changed: boolean }) {
  await move(q, "priced", actor, "quotes.price", {
    snapshot: db().json(p as never), priced_at: new Date(), amount_payable: p.stack.amount_payable, price_inc_gst: p.stack.price_inc_gst,
    stcs: p.stack.stcs, checkout_allowed: p.checkout_allowed, pricing_reasons: null, priced_by: who.by, price_changed: who.changed,
  }, rationale, { amount_payable: p.stack.amount_payable }, "freezePrice");
  await queueMessage("M2", q.token, q.customer_email, { name: q.customer_name, amount: p.stack.amount_payable });
}

/* I2: installer confirms price, optionally adding named lines from the menu */
export async function installerPrice(q: QuoteRow, actor: Actor, extraCodes: string[], note?: string) {
  if (!JOB_SETS.AWAITING_PRICE.includes(q.status)) throw new Error("Not waiting for a price");
  // "CODE" or "CODE:qty" (per-metre / per-km items carry a quantity)
  const extraLabour = extraCodes.filter(Boolean).map((c) => { const [code, q] = c.split(":"); return { code: code!, qty: Math.min(500, Math.max(1, Math.round(Number(q) || 1))) }; });
  const p = await reprice(q, { extraLabour });
  await freezePrice(q, p, actor, note || (extraCodes.length ? `Installer added ${extraCodes.map((c) => c.replace(":", " × ")).join(", ")}` : "Installer confirmed standard price"),
    { by: actor.type === "staff" ? "ops" : "installer", changed: extraLabour.length > 0 });
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400_000);

/* D2: sign the agreement */
export async function sign(q: QuoteRow, name: string) {
  if (q.status !== "priced") throw new Error("Nothing to sign");
  if (q.lock_until < todayAEST()) { await move(q, "lapsed", SYSTEM, "quotes.lapse", {}, "Lock expired before signing"); throw new Error("This price has expired. Secure it again at today's price."); }
  {
    const { rebateFromFor } = await import("./rebate-from");
    const from = await rebateFromFor(q.postcode);
    if (from && (q.input.installDate ?? "") < from) throw new Error("Installs before the rebate change are fully booked in your area. Accept today's price for an install in the new year (shown above), or call us on 1300 133 768.");
  }
  {
    // Signing inside the last days of a rebate window would leave a paid job with no bookable day (every offered
    // date must be inside the window). Stop before money changes hands and send them to a person.
    const { rebates } = await pricingDataFor(q.result.versions);
    const end = rebateWindow(q.input.installDate ?? todayAEST(), rebates).window_end;
    const { gear_lead_days } = await (await import("./settings")).getSetting("scheduling");
    if (end && daysBetween(todayAEST(), end) < gear_lead_days + 2) throw new Error(`The current rebate period ends on ${end} and installers need ${gear_lead_days} days' notice for equipment. Call us on 1300 133 768 and we'll re-price you into the next period before you sign.`);
  }
  await move(q, "signed", CUSTOMER, "quotes.sign", { signed_at: new Date(), signed_name: name, agreement_version: AGREEMENT_VERSION }, undefined, undefined, "sign");
  { const { trackConversion } = await import("./conversions"); await trackConversion(q.id, "SignedAgreement", (q.snapshot ?? q.result).stack.amount_payable); }
}

/* D3/D4b: bank transfer (card switches on with Stripe at go-live) */
export async function chooseBank(q: QuoteRow) {
  if (q.status !== "signed") throw new Error("Sign first");
  const p = await reprice(q, { bank: true, extraLabour: extraFromSnapshot(q) });
  const reference = `DS${q.token.slice(0, 6).toUpperCase()}`;
  await transition(q, "payment_pending", CUSTOMER, { action: "payments.create", via: "createPayment", payload: { method: "bank" },
    set: { payment_method: "bank", payment_reference: reference, snapshot: db().json(p as never), amount_payable: p.stack.amount_payable },
    work: async (tx) => {
      const [pay] = await tx`insert into payments (quote_id, kind, method, amount, reference) values (${q.id}, 'system', 'bank', ${p.stack.amount_payable}, ${reference}) returning id`;
      return { payment_id: pay!.id, amount: p.stack.amount_payable, reference };
    } });
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
  const paymentId = (await transition(q, "payment_pending", CUSTOMER, { action: "payments.create", via: "createPayment", payload: { method },
    set: { payment_method: method, payment_reference: reference, snapshot: db().json(p as never), amount_payable: p.stack.amount_payable },
    work: async (tx) => {
      const [pay] = await tx`insert into payments (quote_id, kind, method, amount, reference) values (${q.id}, 'system', ${method}, ${p.stack.amount_payable}, ${reference}) returning id`;
      return { payment_id: pay!.id as string, amount: p.stack.amount_payable, method };
    } })).result.payment_id as string;
  try {
    await createIntent({ paymentId, amount: p.stack.amount_payable, method, quoteId: q.id, token: q.token, email: q.customer_email, kind: "system",
      description: `DFRNT Solar ${reference} — ${q.title ?? "solar and battery system"}` });
  } catch (e) {
    // Couldn't reach Stripe: put the customer back at "how would you like to pay" rather than a dead form.
    console.error("stripe intent", (e as Error).message);
    await transition({ ...q, status: "payment_pending" }, "signed", SYSTEM, { action: "payments.intent_failed", via: "intentFailed", rationale: (e as Error).message.slice(0, 200), tolerate: true,
      set: { payment_method: null }, work: async (tx) => { await tx`update payments set status = 'failed', provider_status = 'create_failed' where id = ${paymentId}`; } });
    throw new Error(`We couldn't start the ${method === "payto" ? "PayTo" : "card"} payment just now. Please try again, or pay by bank transfer.`);
  }
}

/* Change how I pay: back to "signed" so the customer can choose again (cancels an unpaid online intent). */
export async function changePayment(q: QuoteRow) {
  if (q.status !== "payment_pending") throw new Error("Nothing to change");
  const { releaseSystemPayment } = await import("./stripe");
  await releaseSystemPayment(q.id);
  await transition(q, "signed", CUSTOMER, { action: "payments.change", via: "changePayment", set: { payment_method: null },
    work: async (tx) => { await tx`update payments set status = 'failed' where quote_id = ${q.id} and kind = 'system' and status = 'pending'`; } });
}

/* S4: finance link-out. The lender pays us; Ops marks it paid when they confirm. */
export async function chooseFinance(q: QuoteRow, providerId: string) {
  if (q.status !== "signed") throw new Error("Sign first");
  const { getSetting } = await import("./settings");
  const fp = (await getSetting("finance")).providers.find((x) => x.id === providerId && x.on && x.url);
  if (!fp) throw new Error("That finance option isn't available");
  const p = await reprice(q, { extraLabour: extraFromSnapshot(q) });
  const reference = `DS${q.token.slice(0, 6).toUpperCase()}`;
  await transition(q, "payment_pending", CUSTOMER, { action: "payments.create", via: "createPayment", payload: { method: `finance:${fp.id}` },
    set: { payment_method: `finance:${fp.id}`, payment_reference: reference, snapshot: db().json(p as never), amount_payable: p.stack.amount_payable },
    work: async (tx) => { await tx`insert into payments (quote_id, kind, method, amount, reference) values (${q.id}, 'system', ${`finance:${fp.id}`}, ${p.stack.amount_payable}, ${reference})`; return { method: fp.id }; } });
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
  return (q.snapshot?.stack.lines ?? []).filter((l) => l.kind === "installation" && !base.has(l.code)).map(requestFromLine);
}

/* Ops: funds received → awaiting_date (D5) */
export async function markPaid(q: QuoteRow, actor: Actor) {
  if (!JOB_SETS.AWAITING_PAYMENT.includes(q.status)) throw new Error("Not awaiting payment");
  if (!(actor.type === "system" && actor.id === "stripe")) {
    // Nobody but Stripe confirms a card or PayTo payment: not staff, not an approved agent proposal (9 Nov 2026).
    const { isOnline } = await import("./stripe");
    if (isOnline(q.payment_method)) throw new Error("Card and PayTo payments are confirmed by Stripe, not by hand. Use Reconcile on Ops → Payments, or ask the customer to change how they pay.");
  }
  // One transaction: the payment row, the status, the paid stamp and the invoice number land together or not at all.
  await transition(q, "awaiting_date", actor, { action: "payments.receive", via: "markPaid", rationale: "Funds matched to reference", set: { paid_at: new Date() },
    work: async (tx) => {
      await tx`update payments set status = 'received', received_at = now() where quote_id = ${q.id} and kind = 'system' and status in ('pending','review')`;
      await tx`update quotes set invoice_number = 'INV-' || nextval('invoice_seq') where id = ${q.id} and invoice_number is null`;
    } });
  await queueMessage("M3", q.token, q.customer_email, { name: q.customer_name });
  { const { trackConversion } = await import("./conversions"); await trackConversion(q.id, "Purchase", (q.snapshot ?? q.result).stack.amount_payable); }
  const { requestOffer } = await import("./schedule");
  await requestOffer((await getQuote(q.token))!).catch(() => null);   // installer not on a live calendar: ask them for days
}

/* Stage moves by ops / installer (O2, I4): only edges the engine marks manual. Money, price, day and cancel edges name their action. */
/** Edges "Change stage" never takes, derived from the machine (kept for callers that still import it). */
export const MONEY_MOVES: [JobState, JobState][] = QUOTE.edges.filter((e) => !isManualEdge(e.from, e.to)).map((e) => [e.from, e.to]);
export async function advance(q: QuoteRow, to: JobState, actor: Actor, rationale: string) {
  let maxTier: Tier | undefined;
  if (actor.type === "agent") { const [a] = await db()`select max_tier from agents where id = ${actor.id}`; maxTier = (a?.max_tier as Tier | undefined) ?? "P"; }
  return manualTransition(q, to, actor, rationale, maxTier);
}

/* Inline hooks: work an edge always needs, inside the same transaction as the move. */
registerHook("installed!", async (tx, raw) => {
  const q = raw as unknown as QuoteRow;
  const st = (q.snapshot ?? q.result);
  await tx`insert into stc_receivables (quote_id, solar_stcs, battery_stcs, expected_value) values (${q.id}, ${st.rebate.solar_stcs}, ${st.rebate.battery_stcs}, ${st.stack.less_stcs}) on conflict do nothing`;
  await tx`update pay_ledger set status = 'eligible' where quote_id = ${q.id} and status = 'accrued'`;
  if (q.discount_code) await tx`insert into payouts (code, quote_id, amount, status) select code, ${q.id}, reward, 'eligible' from codes where code = ${q.discount_code} on conflict do nothing`;
  const first = (q.customer_name ?? "FRIEND").split(" ")[0]!.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 8) || "FRIEND";
  // Name + 6 random characters (no 0/O/1/I): about a billion codes per first name, so they can't be guessed.
  const { randomInt } = await import("node:crypto");
  const tail = Array.from({ length: 6 }, () => "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"[randomInt(32)]).join("");
  await tx`insert into codes (code, kind, owner_quote_id) select ${`${first}-${tail}`}, 'referral', ${q.id} where not exists (select 1 from codes where owner_quote_id = ${q.id} and kind = 'referral')`;
  return () => queueMessage("M6", q.token, q.customer_email, { name: q.customer_name });
});
registerHook("completeCheck!", async (tx, q) => {
  const [{ open }] = await tx`select count(*)::int open from pay_ledger where quote_id = ${q.id} and status <> 'paid' and amount_ex > 0` as never as [{ open: number }];
  if (open > 0) throw new Error(`${open} installer pay line(s) are not paid yet; a job completes once the installer has been paid in full`);
});

/** Tech review → back to an installer who covers the postcode (tech_review is also where "no installer" lands, so find one now). */
export async function sendToInstaller(q: QuoteRow, actor: Actor, rationale: string) {
  if (!q.site) throw new Error("No site answers on this job");
  const inst = await installerFor(q, q.site);
  if (!inst) throw new Error("No active installer covers this postcode. Price it from here or decline.");
  await transition(q, "pricing_installer", actor, { action: "jobs.assign_installer", via: "assignInstaller", rationale,
    set: { installer_id: inst.id, pricing_requested_at: new Date(), scope_version: inst.scope.version } });
  await notifyInstallerToPrice((await getQuote(q.token))!, inst.id, "reassigned");
}

/* D6: variation after payment */
export async function raiseVariation(q: QuoteRow, actor: Actor, code: string, description: string, installerCostEx?: number) {
  if (!JOB_SETS.VARIATION_OK.includes(q.status)) throw new Error("Variations are raised after payment and before install");
  const { menu, margins } = await pricingData();
  const item = menu.items.find((i) => i.code === code);
  const line = installerCostEx != null ? variationLine(code, description, installerCostEx, margins)
    : labourLines([{ code }], { kw: 0, panels: 0 }, { kind: "variation", menu, margins })[0];
  if (!line || line.sell_ex_gst == null) throw new Error("Unknown variation; give an installer cost");
  const amt = variationAmount(line);
  const insert = async (tx: Tx) => {
    const [v] = await tx`insert into variations (quote_id, code, description, installer_cost_ex, sell_ex, gst, sell_inc, raised_by)
      values (${q.id}, ${code}, ${description || item?.description || code}, ${line.cost_ex_gst}, ${amt.ex_gst}, ${amt.gst}, ${amt.inc_gst}, ${actor.id}) returning id`;
    return { variation_id: v!.id as string, ...amt };
  };
  // On site, the job goes on hold until the customer decides; earlier than that the variation just waits on the record.
  if (q.status === "on_site") await transition(q, "variation_pending", actor, { action: "variations.raise", via: "raiseVariation", work: insert, payload: { code } });
  else await write({ actor, action: "variations.raise" }, { token: q.token, code, description, installerCostEx }, async (tx) => ({ entity: "quote", entityId: q.id, event: "variation.raised", result: await insert(tx) }));
  await queueMessage("M8", q.token, q.customer_email, { name: q.customer_name, amount: amt.inc_gst });
}

export async function decideVariation(q: QuoteRow, variationId: string, approve: boolean) {
  if (JOB_SETS.CLOSED.includes(q.status) || JOB_SETS.INSTALLED.includes(q.status)) throw new Error("This job has moved on; call us about the change");
  const action = approve ? "variations.approve" : "variations.decline";
  const decide = async (tx: Tx) => {
    const [v] = await tx`update variations set status = ${approve ? "approved" : "declined"}, decided_at = now()
      where id = ${variationId} and quote_id = ${q.id} and status = 'proposed' returning id, sell_inc, installer_cost_ex, description`;
    if (!v) throw new Error("Variation not found");
    if (approve) {
      await tx`insert into payments (quote_id, variation_id, kind, method, amount, reference) values (${q.id}, ${variationId}, 'variation', 'bank', ${v.sell_inc}, ${`DSV${q.token.slice(0, 5).toUpperCase()}`})`;
      // A variation approved after install is pay-eligible straight away; before install it waits with the rest (9 Nov 2026).
      if (q.installer_id) await tx`insert into pay_ledger (installer_id, quote_id, variation_id, description, amount_ex, status) values (${q.installer_id}, ${q.id}, ${variationId}, ${`Variation: ${v.description}`}, ${v.installer_cost_ex}, ${JOB_SETS.INSTALLED.includes(q.status) ? "eligible" : "accrued"})`;
    }
    const [{ open }] = await tx`select count(*)::int open from variations where quote_id = ${q.id} and status = 'proposed'` as never as [{ open: number }];
    return { variationId, approved: approve, still_open: open };
  };
  if (q.status !== "variation_pending") {
    await write({ actor: CUSTOMER, action }, { token: q.token, variationId }, async (tx) => ({ entity: "quote", entityId: q.id, event: approve ? "variation.approved" : "variation.declined", result: await decide(tx) }));
    return;
  }
  // On hold: the hold lifts only once every proposed variation has an answer.
  const [{ others }] = await db()`select count(*)::int others from variations where quote_id = ${q.id} and status = 'proposed' and id <> ${variationId}` as never as [{ others: number }];
  if (others > 0) await write({ actor: CUSTOMER, action }, { token: q.token, variationId }, async (tx) => ({ entity: "quote", entityId: q.id, event: approve ? "variation.approved" : "variation.declined", result: await decide(tx) }));
  else await transition(q, "on_site", CUSTOMER, { action, via: "decideVariation", work: decide, payload: { variationId, approved: approve } });
}

/* D7: cancellation (refund handled by ops; Stripe refunds switch on at go-live) */
export async function cancel(q: QuoteRow, actor: Actor, reason: string) {
  await move(q, "cancelled", actor, "jobs.cancel", { cancelled_at: new Date(), cancel_reason: reason, install_date: null, status_before_cancel: q.status }, reason, undefined, "cancel");
  // A card/PayTo intent must not stay live on a cancelled job (it would collect with nowhere to go).
  { const { releaseSystemPayment } = await import("./stripe"); await releaseSystemPayment(q.id).catch(() => null); }
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
  if (!JOB_SETS.CODE_OK.includes(q.status)) throw new Error("Codes can be added before you sign");
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
  const [c] = await db()`select c.code, c.owner_quote_id, o.customer_email owner_email from codes c left join quotes o on o.id = c.owner_quote_id where c.code = ${code} and c.active`;
  if (!c) throw new Error("That code isn't valid");
  if (c.owner_quote_id === q.id || (c.owner_email && q.customer_email && String(c.owner_email).toLowerCase() === q.customer_email.toLowerCase())) throw new Error("You can't use your own code");
  await write({ actor: CUSTOMER, action: "quotes.apply_code" }, { token: q.token, code }, async (tx) => {
    await tx`update quotes set discount_code = ${code}, updated_at = now() where id = ${q.id}`;
    return { entity: "quote", entityId: q.id, event: "quote.code_applied", result: { code } };
  });
  await repriceFrozen(q);
}

async function repriceFrozen(q: QuoteRow, states: JobState[] = ["priced"]) {
  if (!states.includes(q.status)) return;
  const fresh = (await getQuote(q.token))!;
  const p = await reprice(fresh, { extraLabour: extraFromSnapshot(fresh) });
  await db()`update quotes set snapshot = ${db().json(p as never)}, amount_payable = ${p.stack.amount_payable}, price_inc_gst = ${p.stack.price_inc_gst}, stcs = ${p.stack.stcs} where id = ${q.id}`;
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
export const REVISABLE: readonly JobState[] = JOB_SETS.REVISABLE;

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
    await freezePrice(fresh, rev.priced, CUSTOMER, `Customer accepted the revised design: ${rev.reason}`, { by: rev.by.startsWith("staff") ? "ops" : "installer", changed: true });
  }
}

/** States in which a customer whose price was for the current rebate window can move to the next one. */
export const FORWARDABLE: readonly JobState[] = JOB_SETS.FORWARDABLE;

/** The installs-before-the-change are full in this area and this price was for them: today's price for the next window. */
export async function forwardOffer(q: QuoteRow): Promise<{ from: string; was: number; now: number } | null> {
  if (!FORWARDABLE.includes(q.status)) return null;
  const { rebateFromFor } = await import("./rebate-from");
  const from = await rebateFromFor(q.postcode);
  if (!from || (q.input.installDate ?? "") >= from) return null;
  const w = rebateWindow(todayAEST(), (await pricingDataFor(q.result.versions)).rebates, from);
  const moved = { ...q, input: { ...q.input, installDate: w.rebate_date } } as QuoteRow;
  const p = await reprice(moved, { extraLabour: extraFromSnapshot(q) });
  return { from, was: (q.snapshot ?? q.result).stack.amount_payable, now: p.stack.amount_payable };
}

/** The customer accepts the next window's price (approved 3 Nov 2026: offered on their record, one tap). */
export async function acceptForward(q: QuoteRow) {
  const offer = await forwardOffer(q);
  if (!offer) throw new Error("Nothing to change: your price is still bookable.");
  if (q.status === "payment_pending") { await changePayment(q); q = (await getQuote(q.token))!; }
  const w = rebateWindow(todayAEST(), (await pricingDataFor(q.result.versions)).rebates, offer.from);
  await write({ actor: CUSTOMER, action: "quotes.accept_next_window", rationale: "Installs before the rebate change fully booked; customer accepted the new-window price" },
    { token: q.token, from: offer.from }, async (tx) => {
      await tx`update quotes set input = ${tx.json({ ...q.input, installDate: w.rebate_date } as never)}, lock_until = ${w.lock_until}, updated_at = now() where id = ${q.id}`;
      return { entity: "quote", entityId: q.id, event: "quote.next_window", result: { was: offer.was, now: offer.now, from: offer.from }, payload: { was: offer.was, now: offer.now } };
    });
  const fresh = (await getQuote(q.token))!;
  if (["priced", "signed"].includes(fresh.status)) await repriceFrozen(fresh, ["priced", "signed"]);
  else { const p = await reprice(fresh); await db()`update quotes set result = ${db().json(p as never)}, amount_payable = ${p.stack.amount_payable}, price_inc_gst = ${p.stack.price_inc_gst}, stcs = ${p.stack.stcs} where id = ${q.id}`; }
}
