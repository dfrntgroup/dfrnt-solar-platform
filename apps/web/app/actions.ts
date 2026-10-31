"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { findSystem, rebateWindow } from "@dfrnt/engine";
import { pricingData } from "@/lib/pricing-data";
import { configured } from "@/lib/configure";
import { createQuote } from "@/lib/quotes";
import { todayAEST } from "@/lib/api";

export async function setPostcode(form: FormData) {
  const pc = String(form.get("postcode") ?? "").trim();
  const back = String(form.get("back") ?? "/");
  if (/^\d{4}$/.test(pc)) (await cookies()).set("postcode", pc, { maxAge: 60 * 60 * 24 * 90, path: "/", sameSite: "lax" });
  redirect(back.startsWith("/") ? back : "/");
}

import { allow } from "@/lib/ratelimit";

/** "Secure this price": saves the system as a quote at today's price with the 14-day / window-end lock. */
export async function secureSystem(form: FormData) {
  if (!(await allow("secure", 20))) redirect("/contact?kind=question");
  const data = await pricingData();
  const kwhPerModule = (fam: string) => data.rules.battery_families[data.rules.families[fam]!.battery_family]?.module.kwh_usable_cec ?? 0;
  const base = findSystem(String(form.get("slug")), data.catalogue);
  const postcode = String(form.get("postcode") ?? "");
  if (!base || !/^\d{4}$/.test(postcode)) redirect("/systems");
  const backup = form.get("backup") === "whole_home" ? "whole_home" : "none";
  const s = form.get("panels") != null
    ? configured(base, { panels: Number(form.get("panels")), modules: Number(form.get("modules")), backup }, postcode, data)
    : base;
  const changed = s.config.panelCount !== base.config.panelCount || s.config.batteryModules !== base.config.batteryModules || backup !== "none";
  const out = await createQuote({ type: "customer", id: "anonymous" }, {
    config: {
      backup: "none", roofType: "tin", storeys: 1, tilt: false, batteryLocation: "other", vehicleExposure: false,
      ...s.config, panelSku: s.config.panelSku ?? "", stacks: s.config.stacks ?? 1, postcode,
      installDate: rebateWindow(todayAEST(), data.rebates).lock_until,
    },
    title: changed ? `${s.brand} · ${s.config.panelCount ? `${(s.config.panelCount * 0.475).toFixed(2)} kW solar + ` : ""}${Math.round(s.config.batteryModules * kwhPerModule(s.config.familyKey) * 10) / 10} kWh battery${backup === "whole_home" ? " + whole-home backup" : ""}` : `${s.brand} · ${s.title}`,
    systemSlug: s.slug,
  } as never, { status: "secured" });
  redirect(`/quote/${out.result.token}`);
}

/** B5: save a system's price and email the link (the price is not locked until it's secured). */
export async function saveForLater(form: FormData) {
  if (!(await allow("save", 10))) redirect("/systems");
  const data = await pricingData();
  const base = findSystem(String(form.get("slug")), data.catalogue);
  const postcode = String(form.get("postcode") ?? ""), email = String(form.get("email") ?? "").trim();
  if (!base || !/^\d{4}$/.test(postcode)) redirect("/systems");
  if (!/^\S+@\S+\.\S+$/.test(email)) redirect(`/systems/${base.slug}?saved=bad`);
  const out = await createQuote({ type: "customer", id: "anonymous" }, {
    config: { backup: "none", roofType: "tin", storeys: 1, tilt: false, batteryLocation: "other", vehicleExposure: false, ...base.config, panelSku: base.config.panelSku ?? "", stacks: base.config.stacks ?? 1, postcode },
    customerEmail: email, title: `${base.brand} · ${base.title}`, systemSlug: base.slug,
  } as never, { status: "saved" });
  const { queueMessage } = await import("@/lib/messages");
  await queueMessage("M9", out.result.token, email, { amount: out.result.amount_payable });
  redirect(`/systems/${base.slug}?saved=1`);
}
