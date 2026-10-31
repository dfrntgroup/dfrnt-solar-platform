import { cookies } from "next/headers";
import { DEFAULT_CATALOGUE, priceSystem, rebateWindow, type CatalogueSystem } from "@dfrnt/engine";
import { todayAEST } from "./api";

export const aud = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
export const aud2 = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD" });
export const longDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/** Visitor postcode: ?postcode, then cookie, then SEQ default. */
export async function sitePostcode(sp?: Record<string, string | string[] | undefined>) {
  const q = typeof sp?.postcode === "string" && /^\d{4}$/.test(sp.postcode) ? sp.postcode : undefined;
  if (q) return q;
  const c = (await cookies()).get("postcode")?.value;
  return c && /^\d{4}$/.test(c) ? c : "4551";
}

export function priced(postcode: string, filter: (s: CatalogueSystem) => boolean = () => true) {
  const asOf = todayAEST();
  return DEFAULT_CATALOGUE.systems.filter(filter).map((s) => ({ s, q: priceSystem(s, { postcode, asOf }) }));
}

export const rebateDate = () => {
  const d = new Date(`${todayAEST()}T00:00:00Z`);
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "UTC" });
};
export const windowEnd = () => rebateWindow(todayAEST()).window_end;
