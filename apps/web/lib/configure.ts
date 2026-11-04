import { autoStacks, findSystem, priceSystem, rebateWindow, resolveConfig, type CatalogueSystem, type ConfigInput } from "@dfrnt/engine";
import type { FullData } from "./pricing-data";
import { todayAEST } from "./api";

export interface Choice { panels: number; modules: number; backup: "none" | "whole_home"; /** Customer's inverter choice; otherwise the system's own inverter is held. */ inverterSku?: string }

/** The inverter a catalogue system opens on (its own, or the one the engine resolves for it). */
export function baseInverter(s: CatalogueSystem, postcode: string, data: FullData, rebateFrom?: string | null): string | undefined {
  if (s.config.inverterSku) return s.config.inverterSku;
  const full = { roofType: "tin", storeys: 1, tilt: false, batteryLocation: "other", vehicleExposure: false, backup: "none", postcode, installDate: rebateWindow(todayAEST(), data.rebates, rebateFrom).rebate_date, ...s.config } as ConfigInput;
  return resolveConfig(full, { rules: data.rules }).inverter?.sku;
}

/** The catalogue system with the customer's changes applied (stacks chosen automatically).
 *  The inverter is held at the system's own unless the customer picked another (Karl, 4 Nov: fixed by default, changeable on purpose). */
export function configured(s: CatalogueSystem, c: Choice, postcode: string, data: FullData, rebateFrom?: string | null): CatalogueSystem {
  const inverterSku = c.inverterSku ?? baseInverter(s, postcode, data, rebateFrom);
  const config = { ...s.config, panelCount: s.config.panelCount > 0 ? c.panels : 0, batteryModules: c.modules, backup: c.backup, inverterSku, preferInverterSku: undefined };
  const full = { roofType: "tin", storeys: 1, tilt: false, batteryLocation: "other", vehicleExposure: false, postcode, installDate: rebateWindow(todayAEST(), data.rebates, rebateFrom).rebate_date, ...config } as ConfigInput;
  const stacks = autoStacks(full, data.rules) ?? 1;
  return { ...s, config: { ...config, stacks } as CatalogueSystem["config"] };
}

export function priceChoice(slug: string, c: Choice, postcode: string, data: FullData, rebateFrom?: string | null) {
  const base = findSystem(slug, data.catalogue);
  if (!base) return null;
  const s = configured(base, c, postcode, data, rebateFrom);
  const q = priceSystem(s, { postcode, asOf: todayAEST(), rebateFrom }, data);
  return { s, q };
}
