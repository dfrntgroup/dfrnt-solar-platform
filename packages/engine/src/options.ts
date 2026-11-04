// Configurator options: which panel counts and battery sizes are valid for a system's family, and the stack split.
import { DEFAULT_RULES, resolveConfig, type ConfigInput, type ConfigRules } from "./config";

/** Fewest stacks that make the module count valid (equal stacks where the family requires it). */
export function autoStacks(input: ConfigInput, rules: ConfigRules = DEFAULT_RULES): number | null {
  if (input.batteryModules <= 0) return 0;
  const fam = rules.families[input.familyKey];
  const rule = fam && rules.battery_families[fam.battery_family]?.rules[input.familyKey];
  const max = rule?.max_stacks ?? 1;
  for (let s = 1; s <= max; s++) {
    const o = resolveConfig({ ...input, stacks: s }, { rules });
    if (o.inverter && o.blockers.every((b) => b.step === "cec")) return s;
  }
  return null;
}

export interface ConfigOptions { panels: number[]; modules: number[]; backup: boolean; moduleKwh: number; panelW: number }

/**
 * Valid choices around a base configuration. Panels: every count that resolves with the base battery.
 * Modules: every count that resolves with the base panels (stacks chosen automatically).
 * CEC-pending blockers don't remove options (they block checkout, not quoting).
 */
/** Biggest battery offered on the site (usable kWh). The rebate stops growing at 50 kWh; 60 keeps every brand's full single-column size (6 × GoodWe 9.0 = 53 kWh) and drops the 80–160 kWh multi-tower ends that are a commercial conversation, not a product page. */
export const HOME_MAX_USABLE_KWH = 60;

/** With fixedInverter, ranges are what base.inverterSku can carry (the product page holds the inverter unless the customer changes it). */
export function configOptions(base: ConfigInput, rules: ConfigRules = DEFAULT_RULES, opts: { fixedInverter?: boolean } = {}): ConfigOptions {
  const fam = rules.families[base.familyKey]!;
  const bf = rules.battery_families[fam.battery_family];
  const rule = bf?.rules[base.familyKey];
  const real = (o: ReturnType<typeof resolveConfig>) => o.blockers.every((b) => b.step === "cec");
  const panels: number[] = [];
  const withPanels = opts.fixedInverter && base.inverterSku ? { ...base, preferInverterSku: undefined } : { ...base, inverterSku: undefined, preferInverterSku: undefined };
  if (base.panelCount > 0) for (let n = 6; n <= 40; n++) if (real(resolveConfig({ ...withPanels, panelCount: n }, { rules }))) panels.push(n);
  const modules: number[] = [];
  const maxMods = rule ? rule.modules_per_stack[1] * rule.max_stacks : 0;
  const perModule = bf?.module.kwh_usable_cec ?? 0;
  for (let m = 1; m <= maxMods; m++) {
    if (perModule && m * perModule > HOME_MAX_USABLE_KWH) break;
    const i = { ...withPanels, batteryModules: m };
    const s = autoStacks(i, rules);
    if (s != null && real(resolveConfig({ ...i, stacks: s }, { rules }))) modules.push(m);
  }
  const anyBackup = Object.values(rules.inverters).some((v) => v.family === base.familyKey && v.backup && Object.keys(v.backup).length);
  return { panels, modules, backup: anyBackup, moduleKwh: bf?.module.kwh_usable_cec ?? 0, panelW: rules.panels[base.panelSku]?.watts ?? 475 };
}
