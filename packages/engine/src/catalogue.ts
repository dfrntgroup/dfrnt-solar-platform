// Launch catalogue: saved configurations priced live for a postcode and date.
import catalogueJson from "./data/catalogue.json";
import type { ConfigInput } from "./config";
import { quote, type Quote } from "./quote";
import { rebateWindow } from "./rebates";

export interface CatalogueSystem {
  slug: string; title: string; brand: string; tier: "core" | "brand" | "value" | "premium"; badge?: string;
  kind: "solar_battery" | "battery_only" | "solar_only";
  config: Pick<ConfigInput, "familyKey" | "panelSku" | "panelCount" | "batteryModules" | "stacks" | "phases"> & Partial<ConfigInput>;
}
export interface Catalogue { version: string; systems: CatalogueSystem[] }
export const DEFAULT_CATALOGUE = catalogueJson as unknown as Catalogue;

export interface Site { postcode: string; asOf: string; roofType?: ConfigInput["roofType"]; storeys?: number }

export function priceSystem(s: CatalogueSystem, site: Site): Quote {
  const installDate = rebateWindow(site.asOf).lock_until;
  return quote({
    backup: "none", roofType: site.roofType ?? "tin", storeys: site.storeys ?? 1, tilt: false, batteryLocation: "other",
    vehicleExposure: false, ...s.config, postcode: site.postcode, installDate,
  } as ConfigInput, { asOf: site.asOf });
}

export const findSystem = (slug: string, c: Catalogue = DEFAULT_CATALOGUE) => c.systems.find((s) => s.slug === slug);
