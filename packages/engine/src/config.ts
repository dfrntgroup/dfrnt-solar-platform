// Configuration engine. Pure, no IO. Ported from Solar Ops src/lib/config.ts (Lovable commit 6bff73a)
// with Shopify variant pricing removed: BOM lines are priced from component costs in pricing.ts.
// Changes from the port: battery labour per stack only (SVC-BAT-MODULE retired); BOM always lists
// physical modules + stack parts (the manufacturer stack products were pricing units only and sum identically).
import rulesJson from "./data/config-rules.json";
import { batteryFactor, batteryStcsWithFactor, solarStcs, DEFAULT_REBATE_SETTINGS } from "./rebates";
import { stcZoneOrDefault } from "./zones";
import type { LabourRequest } from "./pricing";

/* ---------- rule shapes ---------- */
export interface PanelRule { model: string; watts: number; voc: number; vmp: number; isc: number; imp: number; tc_voc_pct: number; tc_pmax_pct: number; w_mm?: number; h_mm?: number; default?: boolean; toggle_of?: string; status?: string }
export interface InverterRule {
  family: string; model: string; ac_w: number; max_dc_w: number; max_dc_v: number; fault_v?: number; stop_v?: number;
  mppt_v: [number, number]; start_v?: number; full_power_v?: number; mppts: number;
  strings_per_mppt: number | number[]; a_per_mppt: number | number[]; isc_per_mppt: number | number[];
  mppt_max_w?: number | number[]; same_string_per_mppt?: boolean;
  bat_v?: [number, number]; backup?: Record<string, { parts: string[]; labour?: string; note?: string }>;
  battery_only?: boolean; status?: string; includes_modules?: number;
}
export interface BatteryStackRule {
  modules_per_stack: [number, number]; allowed_modules?: number[]; allowed_on_confirmation?: number[]; max_stacks: number;
  equal_stacks_required?: boolean; stack2_parts?: string[]; stack3plus_parts?: string[];
  series_box_from_modules?: number; series_box_part?: string; splitter_part?: string;
  power_kw_by_modules?: Record<string, number>; power_rule?: string; mixing_allowed?: boolean;
  max_modules_by_inverter?: Record<string, number>;
}
export interface BatteryFamilyRule {
  module: { sku: string; model: string; kwh_nominal: number; kwh_usable_cec: number; v?: number; kw?: number; w_mm?: number };
  stack_parts: { first: string[]; additional: string[] };
  products_by_modules?: Record<string, string>;
  rules: Record<string, BatteryStackRule>;
  status?: string;
}
export interface DnspRule { name: string; state: string; postcodes: [number, number][]; inverter_kva_1p?: number; inverter_kva_3p?: number; hybrid_cap_1p?: number; inverter_kva_aggregate?: number; export_kw_per_phase?: number }
export interface FamilyRule { brand: string; grammar: string; phases: 1 | 3; battery_family: string; launch: string; default_panel?: string; status?: string }
export interface ConfigRules {
  version: string;
  design_limits: { domestic_max_dc_v: number; cell_temp_min_c: number; cell_temp_max_c: number; isc_design_factor: number; no_battery_array_ratio_max: number; preferred_max_oversize?: number };
  panels: Record<string, PanelRule>;
  families: Record<string, FamilyRule>;
  inverters: Record<string, InverterRule>;
  battery_families: Record<string, BatteryFamilyRule>;
  dnsp: DnspRule[];
  parts_needed?: Record<string, string>;
}
export const DEFAULT_RULES = rulesJson as unknown as ConfigRules;

/* ---------- input / output ---------- */
export type Backup = "none" | "subboard" | "whole_home";
export interface ConfigInput {
  familyKey: string; panelSku: string; panelCount: number; batteryModules: number; stacks: number;
  backup: Backup; phases: 1 | 3 | "unknown"; postcode: string;
  roofType: "tin" | "tile" | "kliplok"; storeys: number; tilt: boolean;
  batteryLocation: "garage" | "outdoor_wall" | "other"; againstHabitableRoom?: boolean; vehicleExposure: boolean;
  /** yyyy-mm-dd */
  installDate: string;
  inverterSku?: string;
  preferInverterSku?: string;
  confirmations?: string[];
  /** Grid meter change is a separately quoted service, never priced here. */
  gridMeterChange?: boolean;
  /** Inverter smart meter / CT integration labour (SVC-METER-1P/3P). */
  inverterMeterIntegration?: boolean;
  /** NMI already claimed a battery rebate: no battery STCs. */
  priorBatteryClaim?: boolean;
}
export interface StringInput { mppt: number; strings: number; panels_per_string: number }
export interface StringPlan { inputs: StringInput[]; strings: number; per_string_min: number; per_string_max: number; voc_cold: number; vmp_hot: number; min_total: number; max_total: number }
export interface BomLine { sku: string; qty: number; description: string; serial?: "panel" | "inverter" | "module" | "bms" | "gateway"; included?: string }
export interface Issue { step: string; message: string; nearest?: number }
export interface ConfigOutput {
  ok: boolean; rules_version: string; input: ConfigInput; warnings: Issue[]; blockers: Issue[];
  dnsp: (DnspRule & { cap_kva: number | null }) | null;
  inverter: { sku: string; model: string; ac_w: number } | null;
  panel_kw: number; strings: StringPlan | null;
  stacks: { modules: number[]; electrical_banks: number; physical_towers: number; power_kw: number | null; parts: string[] } | null;
  usable_kwh: number;
  rebates: { solar_stcs: number; battery_stcs: number; eligible_kw: number; marginal_last_module_stcs: number };
  labour: LabourRequest[]; bom: BomLine[];
  summary: string;
  panel_source: "input" | "family_default" | "none";
  modules: { total: number; built_in: number; purchased: number };
}

const arr = <T,>(v: T | T[], i: number, fallback: T): T => (Array.isArray(v) ? (v[i] ?? fallback) : v);

/* ---------- a. DNSP ---------- */
export function resolveDnsp(rules: ConfigRules, postcode: string, phases: 1 | 3) {
  const p = parseInt(postcode, 10);
  const d = rules.dnsp.find((r) => r.postcodes.some(([lo, hi]) => p >= lo && p <= hi));
  if (!d) return null;
  const kva = phases === 1 ? (d.hybrid_cap_1p ?? d.inverter_kva_1p ?? d.inverter_kva_aggregate) : (d.inverter_kva_3p ?? d.inverter_kva_aggregate);
  return { ...d, cap_kva: kva ?? null };
}

/* ---------- c. Strings ---------- */
export function stringWindow(inv: InverterRule, panel: PanelRule, rules: ConfigRules) {
  const lim = rules.design_limits;
  const vocCold = panel.voc * (1 + (panel.tc_voc_pct / 100) * (lim.cell_temp_min_c - 25));
  const vmpHot = panel.vmp * (1 + (panel.tc_pmax_pct / 100) * (lim.cell_temp_max_c - 25));
  const vmax = Math.min(inv.max_dc_v, lim.domestic_max_dc_v, inv.fault_v ?? Infinity, inv.stop_v ?? Infinity);
  const vmin = Math.max(inv.mppt_v[0], inv.start_v ?? 0, inv.full_power_v ?? 0);
  return { vocCold, vmpHot, max: Math.floor(vmax / vocCold + 1e-9), min: Math.ceil(vmin / vmpHot - 1e-9) };
}

function mpptStringCap(inv: InverterRule, panel: PanelRule, rules: ConfigRules, i: number) {
  const slots = arr(inv.strings_per_mppt, i, 1);
  const a = arr(inv.a_per_mppt, i, Infinity);
  const isc = arr(inv.isc_per_mppt, i, Infinity);
  let n = 0;
  for (let s = 1; s <= slots; s++) if (panel.imp * s <= a + 1e-9 && panel.isc * rules.design_limits.isc_design_factor * s <= isc + 1e-9) n = s;
  return n;
}

export function planStrings(inv: InverterRule, panel: PanelRule, rules: ConfigRules, count: number): { plan: StringInput[] | null; reason?: string } {
  const w = stringWindow(inv, panel, rules);
  if (inv.full_power_v && count < w.min) w.min = Math.ceil(Math.max(inv.mppt_v[0], inv.start_v ?? 0) / w.vmpHot - 1e-9);
  if (w.min > w.max) return { plan: null, reason: `String window empty (${w.min}–${w.max} panels)` };
  const caps = Array.from({ length: inv.mppts }, (_, i) => mpptStringCap(inv, panel, rules, i));
  if (caps.every((c) => c === 0)) return { plan: null, reason: `Panel current exceeds the inverter's MPPT current limit (Isc ${panel.isc} A × ${rules.design_limits.isc_design_factor})` };
  const totalSlots = caps.reduce((s, c) => s + c, 0);
  for (let k = 1; k <= totalSlots; k++) {
    if (count < k * w.min || count > k * w.max) continue;
    const base = Math.floor(count / k), extra = count % k;
    const lengths = Array.from({ length: k }, (_, i) => base + (i >= k - extra ? 1 : 0));
    const assign: number[][] = caps.map(() => []);
    let li = 0;
    for (let round = 1; round <= Math.max(...caps) && li < k; round++)
      for (let m = 0; m < caps.length && li < k; m++) if ((caps[m] ?? 0) >= round) assign[m]!.push(lengths[li++]!);
    let ok = true;
    const inputs: StringInput[] = [];
    assign.forEach((ls, m) => {
      if (!ls.length) return;
      if (inv.same_string_per_mppt && new Set(ls).size > 1) ok = false;
      const mw = arr(inv.mppt_max_w ?? Infinity, m, Infinity);
      if (ls.reduce((s, l) => s + l, 0) * panel.watts > mw) ok = false;
      if (inv.same_string_per_mppt || ls.every((l) => l === ls[0])) inputs.push({ mppt: m + 1, strings: ls.length, panels_per_string: ls[0]! });
      else ls.forEach((l) => inputs.push({ mppt: m + 1, strings: 1, panels_per_string: l }));
    });
    if (ok) return { plan: inputs };
  }
  return { plan: null, reason: `${count} panels do not fit ${w.min}–${w.max} per string on ${inv.model}` };
}

/* ---------- d. Stacks ---------- */
function stackSplit(modules: number, stacks: number) {
  const base = Math.floor(modules / stacks), extra = modules % stacks;
  return Array.from({ length: stacks }, (_, i) => base + (i < extra ? 1 : 0));
}

const resolvePart = (token: string, invSku: string) => (token === "same_ec_model" || token === "second_energy_controller" ? invSku : token);

function checkBattery(fam: BatteryFamilyRule, rule: BatteryStackRule | undefined, inv: InverterRule, input: ConfigInput, sku: string) {
  const blockers: Issue[] = [], warnings: Issue[] = [];
  if (input.batteryModules <= 0) return { blockers, warnings, split: [] as number[], parts: [] as string[], power: null as number | null };
  if (!rule) return { blockers: [{ step: "stacks", message: `${fam.module.model} is not supported on ${inv.model}` }], warnings, split: [] as number[], parts: [] as string[], power: null as number | null };
  const stacks = Math.max(1, input.stacks);
  const split = stackSplit(input.batteryModules, stacks);
  if (stacks > rule.max_stacks) blockers.push({ step: "stacks", message: `Max ${rule.max_stacks} stack(s) on ${inv.model}`, nearest: rule.max_stacks });
  if (rule.equal_stacks_required && input.batteryModules % stacks !== 0) blockers.push({ step: "stacks", message: "Stacks must hold equal module counts", nearest: Math.floor(input.batteryModules / stacks) * stacks });
  for (const n of new Set(split)) {
    const cap = rule.max_modules_by_inverter?.[sku];
    if (cap !== undefined && n > cap) blockers.push({ step: "stacks", message: `SBH${n * 50} exceeds ${inv.model} limit`, nearest: cap * stacks });
    const [lo, hi] = rule.modules_per_stack;
    if (n < lo || n > hi) blockers.push({ step: "stacks", message: `${n} module(s) per stack outside ${lo}–${hi}`, nearest: Math.min(hi, Math.max(lo, n)) * stacks });
    else if (rule.allowed_modules && !rule.allowed_modules.includes(n)) {
      if (rule.allowed_on_confirmation?.includes(n)) {
        if (!input.confirmations?.includes(`stack_${n}`)) blockers.push({ step: "stacks", message: `${n} modules per stack needs manufacturer confirmation (confirmation stack_${n})` });
        else warnings.push({ step: "stacks", message: `${n} modules per stack allowed on written confirmation` });
      } else blockers.push({ step: "stacks", message: `${n} modules per stack not allowed`, nearest: Math.max(...rule.allowed_modules) * stacks });
    }
    if (fam.module.v && inv.bat_v && !inv.includes_modules) {
      const v = n * fam.module.v;
      if (v < inv.bat_v[0] || v > inv.bat_v[1]) blockers.push({ step: "stacks", message: `Battery voltage ${v.toFixed(1)} V outside ${inv.bat_v[0]}–${inv.bat_v[1]} V on ${inv.model}` });
    }
  }
  const parts: string[] = [];
  const connectionParts = new Set<string>();
  split.forEach((_, i) => {
    const base = i === 0 ? fam.stack_parts.first : fam.stack_parts.additional;
    const extra = i === 0 ? [] : i === 1 ? rule.stack2_parts ?? [] : rule.stack3plus_parts ?? rule.stack2_parts ?? [];
    parts.push(...new Set([...base, ...extra].map((p) => resolvePart(p, sku)).filter((p) => {
      if (!/Y-CONNECTOR|COMBINER/.test(p)) return true;
      if (connectionParts.has(p)) return false;
      connectionParts.add(p); return true;
    })));
  });
  if (stacks >= 2 && rule.splitter_part) parts.push(rule.splitter_part);
  if (rule.series_box_from_modules && split.some((n) => n >= rule.series_box_from_modules!) && rule.series_box_part) parts.push(rule.series_box_part);
  let power: number | null = null;
  if (rule.power_rule === "sum_of_module_kw" && fam.module.kw) power = input.batteryModules * fam.module.kw;
  else if (rule.power_kw_by_modules) {
    const table = rule.power_kw_by_modules;
    const keys = Object.keys(table).map(Number).sort((a, b) => a - b);
    power = split.reduce((s, n) => { const k = keys.filter((x) => x <= n).pop(); return s + (k != null ? table[String(k)]! : 0); }, 0);
  }
  // The house can only draw what the inverter can pass through, however big the battery is.
  const invCapKw = ((inv as { bat_w?: number }).bat_w ?? inv.ac_w) / 1000;
  if (power != null && power > invCapKw) power = invCapKw;
  if (power != null && power * 1000 < inv.ac_w - 1e-6) warnings.push({ step: "stacks", message: `Battery limited to ${Math.round(power * 10) / 10} kW (inverter ${inv.ac_w / 1000} kW)` });
  return { blockers, warnings, split, parts, power: power != null ? Math.round(power * 100) / 100 : null };
}

export function inverterSkuForModel(rules: ConfigRules, familyKey: string, model: string | null | undefined) {
  if (!model) return undefined;
  const m = model.trim().toLowerCase();
  return Object.entries(rules.inverters).find(([sku, inv]) => inv.family === familyKey && (sku.toLowerCase() === m || inv.model.toLowerCase() === m))?.[0];
}

/* ---------- engine ---------- */
export function resolveConfig(inputArg: ConfigInput, ctx: { rules?: ConfigRules } = {}): ConfigOutput {
  const rules = ctx.rules ?? DEFAULT_RULES;
  let input = inputArg;
  const warnings: Issue[] = [], blockers: Issue[] = [];
  const out = (partial: Partial<ConfigOutput>): ConfigOutput => ({
    ok: false, rules_version: rules.version, input, warnings, blockers, dnsp: null, inverter: null,
    panel_kw: 0, strings: null, stacks: null, usable_kwh: 0,
    rebates: { solar_stcs: 0, battery_stcs: 0, eligible_kw: 0, marginal_last_module_stcs: 0 },
    labour: [], bom: [], summary: "", panel_source: "none", modules: { total: 0, built_in: 0, purchased: 0 }, ...partial,
  });
  const family = rules.families[input.familyKey];
  if (!family) { blockers.push({ step: "input", message: `Unknown family ${input.familyKey}` }); return out({}); }
  const panelSource: ConfigOutput["panel_source"] = input.panelCount > 0 ? (input.panelSku ? "input" : "family_default") : "none";
  if (!input.panelSku) input = { ...input, panelSku: family.default_panel ?? "PNL-RISEN-475" };
  const panel = input.panelCount > 0 ? rules.panels[input.panelSku] : undefined;
  if (input.panelCount > 0 && !panel) { blockers.push({ step: "input", message: `Unknown panel ${input.panelSku}` }); return out({}); }
  const panelKw = panel ? Math.round(panel.watts * input.panelCount) / 1000 : 0;
  const hasBattery = input.batteryModules > 0;

  // a. DNSP + phases
  const phases: 1 | 3 = input.phases === "unknown" ? 1 : input.phases;
  if (input.phases === "unknown") warnings.push({ step: "dnsp", message: "Phases unknown: priced as single phase until the installer confirms from the switchboard photo" });
  if (family.phases !== phases) blockers.push({ step: "dnsp", message: phases === 3 ? `Your home has three-phase power and this ${family.brand} system is single-phase, so your installer will match it to a three-phase system` : `Your home has single-phase power and this ${family.brand} system is three-phase, so your installer will match it to a single-phase system` });
  const dnsp = resolveDnsp(rules, input.postcode, phases);
  if (!dnsp) warnings.push({ step: "dnsp", message: `No network rules for postcode ${input.postcode}; confirm limits with the installer` });
  const capW = dnsp?.cap_kva ? dnsp.cap_kva * 1000 : Infinity;

  // b. Inverter selection (+ c strings, d stacks per candidate)
  const famRule = rules.battery_families[family.battery_family];
  const stackRule = famRule?.rules[input.familyKey];
  const candidates = Object.entries(rules.inverters)
    .filter(([sku, inv]) => inv.family === input.familyKey && (!input.inverterSku || sku === input.inverterSku) && !(inv.battery_only && input.panelCount > 0))
    .sort((a, b) => a[1].ac_w - b[1].ac_w);
  if (!candidates.length) { blockers.push({ step: "inverter", message: "No inverter in this family" }); return out({ dnsp, panel_kw: panelKw }); }

  type Bat = ReturnType<typeof checkBattery>;
  const reasons: string[] = [];
  let nearest: number | undefined;
  let lastBat: Issue[] | null = null;
  let chosen: { sku: string; inv: InverterRule; plan: StringInput[] | null; bat: Bat } | null = null;
  const oversize = rules.design_limits.preferred_max_oversize ?? rules.design_limits.no_battery_array_ratio_max;
  const tryInv = (sku: string, inv: InverterRule, dcLimit: number, label: string) => {
    if (inv.ac_w > capW) { reasons.push(`${inv.model} ${inv.ac_w / 1000} kW exceeds ${dnsp?.name} ${dnsp?.cap_kva} kVA cap`); return null; }
    if (panelKw * 1000 > dcLimit + 1e-6) {
      reasons.push(`${panelKw} kW exceeds ${label} of ${inv.model}`);
      if (panel && !hasBattery) nearest = Math.max(nearest ?? 0, Math.floor(dcLimit / panel.watts));
      return null;
    }
    let plan: StringInput[] | null = null;
    if (panel) {
      const p = planStrings(inv, panel, rules, input.panelCount);
      if (!p.plan) { reasons.push(p.reason ?? "strings"); return null; }
      plan = p.plan;
    }
    const bat: Bat = famRule ? checkBattery(famRule, stackRule, inv, input, sku) : { blockers: hasBattery ? [{ step: "stacks", message: "No battery family" }] : [], warnings: [], split: [], parts: [], power: null };
    if (bat.blockers.length) { reasons.push(...bat.blockers.map((b) => b.message)); lastBat = bat.blockers; return null; }
    return { sku, inv, plan, bat };
  };
  const maxDcLabel = "max DC";
  const pctLabel = `${Math.round(oversize * 100)}%`;
  const pref = input.preferInverterSku ? candidates.find(([sku]) => sku === input.preferInverterSku) : undefined;
  if (pref) chosen = tryInv(pref[0], pref[1], hasBattery ? pref[1].max_dc_w : rules.design_limits.no_battery_array_ratio_max * pref[1].ac_w, hasBattery ? maxDcLabel : pctLabel);
  if (!chosen) for (const [sku, inv] of candidates) { chosen = tryInv(sku, inv, oversize * inv.ac_w, pctLabel); if (chosen) break; }
  if (!chosen && hasBattery) for (const [sku, inv] of [...candidates].reverse()) { chosen = tryInv(sku, inv, inv.max_dc_w, maxDcLabel); if (chosen) break; }
  if (chosen && panelKw * 1000 > oversize * chosen.inv.ac_w + 1e-6) warnings.push({ step: "inverter", message: "Array exceeds 133% of the inverter rating: allowed with a battery, expect some midday clipping" });
  const lb = lastBat as Issue[] | null;
  if (!chosen && lb && reasons.every((r) => lb.some((b) => b.message === r) || / exceeds .* kVA cap|max DC|%/.test(r))) blockers.push(...lb);
  if (!chosen) {
    if (!blockers.some((b) => b.step === "stacks")) blockers.push({ step: "inverter", message: [...new Set(reasons)].join("; ") || "No inverter fits", ...(nearest != null ? { nearest } : {}) });
    return out({ dnsp, panel_kw: panelKw });
  }
  const { sku: invSku, inv, plan, bat } = chosen;
  if (panel && inv.full_power_v && plan?.some((p) => p.panels_per_string * stringWindow(inv, panel, rules).vmpHot < (inv.full_power_v ?? 0))) warnings.push({ step: "strings", message: "String voltage below the full-power threshold; reduced solar output may apply" });
  warnings.push(...bat.warnings);
  if (family.status === "pending_cec") blockers.push({ step: "cec", message: `${family.brand} ${input.familyKey} is pending CEC listing` });
  if (inv.status === "pending_cec") blockers.push({ step: "cec", message: `${inv.model} is pending CEC listing` });
  if (hasBattery && famRule?.status === "pending_cec") blockers.push({ step: "cec", message: `${famRule.module.model} is pending CEC listing` });
  if (input.gridMeterChange) warnings.push({ step: "labour", message: "Grid/network meter change is a separately quoted service; not included or priced here" });
  if (inv.status && inv.status !== "verify") warnings.push({ step: "inverter", message: `${inv.model}: ${inv.status.replace(/_/g, " ")}` });

  let strings: StringPlan | null = null;
  if (panel) {
    const w = stringWindow(inv, panel, rules);
    let minT = Infinity, maxT = 0;
    const dcLimit = hasBattery ? inv.max_dc_w : rules.design_limits.no_battery_array_ratio_max * inv.ac_w;
    for (let n = w.min; n <= 200; n++) if (n * panel.watts <= dcLimit && planStrings(inv, panel, rules, n).plan) { minT = Math.min(minT, n); maxT = n; }
    strings = { inputs: plan ?? [], strings: (plan ?? []).reduce((s, i) => s + i.strings, 0), per_string_min: w.min, per_string_max: w.max, voc_cold: Math.round(w.vocCold * 100) / 100, vmp_hot: Math.round(w.vmpHot * 100) / 100, min_total: minT === Infinity ? 0 : minT, max_total: maxT };
  }

  // e. Rebates (STC counts only; dollars are in rebates.ts at the fixed rate)
  const zone = stcZoneOrDefault(input.postcode);
  const eligibleKw = hasBattery ? panelKw : Math.min(panelKw, (rules.design_limits.no_battery_array_ratio_max * inv.ac_w) / 1000);
  const moduleKwh = famRule?.module.kwh_usable_cec ?? 0;
  const usable = Math.round(input.batteryModules * moduleKwh * 100) / 100;
  const rebateKwh = input.priorBatteryClaim ? 0 : usable;
  const factor = batteryFactor(input.installDate, DEFAULT_REBATE_SETTINGS);
  const solar = solarStcs(eligibleKw, zone, input.installDate);
  const battery = batteryStcsWithFactor(rebateKwh, factor);
  const marginal = hasBattery && rebateKwh ? battery - batteryStcsWithFactor(rebateKwh - moduleKwh, factor) : 0;

  // f. Labour triggers — battery labour is per stack (first stack + each additional), never per module.
  const labour: LabourRequest[] = [];
  const nStrings = strings?.strings ?? 0;
  if (input.panelCount > 0) labour.push({ code: "SVC-SOLAR-INSTALL", qty: Math.ceil(panelKw * 10 - 1e-9) });
  const stacks = hasBattery ? Math.max(1, input.stacks) : 0;
  const seriesTowers = hasBattery && input.familyKey === "solax_x3hybrid_g4" && family.battery_family === "solax_hs51"
    && !!stackRule?.series_box_part && bat.split.some((n) => n >= (stackRule?.series_box_from_modules ?? Infinity));
  const physicalTowers = seriesTowers ? stacks * 2 : stacks;
  if (physicalTowers >= 1) labour.push({ code: "SVC-BATTERY-INSTALL", qty: 1 });
  if (physicalTowers >= 2) labour.push({ code: "SVC-BAT-ADD", qty: physicalTowers - 1 });
  if (input.backup === "whole_home") labour.push({ code: `SVC-EPS-WH-${phases}P`, qty: 1 });
  if (phases === 3) labour.push({ code: "SVC-3P-PROPERTY", qty: 1 });
  if (input.roofType === "tile") labour.push({ code: "SVC-TERRACOTTA", qty: 1 });
  if (input.tilt && input.panelCount > 0) labour.push({ code: "SVC-TILT", qty: input.panelCount });
  if (input.storeys >= 2) labour.push({ code: "SVC-INST-2STY", qty: 1 });
  if (input.inverterMeterIntegration) labour.push({ code: `SVC-METER-${phases}P`, qty: 1 });
  const barrierRequired = hasBattery && (input.batteryLocation === "garage" || input.batteryLocation === "outdoor_wall") && input.againstHabitableRoom !== false;
  const stackWidthM = (famRule?.module.w_mm ?? 600) / 1000;
  const barrierM = barrierRequired ? Math.ceil(stackWidthM * physicalTowers + 1.2) : 0;
  if (barrierRequired) labour.push({ code: "SVC-BARRIER", qty: 1 });
  if (hasBattery && input.vehicleExposure) labour.push({ code: "SVC-BOLLARDS", qty: 1 });
  if (nStrings > inv.mppts) labour.push({ code: "SVC-EXTRA-STRING", qty: nStrings - inv.mppts });

  // g. BOM — physical lines; pricing reads component costs per SKU.
  const rack = { tin: "MNT-TIN-PP", tile: "MNT-TILE-PP", kliplok: "MNT-KLIPLOK-PP" }[input.roofType];
  const raw: { sku: string; qty: number; serial?: BomLine["serial"]; included?: string }[] = [];
  if (panel) { raw.push({ sku: input.panelSku, qty: input.panelCount, serial: "panel" }); raw.push({ sku: rack, qty: input.panelCount }); }
  raw.push({ sku: invSku, qty: 1, serial: "inverter" });
  if (hasBattery && famRule) {
    const connectionParts = new Set<string>();
    bat.split.forEach((n, i) => {
      const qty = Math.max(0, n - (i === 0 ? inv.includes_modules ?? 0 : 0));
      if (qty) raw.push({ sku: famRule.module.sku, qty, serial: "module" });
      const base = (i === 0 ? famRule.stack_parts.first : famRule.stack_parts.additional).map((p) => resolvePart(p, invSku));
      const extra = (i === 0 ? [] : i === 1 ? stackRule?.stack2_parts ?? [] : stackRule?.stack3plus_parts ?? stackRule?.stack2_parts ?? []).map((p) => resolvePart(p, invSku));
      for (const p of new Set([...base, ...extra])) {
        if (/Y-CONNECTOR|COMBINER/.test(p)) { if (connectionParts.has(p)) continue; connectionParts.add(p); }
        const serial: BomLine["serial"] = /BMS|PCU|SBH-ACCESSORY-KIT/.test(p) ? "bms" : p.startsWith("INV-") ? "inverter" : undefined;
        raw.push(serial ? { sku: p, qty: 1, serial } : { sku: p, qty: 1 });
      }
    });
    if (stacks >= 2 && stackRule?.splitter_part) raw.push({ sku: stackRule.splitter_part, qty: 1 });
    if (stackRule?.series_box_from_modules && bat.split.some((n) => n >= (stackRule.series_box_from_modules ?? Infinity)) && stackRule.series_box_part) raw.push({ sku: stackRule.series_box_part, qty: 1 });
  }
  if (input.backup !== "none") {
    const b = inv.backup?.[input.backup] ?? inv.backup?.["any"] ?? (input.backup === "subboard" ? undefined : inv.backup?.["whole_home"]);
    if (b) b.parts.forEach((p) => raw.push(/GATEWAY/.test(p) ? { sku: p, qty: 1, serial: "gateway" } : { sku: p, qty: 1 }));
    else warnings.push({ step: "bom", message: `${inv.model} has no ${input.backup.replace("_", " ")} backup kit in the rules` });
  }
  if (nStrings > inv.mppts) raw.push({ sku: "PRT-DC-ISOLATOR", qty: nStrings - inv.mppts, included: "SVC-EXTRA-STRING" });
  if (barrierRequired) raw.push({ sku: "PRT-BARRIER-CFC-6MM", qty: barrierM, included: "SVC-BARRIER" });
  if (hasBattery && input.vehicleExposure) raw.push({ sku: "PRT-BOLLARD-PAIR", qty: 1 });
  const merged = new Map<string, (typeof raw)[number]>();
  for (const l of raw) { const k = `${l.sku}:${l.included ?? ""}`; const m = merged.get(k); if (m) m.qty += l.qty; else merged.set(k, { ...l }); }
  const names = rules.parts_needed ?? {};
  const bom: BomLine[] = [...merged.values()].map((l) => ({ ...l, description: names[l.sku] ?? rules.panels[l.sku]?.model ?? rules.inverters[l.sku]?.model ?? l.sku }));
  if (hasBattery && famRule && inv.includes_modules) bom.push({ sku: `${invSku}-BUILTIN-MODULE`, qty: inv.includes_modules, serial: "module", description: "Built-in battery module", included: invSku });

  const builtIn = hasBattery ? Math.min(inv.includes_modules ?? 0, input.batteryModules) : 0;
  const summary = [panel ? `${input.panelCount}× ${panel.model} ${panelKw} kW` : null, inv.model,
    hasBattery ? `${input.batteryModules}× ${famRule?.module.model} (${usable} kWh${physicalTowers > 1 ? `, ${physicalTowers} towers${seriesTowers ? " in one series bank" : ""}` : ""})` : null,
    input.backup !== "none" ? `${input.backup.replace("_", " ")} backup` : null].filter(Boolean).join(" · ");
  return out({
    ok: blockers.length === 0, dnsp, inverter: { sku: invSku, model: inv.model, ac_w: inv.ac_w }, panel_kw: panelKw, strings,
    stacks: hasBattery ? { modules: bat.split, electrical_banks: stacks, physical_towers: physicalTowers, power_kw: bat.power, parts: bat.parts } : null,
    usable_kwh: usable,
    rebates: { solar_stcs: solar, battery_stcs: battery, eligible_kw: eligibleKw, marginal_last_module_stcs: marginal },
    labour, bom, summary, panel_source: panelSource,
    modules: { total: input.batteryModules, built_in: builtIn, purchased: input.batteryModules - builtIn },
  });
}

/** Serial counts the evidence checklist expects, derived from the BOM. */
export function serialCounts(bom: Pick<BomLine, "qty" | "serial">[]) {
  const c = { panel: 0, inverter: 0, module: 0, bms: 0, gateway: 0 };
  for (const b of bom) if (b.serial) c[b.serial] += b.qty;
  return c;
}
