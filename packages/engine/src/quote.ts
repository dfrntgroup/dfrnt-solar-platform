// One call from configuration to a priced quote. This is what the API, the site and agents call.
import { resolveConfig, type ConfigInput, type ConfigOutput, type ConfigRules } from "./config";
import {
  hardwareLine, labourLines, priceStack, DEFAULT_COSTS, DEFAULT_MARGINS, DEFAULT_MENU,
  type ComponentCosts, type Discounts, type LabourMenu, type LabourRequest, type Margins, type PriceLine, type PriceStack,
} from "./pricing";
import { computeRebate, rebateWindow, DEFAULT_REBATE_SETTINGS, type Rebate, type RebateSettings, type RebateWindow } from "./rebates";

export interface QuoteContext {
  rules?: ConfigRules; costs?: ComponentCosts; menu?: LabourMenu; margins?: Margins; rebates?: RebateSettings;
  /** Date the quote is priced (yyyy-mm-dd); sets the rebate window and lock. */
  asOf: string;
  discounts?: Discounts;
  /** Extra installation lines confirmed by the installer from photos (codes from the menu). */
  extraLabour?: LabourRequest[];
  /** Installer-priced variations already in the price. */
  variations?: PriceLine[];
}
export interface Quote {
  config: ConfigOutput; rebate: Rebate; window: RebateWindow; stack: PriceStack;
  ok: boolean; checkout_allowed: boolean; versions: Record<string, string>;
}

export function quote(input: ConfigInput, ctx: QuoteContext): Quote {
  const costs = ctx.costs ?? DEFAULT_COSTS, menu = ctx.menu ?? DEFAULT_MENU, margins = ctx.margins ?? DEFAULT_MARGINS;
  const settings = ctx.rebates ?? DEFAULT_REBATE_SETTINGS;
  const config = resolveConfig(input, ctx.rules ? { rules: ctx.rules } : {});
  const hw: PriceLine[] = config.bom.map((b) => b.included
    ? { kind: "bos", code: b.sku, description: `${b.description} (included in ${b.included})`, qty: b.qty, unit_cost: 0, cost_ex_gst: 0, sell_ex_gst: 0, price_pending: false }
    : hardwareLine(b.sku, b.qty, b.description, costs, margins));
  const labour = labourLines([...config.labour, ...(ctx.extraLabour ?? [])], { kw: config.panel_kw, panels: input.panelCount }, { menu, margins });
  const rebate = computeRebate({ eligibleKw: config.rebates.eligible_kw, usableKwh: input.priorBatteryClaim ? 0 : config.usable_kwh, postcode: input.postcode, installDate: input.installDate }, settings);
  const stack = priceStack([...hw, ...labour, ...(ctx.variations ?? [])], { stcs: rebate.solar_stcs + rebate.battery_stcs, total: rebate.total }, ctx.discounts);
  const window = rebateWindow(ctx.asOf, settings);
  return {
    config, rebate, window, stack, ok: config.ok,
    checkout_allowed: config.ok && stack.checkout_allowed,
    versions: { rules: config.rules_version, costs: costs.version, menu: menu.version, rebates: settings.version, margins: (margins as Margins & { version?: string }).version ?? "default" },
  };
}
