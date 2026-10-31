"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DEFAULT_RULES, findSystem, rebateWindow } from "@dfrnt/engine";
const kwhPerModule = (fam: string) => DEFAULT_RULES.battery_families[DEFAULT_RULES.families[fam]!.battery_family]?.module.kwh_usable_cec ?? 0;
import { configured } from "@/lib/configure";
import { createQuote } from "@/lib/quotes";
import { todayAEST } from "@/lib/api";

export async function setPostcode(form: FormData) {
  const pc = String(form.get("postcode") ?? "").trim();
  const back = String(form.get("back") ?? "/");
  if (/^\d{4}$/.test(pc)) (await cookies()).set("postcode", pc, { maxAge: 60 * 60 * 24 * 90, path: "/", sameSite: "lax" });
  redirect(back.startsWith("/") ? back : "/");
}

/** "Secure this price": saves the system as a quote at today's price with the 14-day / window-end lock. */
export async function secureSystem(form: FormData) {
  const base = findSystem(String(form.get("slug")));
  const postcode = String(form.get("postcode") ?? "");
  if (!base || !/^\d{4}$/.test(postcode)) redirect("/systems");
  const backup = form.get("backup") === "whole_home" ? "whole_home" : "none";
  const s = form.get("panels") != null
    ? configured(base, { panels: Number(form.get("panels")), modules: Number(form.get("modules")), backup }, postcode)
    : base;
  const changed = s.config.panelCount !== base.config.panelCount || s.config.batteryModules !== base.config.batteryModules || backup !== "none";
  const out = await createQuote({ type: "customer", id: "anonymous" }, {
    config: {
      backup: "none", roofType: "tin", storeys: 1, tilt: false, batteryLocation: "other", vehicleExposure: false,
      ...s.config, panelSku: s.config.panelSku ?? "", stacks: s.config.stacks ?? 1, postcode,
      installDate: rebateWindow(todayAEST()).lock_until,
    },
    title: changed ? `${s.brand} · ${s.config.panelCount ? `${(s.config.panelCount * 0.475).toFixed(2)} kW solar + ` : ""}${Math.round(s.config.batteryModules * kwhPerModule(s.config.familyKey) * 10) / 10} kWh battery${backup === "whole_home" ? " + whole-home backup" : ""}` : `${s.brand} · ${s.title}`,
    systemSlug: s.slug,
  } as never, { status: "secured" });
  redirect(`/quote/${out.result.token}`);
}
