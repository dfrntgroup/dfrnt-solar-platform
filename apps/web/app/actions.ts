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
  redirect(back.startsWith("/") && !back.startsWith("//") ? back : "/");
}

import { allow } from "@/lib/ratelimit";

async function saveAttribution(quoteId: string) {
  try {
    const { attributionNow } = await import("@/lib/conversions");
    const { db } = await import("@dfrnt/db");
    await db()`update quotes set attribution = ${db().json((await attributionNow()) as never)} where id = ${quoteId} and attribution is null`;
  } catch { /* never blocks a quote */ }
}

/** "Secure this price": saves the system as a quote at today's price with the 14-day / window-end lock. */
export async function secureSystem(form: FormData) {
  if (!(await allow("secure", 20))) redirect("/contact?kind=question");
  const data = await pricingData();
  const kwhPerModule = (fam: string) => data.rules.battery_families[data.rules.families[fam]!.battery_family]?.module.kwh_usable_cec ?? 0;
  const base = findSystem(String(form.get("slug")), data.catalogue);
  const postcode = String(form.get("postcode") ?? "");
  if (!base || !/^\d{4}$/.test(postcode)) redirect("/systems");
  // No installer covers the postcode: a secured price would promise what nobody can deliver.
  { const { earliestFor } = await import("@/lib/capacity"); if ((await earliestFor(postcode)) === null) redirect(`/contact?kind=waitlist&postcode=${postcode}`); }
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
  await saveAttribution(out.result.id);
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
  await saveAttribution(out.result.id);
  const { queueMessage } = await import("@/lib/messages");
  await queueMessage("M9", out.result.token, email, { amount: out.result.amount_payable });
  redirect(`/systems/${base.slug}?saved=1`);
}

/** C5: "Call me back" from any product page or checkout step. Name and mobile only; ops is alerted straight away. */
export async function requestCallback(form: FormData) {
  const back = String(form.get("back") ?? "/");
  const safe = back.startsWith("/") && !back.startsWith("//") ? back.split("#")[0]! : "/";
  const go = (k: string) => redirect(`${safe}${safe.includes("?") ? "&" : "?"}callback=${k}#callback`);
  if (!(await allow("callback", 5))) go("busy");
  const name = String(form.get("name") ?? "").trim().slice(0, 80), phone = String(form.get("phone") ?? "").replace(/[^\d+]/g, "");
  if (name.length < 2 || !/^(\+?61|0)[2-478]\d{8}$/.test(phone)) go("bad");
  const token = String(form.get("token") ?? "");
  const { db } = await import("@dfrnt/db");
  const [q] = /^[0-9a-f]{36}$/.test(token) ? await db()`select id, title, status, amount_payable::float8 amount from quotes where token = ${token}` : [];
  await db()`insert into callbacks (quote_id, name, phone, page, note) values (${(q?.id as string) ?? null}, ${name}, ${phone}, ${safe}, ${String(form.get("note") ?? "").slice(0, 300) || null})`;
  const { getSetting } = await import("@/lib/settings");
  const { sendEmail } = await import("@/lib/email");
  const to = (await getSetting("trust")).callback_to;
  const where = q ? `${q.title} (${q.status}, ${Number(q.amount).toLocaleString("en-AU", { style: "currency", currency: "AUD" })})` : safe;
  if (to) await sendEmail(to, `Call back: ${name} ${phone}`, `${name} asked for a call back on ${phone}.\n\nFrom: ${where}\n\nMark it done in Ops → Call-backs.`).catch(() => null);
  go("1");
}
