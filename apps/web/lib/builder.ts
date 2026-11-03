// Build your own (approved 3 Nov 2026): the customer picks phase → brand → inverter → battery → panels → backup.
// Everything is checked by the same engine as the product pages. What's offered is what we already sell:
// the inverters the catalogue systems use, the battery module each brand family uses, Risen and LONGi panels.
import { autoStacks, priceSystem, resolveConfig, type CatalogueSystem, type ConfigInput, type ConfigRules, type Quote } from "@dfrnt/engine";
import type { FullData } from "./pricing-data";

export const BUILD_PANELS = ["PNL-RISEN-475", "PNL-LONGI-475"] as const;
const BRAND_ORDER = ["SolaX", "Sungrow", "GoodWe"];

export interface BuildChoice { phases: 1 | 3; family?: string; inverterSku?: string; modules?: number; panelSku?: string | null; panels?: number; backup?: boolean }

const BASE = { roofType: "tin", storeys: 1, tilt: false, batteryLocation: "other", vehicleExposure: false, inverterMeterIntegration: true } as const;

/** Inverters actually sold today: the one each catalogue system resolves to (plus any it names). */
export function soldInverters(data: FullData): Map<string, string> {
  const out = new Map<string, string>(); // sku → family
  for (const s of data.catalogue.systems) {
    const o = resolveConfig({ ...BASE, backup: "none", postcode: "4551", installDate: "2026-11-15", ...s.config } as ConfigInput, { rules: data.rules });
    if (o.inverter) out.set(o.inverter.sku, s.config.familyKey);
    for (const k of [s.config.inverterSku, s.config.preferInverterSku]) if (k) out.set(k, s.config.familyKey);
  }
  return out;
}

const input = (c: Required<Pick<BuildChoice, "family" | "inverterSku">> & BuildChoice, postcode: string, rebateDate: string): ConfigInput => ({
  ...BASE, backup: c.backup ? "whole_home" : "none", postcode, installDate: rebateDate,
  familyKey: c.family, inverterSku: c.inverterSku, phases: c.phases,
  panelSku: c.panels && c.panelSku ? c.panelSku : "", panelCount: c.panelSku ? c.panels ?? 0 : 0,
  batteryModules: c.modules ?? 0, stacks: 1,
} as ConfigInput);

const ok = (o: ReturnType<typeof resolveConfig>) => o.blockers.every((b) => b.step === "cec");
function resolveWithStacks(i: ConfigInput, rules: ConfigRules) {
  const stacks = autoStacks(i, rules);
  return { stacks, o: resolveConfig({ ...i, stacks: stacks ?? 1 }, { rules }) };
}

export interface BuildOptions {
  brands: { family: string; brand: string; battery: string; from?: number }[];
  inverters: { sku: string; model: string; kw: number; batteryKw: number | null; backup: boolean; maxPanels: number | null; batteryOnly: boolean }[];
  modules: { n: number; kwh: number; ok: boolean; why?: string }[];
  moduleName: string; moduleKwh: number;
  panels: { sku: string; name: string; watts: number; costDelta?: number }[];
  panelRange: number[];
  backupAvailable: boolean;
  choice: BuildChoice;
  price: null | { ok: boolean; you_pay: number; before: number; rebates: number; stcs: number; kw: number; kwh: number; powerKw: number | null; inverter: string; parts: { qty: number; name: string }[]; warnings: string[]; blockers: string[]; title: string; moduleLabel: string; batteryRebate: number; backupDelta: number | null; equipment: number; installation: number; gst: number };
}

/** What's allowed for the choices so far, with reasons, and the live price once the build is complete. */
export function buildOptions(raw: BuildChoice, postcode: string, rebateDate: string, data: FullData, site: { postcode: string; asOf: string; rebateFrom?: string | null }): BuildOptions {
  const rules = data.rules;
  const sold = soldInverters(data);
  const c: BuildChoice = { ...raw };
  // Brands (families) that have an inverter we sell in this phase.
  const fams = [...new Set([...sold.values()])].filter((f) => rules.families[f]?.phases === c.phases);
  const brands = fams.map((f) => ({ family: f, brand: rules.families[f]!.brand, battery: rules.battery_families[rules.families[f]!.battery_family]?.module.model ?? "" }))
    .sort((a, b) => BRAND_ORDER.indexOf(a.brand) - BRAND_ORDER.indexOf(b.brand));
  for (const b of brands) {
    const cheapest = data.catalogue.systems.filter((s) => s.config.familyKey === b.family).map((s) => priceSystem(s, site, data).stack.amount_payable);
    if (cheapest.length) (b as { from?: number }).from = Math.min(...cheapest);
  }
  if (!c.family || !fams.includes(c.family)) { c.family = undefined; c.inverterSku = undefined; }
  const invList = c.family ? [...sold.entries()].filter(([, f]) => f === c.family).map(([sku]) => sku).filter((sku) => rules.inverters[sku]) : [];
  invList.sort((a, b) => rules.inverters[a]!.ac_w - rules.inverters[b]!.ac_w);
  if (c.inverterSku && !invList.includes(c.inverterSku)) c.inverterSku = undefined;
  // Picking a brand opens on its biggest solar inverter with Risen panels, so there's a price straight away.
  if (c.family && !c.inverterSku) c.inverterSku = [...invList].reverse().find((k) => !rules.inverters[k]!.battery_only) ?? invList.at(-1);
  if (c.inverterSku && c.panelSku === undefined) c.panelSku = "PNL-RISEN-475";
  const fam = c.family ? rules.families[c.family] : undefined;
  const bf = fam ? rules.battery_families[fam.battery_family] : undefined;
  const moduleKwh = bf?.module.kwh_usable_cec ?? 0;

  const inverters = invList.map((sku) => {
    const v = rules.inverters[sku]! as typeof rules.inverters[string] & { bat_w?: number };
    let maxPanels: number | null = null;
    const probe = (n: number, m: number) => ok(resolveWithStacks(input({ ...c, family: c.family!, inverterSku: sku, panelSku: "PNL-RISEN-475", panels: n, modules: m }, postcode, rebateDate), rules).o);
    const m = [c.modules, 3, 2, 4].find((x): x is number => !!x && probe(10, x));
    if (!v.battery_only && m) for (let n = 40; n >= 6; n--) { if (probe(n, m)) { maxPanels = n; break; } }
    return { sku, model: v.model, kw: Math.round(v.ac_w / 100) / 10, batteryKw: v.bat_w ? Math.round(v.bat_w / 100) / 10 : null, backup: !!(v.backup && Object.keys(v.backup).length), maxPanels, batteryOnly: !!v.battery_only };
  });

  const modules: BuildOptions["modules"] = [];
  if (c.family && c.inverterSku) {
    const rule = bf?.rules[c.family];
    const max = rule ? rule.modules_per_stack[1] * rule.max_stacks : 0;
    for (let n = 1; n <= max; n++) {
      const { o, stacks } = resolveWithStacks(input({ ...c, family: c.family, inverterSku: c.inverterSku, modules: n, panelSku: null }, postcode, rebateDate), rules);
      const good = stacks != null && ok(o);
      modules.push({ n, kwh: Math.round(n * moduleKwh * 100) / 100, ok: good, why: good ? undefined : o.blockers.filter((b) => b.step !== "cec")[0]?.message });
    }
    const valid = modules.filter((m) => m.ok).map((m) => m.n);
    if (!c.modules || !valid.includes(c.modules)) c.modules = valid.includes(3) ? 3 : valid[0];
  }

  if (c.inverterSku && rules.inverters[c.inverterSku]?.battery_only) { c.panelSku = null; c.panels = 0; }
  if (c.panelSku && !(BUILD_PANELS as readonly string[]).includes(c.panelSku)) c.panelSku = undefined;
  const panelRange: number[] = [];
  if (c.family && c.inverterSku && c.panelSku) {
    for (let n = 6; n <= 40; n++) if (ok(resolveWithStacks(input({ ...c, family: c.family, inverterSku: c.inverterSku, panels: n }, postcode, rebateDate), rules).o)) panelRange.push(n);
    if (!c.panels || !panelRange.includes(c.panels)) c.panels = panelRange.includes(21) ? 21 : panelRange[Math.floor(panelRange.length / 2)];
  }
  const backupAvailable = !!(c.inverterSku && (rules.inverters[c.inverterSku] as { backup?: object })?.backup && Object.keys((rules.inverters[c.inverterSku] as { backup?: object }).backup!).length);
  if (!backupAvailable) c.backup = false;

  const risen = data.costs.items["PNL-RISEN-475"]?.cost_ex_gst ?? 0;
  const panels = BUILD_PANELS.filter((p) => rules.panels[p]).map((p) => {
    const cost = data.costs.items[p]?.cost_ex_gst ?? 0;
    return { sku: p, name: p.includes("RISEN") ? "Risen 475 W" : "LONGi 475 W", watts: rules.panels[p]!.watts, costDelta: Math.round((cost - risen) / (1 - data.margins.hardware) * 1.1) };
  });

  let price: BuildOptions["price"] = null;
  if (c.family && c.inverterSku && c.modules && (c.panelSku === null || (c.panelSku && c.panels))) {
    const i = input({ ...c, family: c.family, inverterSku: c.inverterSku }, postcode, rebateDate);
    const stacks = autoStacks(i, rules) ?? 1;
    const sys: CatalogueSystem = { slug: "custom", title: "Custom", brand: fam!.brand, tier: "core", kind: i.panelCount > 0 ? "solar_battery" : "battery_only", config: { ...i, stacks } as CatalogueSystem["config"] };
    const q: Quote = priceSystem(sys, site, data);
    let backupDelta: number | null = null;
    if (backupAvailable) {
      const flip = { ...i, backup: c.backup ? "none" : "whole_home" } as ConfigInput;
      const other = priceSystem({ ...sys, config: { ...flip, stacks } as CatalogueSystem["config"] }, site, data).stack.amount_payable;
      backupDelta = Math.round(Math.abs(q.stack.amount_payable - other));
    }
    const cfg = q.config;
    const parts = cfg.bom.filter((b) => !b.included && /^(PNL|INV|PRT)/.test(b.sku) && b.qty > 0).map((b) => ({ qty: b.qty, name: b.description }));
    price = {
      ok: q.config.ok, you_pay: q.stack.amount_payable, before: q.stack.price_inc_gst, rebates: q.stack.less_stcs, stcs: q.rebate.solar_stcs + q.rebate.battery_stcs,
      kw: cfg.panel_kw, kwh: cfg.usable_kwh, powerKw: cfg.stacks?.power_kw ?? null, inverter: cfg.inverter?.model ?? "", parts,
      warnings: cfg.warnings.map((w) => w.message), blockers: cfg.blockers.map((b) => b.message),
      moduleLabel: cfg.bom.find((b) => b.serial === "module")?.description ?? bf?.module.model ?? "", batteryRebate: q.rebate.battery_rebate, backupDelta, equipment: q.stack.hardware_ex_gst, installation: q.stack.installation_ex_gst, gst: q.stack.gst,
      title: buildTitle(fam!.brand, rules.inverters[c.inverterSku]!.ac_w, cfg.usable_kwh, cfg.panel_kw, c.panelSku ?? null, !!c.backup),
    };
  }
  return { brands, inverters, modules, moduleName: bf?.module.model ?? "", moduleKwh, panels, panelRange, backupAvailable, choice: c, price };
}

export function buildTitle(brand: string, acW: number, kwh: number, kw: number, panelSku: string | null, backup: boolean) {
  const r = (n: number) => Math.round(n * 10) / 10;
  return `Custom · ${brand} ${r(acW / 1000)} kW · ${r(kwh)} kWh${kw ? ` · ${r(kw)} kW ${panelSku?.includes("LONGI") ? "LONGi" : "Risen"}` : " · battery only"}${backup ? " · backup" : ""}`;
}

/** Query string that reopens the builder on a choice (product-page link, lapsed custom quotes). */
export function buildHref(c: { phases?: 1 | 3 | "unknown"; familyKey?: string; inverterSku?: string; batteryModules?: number; panelSku?: string | null; panelCount?: number; backup?: string }, postcode?: string) {
  const q = new URLSearchParams();
  q.set("ph", String(c.phases === 3 ? 3 : 1));
  if (c.familyKey) q.set("f", c.familyKey);
  if (c.inverterSku) q.set("inv", c.inverterSku);
  if (c.batteryModules) q.set("m", String(c.batteryModules));
  if (c.panelCount && c.panelSku) { q.set("p", c.panelSku); q.set("n", String(c.panelCount)); } else if (c.familyKey) q.set("p", "none");
  if (c.backup === "whole_home") q.set("b", "1");
  if (postcode) q.set("postcode", postcode);
  return `/build?${q}`;
}

/** Parse the builder's query string (inverse of buildHref). */
export function choiceFromQuery(sp: Record<string, string | string[] | undefined>): BuildChoice {
  const g = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const n = (k: string) => { const v = Number(g(k)); return Number.isInteger(v) && v >= 0 && v <= 60 ? v : undefined; };
  const p = g("p");
  return { phases: g("ph") === "3" ? 3 : 1, family: g("f")?.slice(0, 40), inverterSku: g("inv")?.slice(0, 40), modules: n("m"),
    panelSku: p === "none" ? null : p?.slice(0, 40), panels: n("n"), backup: g("b") === "1" };
}

/** The quote config for a complete, engine-checked build (what secureBuild saves). */
export function buildConfig(c: BuildChoice, postcode: string, rebateDate: string, rules: ConfigRules): ConfigInput {
  const i = input({ ...c, family: c.family!, inverterSku: c.inverterSku! }, postcode, rebateDate);
  return { ...i, stacks: autoStacks(i, rules) ?? 1 };
}
