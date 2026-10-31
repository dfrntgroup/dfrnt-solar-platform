import { z } from "zod";
import { json, problem } from "@/lib/api";
import { priceChoice } from "@/lib/configure";

export const dynamic = "force-dynamic";
const Body = z.object({ slug: z.string(), panels: z.number().int().min(0).max(60), modules: z.number().int().min(0).max(40), backup: z.enum(["none", "whole_home"]).default("none"), postcode: z.string().regex(/^\d{4}$/) });

/** pricing.price_choice — tier R. Live price for a catalogue system with the customer's changes. Nothing is saved. */
export async function POST(req: Request) {
  const b = Body.safeParse(await req.json().catch(() => null));
  if (!b.success) return problem(400, "Invalid", b.error.flatten());
  const r = priceChoice(b.data.slug, b.data, b.data.postcode);
  if (!r) return problem(404, "Unknown system");
  const { q } = r;
  return json({
    ok: q.config.ok, checkout_allowed: q.checkout_allowed, summary: q.config.summary,
    solar_kw: q.config.panel_kw, usable_kwh: q.config.usable_kwh, inverter: q.config.inverter?.model, towers: q.config.stacks?.physical_towers ?? 0,
    you_pay: q.stack.amount_payable, before_rebates: q.stack.price_inc_gst, rebates: q.stack.less_stcs, gst: q.stack.gst,
    equipment: q.stack.hardware_ex_gst, installation: q.stack.installation_ex_gst, solar_stcs: q.rebate.solar_stcs, battery_stcs: q.rebate.battery_stcs,
    warnings: q.config.warnings.map((w) => w.message), blockers: q.config.blockers.map((b) => b.message),
  });
}
