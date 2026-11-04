// Launch catalogue: saved configurations priced live for a postcode and date.
import catalogueJson from "./data/catalogue.json";
import type { ConfigInput } from "./config";
import { quote, type Quote, type QuoteContext } from "./quote";
import { rebateWindow } from "./rebates";

/** Battery bands: one of four fixed names used on every card so the same name means the same job across brands. */
export type Band = "evenings" | "overnight" | "overnight_ev" | "big_home";
export const BANDS: Record<Band, { label: string; kwh: string; why: string }> = {
  evenings: { label: "Evenings", kwh: "10–12 kWh", why: "Covers dinner to bedtime for most homes. The cheapest way into a battery." },
  overnight: { label: "Overnight", kwh: "15–18 kWh", why: "Runs most homes from dinner to breakfast. Our pick for a family home." },
  overnight_ev: { label: "Overnight + EV", kwh: "20–27 kWh", why: "Overnight plus an EV charge or a pool pump. The rebate still pays on every kWh up to 28." },
  big_home: { label: "Big home", kwh: "30 kWh and up", why: "Long blackouts, two EVs, or a home that never wants to buy evening power. The rebate pays less per kWh past 28." },
};
export const BAND_ORDER: Band[] = ["evenings", "overnight", "overnight_ev", "big_home"];
/** Band for a usable capacity, for configured systems and custom builds. */
export const bandFor = (usableKwh: number): Band => usableKwh < 13.5 ? "evenings" : usableKwh < 19 ? "overnight" : usableKwh < 28.5 ? "overnight_ev" : "big_home";

export interface CatalogueSystem {
  slug: string; title: string; brand: string; tier: "core" | "brand" | "value" | "premium"; badge?: string;
  kind: "solar_battery" | "battery_only" | "solar_only";
  /** Battery band (see BANDS); size label (Small / Family / Large / Extra large / Battery); one plain line on who it suits. */
  band?: Band; size?: string; who?: string;
  config: Pick<ConfigInput, "familyKey" | "panelSku" | "panelCount" | "batteryModules" | "stacks" | "phases"> & Partial<ConfigInput>;
}
export interface Catalogue { version: string; systems: CatalogueSystem[] }
export const DEFAULT_CATALOGUE = catalogueJson as unknown as Catalogue;

export interface Site { postcode: string; asOf: string; roofType?: ConfigInput["roofType"]; storeys?: number;
  /** Price for the rebate window starting here (set when the current window is fully booked in this area). */
  rebateFrom?: string | null }

/** Everything pricing reads. The web app loads the active versions from the database; tests use the file defaults. */
export type PricingData = Pick<QuoteContext, "rules" | "costs" | "menu" | "margins" | "rebates"> & { catalogue?: Catalogue };

export function priceSystem(s: CatalogueSystem, site: Site, data: PricingData = {}): Quote {
  const installDate = rebateWindow(site.asOf, data.rebates, site.rebateFrom).rebate_date;
  return quote({
    backup: "none", roofType: site.roofType ?? "tin", storeys: site.storeys ?? 1, tilt: false, batteryLocation: "other",
    vehicleExposure: false, ...s.config, postcode: site.postcode, installDate,
  } as ConfigInput, { ...data, asOf: site.asOf, rebateFrom: site.rebateFrom });
}

export const findSystem = (slug: string, c: Catalogue = DEFAULT_CATALOGUE) => c.systems.find((s) => s.slug === slug);
