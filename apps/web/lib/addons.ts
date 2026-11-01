// U1: add-ons (EV charger, bird-proofing, surge protection, monitoring upgrade, extra battery…). Priced by the same rule
// as everything else: supplier cost at the hardware margin, installer labour at the installation margin, GST on top.
// Before signing they're in the one contract; after paying they're one extra payment on the same record.
import { db, write } from "@dfrnt/db";
import { DEFAULT_MARGINS, type Margins, type PriceLine } from "@dfrnt/engine";
import type { QuoteRow } from "./jobs";

export interface Addon { code: string; name: string; description: string; supplier_cost_ex: number; installer_labour_ex: number; extra_days: number }
const r2 = (n: number) => Math.round(n * 100) / 100;

export function addonPrice(a: Pick<Addon, "supplier_cost_ex" | "installer_labour_ex">, m: Margins = DEFAULT_MARGINS, qty = 1) {
  const sellEx = r2(qty * (a.supplier_cost_ex / (1 - m.hardware) + a.installer_labour_ex / (1 - m.installation)));
  return { sell_ex: sellEx, gst: r2(sellEx * 0.1), sell_inc: r2(sellEx * 1.1) };
}

export function addonLines(a: Addon & { qty?: number }, m: Margins = DEFAULT_MARGINS): PriceLine[] {
  const qty = a.qty ?? 1, out: PriceLine[] = [];
  if (a.supplier_cost_ex > 0) { const c = r2(qty * a.supplier_cost_ex); out.push({ kind: "hardware", code: `ADD-${a.code}`, description: a.name, qty, unit_cost: a.supplier_cost_ex, cost_ex_gst: c, sell_ex_gst: r2(c / (1 - m.hardware)), price_pending: false }); }
  if (a.installer_labour_ex > 0) { const c = r2(qty * a.installer_labour_ex); out.push({ kind: "variation", code: `ADDL-${a.code}`, description: `${a.name}: installation`, qty: 1, unit_cost: c, cost_ex_gst: c, sell_ex_gst: r2(c / (1 - m.installation)), price_pending: false }); }
  return out;
}

export async function activeAddons(): Promise<Addon[]> {
  const rows = await db()`select code, name, description, supplier_cost_ex::float8 supplier_cost_ex, installer_labour_ex::float8 installer_labour_ex, extra_days::float8 extra_days
    from addons where active order by sort, name`;
  return rows as unknown as Addon[];
}

export async function quoteAddons(quoteId: string) {
  return db()`select id, code, name, qty, supplier_cost_ex::float8 supplier_cost_ex, installer_labour_ex::float8 installer_labour_ex, extra_days::float8 extra_days, status, variation_id
    from quote_addons where quote_id = ${quoteId} and status <> 'removed' order by created_at`;
}

/** Price lines for add-ons that are part of the contract (used by every re-price before signing). */
export async function contractAddonLines(quoteId: string, m: Margins) {
  const rows = await db()`select code, name, qty, supplier_cost_ex::float8 supplier_cost_ex, installer_labour_ex::float8 installer_labour_ex, extra_days::float8 extra_days
    from quote_addons where quote_id = ${quoteId} and status = 'in_quote'`;
  return rows.flatMap((r) => addonLines({ ...(r as unknown as Addon), description: "", qty: r.qty as number }, m));
}

export const PRE_SIGN = ["secured", "pricing_instant", "pricing_installer", "tech_review", "priced"];
export const AFTER_PAY = ["awaiting_date", "booked", "gear_ordered", "delivered"];

/** Customer adds an add-on. Before signing: into the contract price. After paying: an extra payment on the record. */
export async function addAddon(q: QuoteRow, code: string) {
  const [a] = await db()`select code, name, description, supplier_cost_ex::float8 supplier_cost_ex, installer_labour_ex::float8 installer_labour_ex, extra_days::float8 extra_days from addons where code = ${code} and active`;
  if (!a) throw new Error("That add-on isn't available");
  const addon = a as unknown as Addon;
  const [dupe] = await db()`select 1 from quote_addons where quote_id = ${q.id} and code = ${code} and status <> 'removed'`;
  if (dupe) throw new Error("Already added");
  if (PRE_SIGN.includes(q.status)) {
    await db()`insert into quote_addons (quote_id, code, name, supplier_cost_ex, installer_labour_ex, extra_days) values (${q.id}, ${code}, ${addon.name}, ${addon.supplier_cost_ex}, ${addon.installer_labour_ex}, ${addon.extra_days})`;
    await repriceIfFrozen(q);
    return;
  }
  if (!AFTER_PAY.includes(q.status)) throw new Error("Add-ons can be added before your install day");
  const { pricingDataFor } = await import("./pricing-data");
  const { margins } = await pricingDataFor(q.result.versions);
  const p = addonPrice(addon, margins);
  await write({ actor: { type: "customer", id: "record-link" }, action: "addons.add_after_payment" }, { token: q.token, code }, async (tx) => {
    const [v] = await tx`insert into variations (quote_id, code, description, installer_cost_ex, sell_ex, gst, sell_inc, raised_by, status)
      values (${q.id}, ${`ADD-${code}`}, ${`Add-on: ${addon.name}`}, ${addon.installer_labour_ex}, ${p.sell_ex}, ${p.gst}, ${p.sell_inc}, 'customer', 'approved') returning id`;
    await tx`insert into quote_addons (quote_id, code, name, supplier_cost_ex, installer_labour_ex, extra_days, status, variation_id)
      values (${q.id}, ${code}, ${addon.name}, ${addon.supplier_cost_ex}, ${addon.installer_labour_ex}, ${addon.extra_days}, 'after_payment', ${v!.id})`;
    await tx`insert into payments (quote_id, variation_id, kind, method, amount, reference) values (${q.id}, ${v!.id}, 'variation', 'bank', ${p.sell_inc}, ${`DSA${q.token.slice(0, 5).toUpperCase()}`})`;
    if (q.installer_id && addon.installer_labour_ex > 0) await tx`insert into pay_ledger (installer_id, quote_id, variation_id, description, amount_ex) values (${q.installer_id}, ${q.id}, ${v!.id}, ${`Add-on: ${addon.name}`}, ${addon.installer_labour_ex})`;
    if (addon.extra_days > 0) await tx`update quotes set job_days = coalesce(job_days, 1) + ${addon.extra_days} where id = ${q.id}`;
    return { entity: "quote", entityId: q.id, event: "addon.added", result: { code, amount: p.sell_inc } };
  });
}

export async function removeAddon(q: QuoteRow, id: string) {
  if (!PRE_SIGN.includes(q.status)) throw new Error("Once signed, call us to change add-ons");
  await db()`update quote_addons set status = 'removed' where id = ${id} and quote_id = ${q.id} and status = 'in_quote'`;
  await repriceIfFrozen(q);
}

async function repriceIfFrozen(q: QuoteRow) {
  if (q.status !== "priced") return;
  const { getQuote, reprice, extraLabourOf } = await import("./jobs");
  const fresh = (await getQuote(q.token))!;
  const p = await reprice(fresh, { extraLabour: extraLabourOf(fresh) });
  await db()`update quotes set snapshot = ${db().json(p as never)}, amount_payable = ${p.stack.amount_payable}, price_inc_gst = ${p.stack.price_inc_gst} where id = ${q.id}`;
}
