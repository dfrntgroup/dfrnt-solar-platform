"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { findSystem, rebateWindow } from "@dfrnt/engine";
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
  const s = findSystem(String(form.get("slug")));
  const postcode = String(form.get("postcode") ?? "");
  if (!s || !/^\d{4}$/.test(postcode)) redirect("/systems");
  const out = await createQuote({ type: "customer", id: "anonymous" }, {
    config: {
      backup: "none", roofType: "tin", storeys: 1, tilt: false, batteryLocation: "other", vehicleExposure: false,
      ...s.config, panelSku: s.config.panelSku ?? "", stacks: s.config.stacks ?? 1, postcode,
      installDate: rebateWindow(todayAEST()).lock_until,
    },
    title: `${s.brand} · ${s.title}`, systemSlug: s.slug,
  } as never);
  redirect(`/quote/${out.result.token}`);
}
