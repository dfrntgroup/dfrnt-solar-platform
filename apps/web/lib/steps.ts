// Step prices: what one more (or one fewer) panel costs, and what each battery size costs, after rebates.
// The most useful "individual price" a buyer can have: shown on the configurator buttons.
import { configOptions, findSystem, rebateWindow, type ConfigInput } from "@dfrnt/engine";
import { baseInverter, priceChoice, type Choice } from "./configure";
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
  const inverterSku = c.inverterSku ?? baseInverter(s, postcode, data, rebateFrom);
  const opts = configOptions({ backup: "none", roofType: "tin", storeys: 1, tilt: false, batteryLocation: "other", vehicleExposure: false, postcode, installDate, ...s.config, inverterSku, preferInverterSku: undefined } as ConfigInput, data.rules, { fixedInverter: true });
  const pay = (ch: Choice) => { const r = priceChoice(slug, ch, postcode, data, rebateFrom); return r && r.q.config.ok ? r.q.stack.amount_payable : null; };
  const here = pay(c);
  const i = opts.panels.indexOf(c.panels);
  const at = (p: number | undefined) => (p === undefined || here === null ? null : (() => { const v = pay({ ...c, panels: p }); return v === null ? null : Math.round(v - here); })());
  const panel = s.config.panelCount > 0 && i >= 0 ? { down: at(opts.panels[i - 1]), up: at(opts.panels[i + 1]) } : { down: null, up: null };
  const modules: Record<number, number> = {};
  for (const m of opts.modules) { const v = pay({ ...c, modules: m }); if (v !== null) modules[m] = Math.round(v); }
  return { panel, modules };
}

/** The inverters a customer may swap in on a product page: every inverter we sell in the system's family, priced at the current counts. */
export interface InverterOption { sku: string; model: string; kw: number; you_pay: number | null; current: boolean; reason: string; blocker?: string }

export function inverterOptions(slug: string, c: Choice, postcode: string, data: FullData, rebateFrom?: string | null): InverterOption[] {
  const s = findSystem(slug, data.catalogue);
  if (!s) return [];
  const rules = data.rules;
  const current = c.inverterSku ?? baseInverter(s, postcode, data, rebateFrom);
  const sold = new Set<string>();
  for (const x of data.catalogue.systems) if (x.config.familyKey === s.config.familyKey) { for (const k of [x.config.inverterSku, x.config.preferInverterSku, baseInverter(x, postcode, data, rebateFrom)]) if (k) sold.add(k); }
  const skus = [...sold].filter((k) => rules.inverters[k] && (s.config.panelCount === 0 || !rules.inverters[k]!.battery_only)).sort((a, b) => rules.inverters[a]!.ac_w - rules.inverters[b]!.ac_w);
  const installDate = rebateWindow(todayAEST(), data.rebates, rebateFrom).rebate_date;
  return skus.map((sku) => {
    const inv = rules.inverters[sku]!;
    const r = priceChoice(slug, { ...c, inverterSku: sku }, postcode, data, rebateFrom);
    const ok = !!r && r.q.config.ok;
    const kw = Math.round(inv.ac_w / 100) / 10;
    // Headroom: most panels this inverter carries with the current battery.
    const opts = ok ? configOptions({ backup: "none", roofType: "tin", storeys: 1, tilt: false, batteryLocation: "other", vehicleExposure: false, postcode, installDate, ...s.config, inverterSku: sku, preferInverterSku: undefined, batteryModules: c.modules } as ConfigInput, rules, { fixedInverter: true }) : null;
    const bat = r?.q.config.warnings.find((w) => /^Battery limited to ([\d.]+) kW/.test(w.message))?.message.match(/([\d.]+) kW/)?.[1];
    const maxP = opts?.panels.length ? Math.max(...opts.panels) : null;
    const reason = ok ? [`${kw} kW`, bat ? `battery up to ${bat} kW` : "full battery power", maxP && s.config.panelCount > 0 ? `up to ${maxP} panels` : ""].filter(Boolean).join(" · ") : `${kw} kW`;
    return { sku, model: inv.model, kw, you_pay: ok ? Math.round(r!.q.stack.amount_payable) : null, current: sku === current, reason, blocker: ok ? undefined : r?.q.config.blockers[0]?.message ?? "Doesn't fit these counts" };
  });
}
