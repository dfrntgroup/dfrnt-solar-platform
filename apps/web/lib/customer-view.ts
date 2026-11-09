import type { Quote } from "@dfrnt/engine";

/** What the record link may show: the customer's own price and system, never our costs, margin or installer pay
 *  ("One price. Everything named. Nothing decomposed." Fixed 9 Nov 2026: this used to return the whole engine result). */
export function customerView(q: Quote) {
  return {
    ok: q.ok, checkout_allowed: q.checkout_allowed, summary: q.config.summary,
    you_pay: q.stack.amount_payable, before_rebates: q.stack.price_inc_gst, gst: q.stack.gst, rebates: q.stack.less_stcs, stcs: q.stack.stcs,
    discounts: q.stack.discounts, price_pending: q.stack.price_pending,
    system: { solar_kw: q.config.panel_kw, usable_kwh: q.config.usable_kwh, inverter: q.config.inverter?.model ?? null, phases: q.config.input.phases },
    included: q.config.bom.map((b) => ({ qty: b.qty, description: b.description })),
    rebate: { solar_stcs: q.rebate.solar_stcs, battery_stcs: q.rebate.battery_stcs, total: q.rebate.total, zone: q.rebate.zone },
    window: q.window, warnings: q.config.warnings.map((w) => w.message), blockers: q.config.blockers.map((b) => b.message), versions: q.versions,
  };
}
