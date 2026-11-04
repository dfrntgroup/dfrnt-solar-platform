import { z } from "zod";
import { json, problem } from "@/lib/api";
import { priceChoice } from "@/lib/configure";
import { pricingData } from "@/lib/pricing-data";
import { allow } from "@/lib/ratelimit";
import { componentLines } from "@/lib/price-lines";
import { inverterOptions, stepPrices } from "@/lib/steps";

export const dynamic = "force-dynamic";
const Body = z.object({ slug: z.string(), panels: z.number().int().min(0).max(60), modules: z.number().int().min(0).max(40), backup: z.enum(["none", "whole_home"]).default("none"), postcode: z.string().regex(/^\d{4}$/), inverterSku: z.string().regex(/^[A-Z0-9.\-]{3,40}$/).optional() });

/** pricing.price_choice — tier R. Live price for a catalogue system with the customer's changes. Nothing is saved. */
export async function POST(req: Request) {
  if (!(await allow("price", 300))) return problem(429, "Slow down");
  const b = Body.safeParse(await req.json().catch(() => null));
  if (!b.success) return problem(400, "Invalid", b.error.flatten());
  const { rebateFromFor } = await import("@/lib/rebate-from");
  const data = await pricingData(), rebateFrom = await rebateFromFor(b.data.postcode);
  const r = priceChoice(b.data.slug, b.data, b.data.postcode, data, rebateFrom);
  if (!r) return problem(404, "Unknown system");
  const { q } = r;
  const steps = stepPrices(b.data.slug, b.data, b.data.postcode, data, rebateFrom);
  const inverters = inverterOptions(b.data.slug, b.data, b.data.postcode, data, rebateFrom);
  return json({
    ok: q.config.ok, checkout_allowed: q.checkout_allowed, summary: q.config.summary,
    solar_kw: q.config.panel_kw, usable_kwh: q.config.usable_kwh, inverter: q.config.inverter?.model, towers: q.config.stacks?.physical_towers ?? 0,
    you_pay: q.stack.amount_payable, before_rebates: q.stack.price_inc_gst, rebates: q.stack.less_stcs, gst: q.stack.gst,
    equipment: q.stack.hardware_ex_gst, installation: q.stack.installation_ex_gst, solar_stcs: q.rebate.solar_stcs, battery_stcs: q.rebate.battery_stcs,
    warnings: q.config.warnings.map((w) => w.message), blockers: q.config.blockers.map((b) => b.message),
    lines: componentLines(q, b.data.panels), steps, inverters, inverter_sku: q.config.inverter?.sku,
  });
}
