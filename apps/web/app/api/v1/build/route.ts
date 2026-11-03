import { z } from "zod";
import { rebateWindow, yieldFor } from "@dfrnt/engine";
import { json, problem, todayAEST } from "@/lib/api";
import { buildOptions } from "@/lib/builder";
import { pricingData } from "@/lib/pricing-data";
import { allow } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";
const Sku = z.string().max(40).regex(/^[A-Za-z0-9._-]+$/);
const Body = z.object({
  phases: z.union([z.literal(1), z.literal(3)]), family: Sku.optional(), inverterSku: Sku.optional(),
  modules: z.number().int().min(0).max(40).optional(), panelSku: Sku.nullable().optional(), panels: z.number().int().min(0).max(60).optional(),
  backup: z.boolean().optional(), postcode: z.string().regex(/^\d{4}$/),
});

/** pricing.build_options — tier R. For the builder's choices so far: what's allowed next (and why not) plus the live price. Nothing is saved. */
export async function POST(req: Request) {
  if (!(await allow("build", 300))) return problem(429, "Slow down");
  const b = Body.safeParse(await req.json().catch(() => null));
  if (!b.success) return problem(400, "Invalid", b.error.flatten());
  const { siteFor } = await import("@/lib/rebate-from");
  const site = await siteFor(b.data.postcode);
  const data = await pricingData();
  const rd = rebateWindow(todayAEST(), data.rebates, site.rebateFrom).rebate_date;
  const { postcode, ...choice } = b.data;
  const o = buildOptions(choice, postcode, rd, data, site);
  const { energySettings } = await import("@/lib/energy");
  const loc = yieldFor(postcode, (await energySettings()).yields);
  return json({ ...o, dayKwhPerKw: loc.kwh_per_kw, lockUntil: rebateWindow(todayAEST(), data.rebates, site.rebateFrom).lock_until });
}
