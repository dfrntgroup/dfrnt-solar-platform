// Step prices: what one more (or one fewer) panel costs, and what each battery size costs, after rebates.
// The most useful "individual price" a buyer can have: shown on the configurator buttons.
import { configOptions, findSystem, rebateWindow, type ConfigInput } from "@dfrnt/engine";
import { priceChoice, type Choice } from "./configure";
import type { FullData } from "./pricing-data";
import { todayAEST } from "./api";

export interface StepPrices {
  /** you-pay change for one panel fewer / one more (null at the end of the range). */
  panel: { down: number | null; up: number | null };
  /** you-pay for each battery module count offered (keyed by module count). */
  modules: Record<number, number>;
}

export function stepPrices(slug: string, c: Choice, postcode: string, data: FullData, rebateFrom?: string | null): StepPrices | null {
  const s = findSystem(slug, data.catalogue);
  if (!s) return null;
  const installDate = rebateWindow(todayAEST(), data.rebates, rebateFrom).rebate_date;
  const opts = configOptions({ backup: "none", roofType: "tin", storeys: 1, tilt: false, batteryLocation: "other", vehicleExposure: false, postcode, installDate, ...s.config } as ConfigInput, data.rules);
  const pay = (ch: Choice) => { const r = priceChoice(slug, ch, postcode, data, rebateFrom); return r && r.q.config.ok ? r.q.stack.amount_payable : null; };
  const here = pay(c);
  const i = opts.panels.indexOf(c.panels);
  const at = (p: number | undefined) => (p === undefined || here === null ? null : (() => { const v = pay({ ...c, panels: p }); return v === null ? null : Math.round(v - here); })());
  const panel = s.config.panelCount > 0 && i >= 0 ? { down: at(opts.panels[i - 1]), up: at(opts.panels[i + 1]) } : { down: null, up: null };
  const modules: Record<number, number> = {};
  for (const m of opts.modules) { const v = pay({ ...c, modules: m }); if (v !== null) modules[m] = Math.round(v); }
  return { panel, modules };
}
