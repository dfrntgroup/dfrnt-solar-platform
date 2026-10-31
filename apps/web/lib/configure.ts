import { autoStacks, findSystem, priceSystem, rebateWindow, type CatalogueSystem, type ConfigInput } from "@dfrnt/engine";
import { todayAEST } from "./api";

export interface Choice { panels: number; modules: number; backup: "none" | "whole_home" }

/** The catalogue system with the customer's changes applied (stacks chosen automatically). */
export function configured(s: CatalogueSystem, c: Choice, postcode: string): CatalogueSystem {
  const config = { ...s.config, panelCount: s.config.panelCount > 0 ? c.panels : 0, batteryModules: c.modules, backup: c.backup,
    inverterSku: c.panels === s.config.panelCount ? s.config.inverterSku : undefined, preferInverterSku: c.panels === s.config.panelCount ? s.config.preferInverterSku : undefined };
  const full = { roofType: "tin", storeys: 1, tilt: false, batteryLocation: "other", vehicleExposure: false, postcode, installDate: rebateWindow(todayAEST()).lock_until, ...config } as ConfigInput;
  const stacks = autoStacks(full) ?? 1;
  return { ...s, config: { ...config, stacks } as CatalogueSystem["config"] };
}

export function priceChoice(slug: string, c: Choice, postcode: string) {
  const base = findSystem(slug);
  if (!base) return null;
  const s = configured(base, c, postcode);
  const q = priceSystem(s, { postcode, asOf: todayAEST() });
  return { s, q };
}
