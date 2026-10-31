// Price stack. Locked rule (31 Oct 2026, do not reopen):
// 1. Hardware/BOS sell = cost ÷ (1 − 0.25). Installation + every variation sell = installer cost ÷ (1 − 0.10).
// 2. System price = Σ sell lines ex GST.  3. Discounts come off before GST (they are inc-GST amounts).
// 4. GST on the full pre-STC price.  5. STCs off last ("Less assignment of STCs").
import menuJson from "./data/labour-menu.json";
import costsJson from "./data/component-costs.json";

export const round2 = (n: number) => Math.round((n + Number.EPSILON * Math.sign(n)) * 100) / 100;
export const GST_RATE = 0.1;

export interface Margins { hardware: number; bos: number; installation: number }
export const DEFAULT_MARGINS: Margins = { hardware: 0.25, bos: 0.25, installation: 0.1 };

/* ---------- data ---------- */
export type LabourPer = "per_100w_ceil" | "unit" | "panel" | "km_after_50" | "m_after_5";
export interface LabourMenuItem { code: string; description: string; per: LabourPer; menu_rate: number; installer_cost?: number }
export interface LabourMenu { version: string; items: LabourMenuItem[] }
export const DEFAULT_MENU = menuJson as unknown as LabourMenu;

export interface ComponentCost { cost_ex_gst: number | null; margin_class: "hardware" | "bos"; source: string }
export interface ComponentCosts { version: string; included_zero_cost: string[]; items: Record<string, ComponentCost> }
export const DEFAULT_COSTS = costsJson as unknown as ComponentCosts;

/** Installer is paid the menu rate ÷ 1.1 (menu = subcontractor × 1.1), unless the menu pins an explicit cost. */
export const installerRate = (item: LabourMenuItem) => item.installer_cost ?? round2(item.menu_rate / 1.1);

/* ---------- lines ---------- */
export interface LabourRequest { code: string; qty?: number }
export interface PriceLine {
  kind: "hardware" | "bos" | "installation" | "variation";
  code: string; description: string; qty: number;
  /** Unit cost ex GST (component cost, or installer rate). */
  unit_cost: number | null;
  /** Line cost ex GST: what we pay the supplier / installer. */
  cost_ex_gst: number | null;
  /** Line sell ex GST. */
  sell_ex_gst: number | null;
  price_pending: boolean;
}

export function labourQty(item: LabourMenuItem, req: LabourRequest, ctx: { kw: number; panels: number }): number {
  switch (item.per) {
    case "per_100w_ceil": return req.qty ?? Math.max(0, Math.ceil(ctx.kw * 10 - 1e-9));
    case "panel": return req.qty ?? ctx.panels;
    case "km_after_50": return Math.max(0, (req.qty ?? 0) - 50);
    case "m_after_5": return Math.max(0, (req.qty ?? 0) - 5);
    default: return req.qty ?? 1;
  }
}

export function labourLines(
  requests: LabourRequest[], ctx: { kw: number; panels: number },
  opts: { menu?: LabourMenu; margins?: Margins; kind?: "installation" | "variation" } = {},
): PriceLine[] {
  const menu = opts.menu ?? DEFAULT_MENU, m = opts.margins ?? DEFAULT_MARGINS;
  const seen = new Set<string>();
  const out: PriceLine[] = [];
  for (let r of requests) {
    // Backing is one allowance per installation, never repeated.
    if (r.code === "SVC-BARRIER") { if (seen.has(r.code)) continue; r = { ...r, qty: 1 }; }
    seen.add(r.code);
    const item = menu.items.find((x) => x.code === r.code);
    if (!item) {
      out.push({ kind: opts.kind ?? "installation", code: r.code, description: r.code, qty: r.qty ?? 1, unit_cost: null, cost_ex_gst: null, sell_ex_gst: null, price_pending: true });
      continue;
    }
    const qty = labourQty(item, r, ctx);
    if (qty <= 0) continue;
    const rate = installerRate(item);
    const pending = !(rate > 0);
    const cost = pending ? null : round2(qty * rate);
    out.push({
      kind: opts.kind ?? "installation", code: item.code, description: item.description, qty, unit_cost: pending ? null : rate,
      cost_ex_gst: cost, sell_ex_gst: cost == null ? null : round2(cost / (1 - m.installation)), price_pending: pending,
    });
  }
  return out;
}

/** A named site variation priced by the installer (from photos or on site). Sell = cost ÷ 0.9. */
export function variationLine(code: string, description: string, installerCostEx: number, margins: Margins = DEFAULT_MARGINS): PriceLine {
  const cost = round2(installerCostEx);
  return { kind: "variation", code, description, qty: 1, unit_cost: cost, cost_ex_gst: cost, sell_ex_gst: round2(cost / (1 - margins.installation)), price_pending: false };
}

export function hardwareLine(sku: string, qty: number, description: string, costs: ComponentCosts = DEFAULT_COSTS, margins: Margins = DEFAULT_MARGINS): PriceLine {
  const c = costs.items[sku];
  const kind = c?.margin_class === "bos" ? "bos" : "hardware";
  const unit = c?.cost_ex_gst;
  const included = costs.included_zero_cost.includes(sku);
  const pending = unit == null || (unit <= 0 && !included);
  const cost = pending ? null : round2(qty * unit!);
  const margin = kind === "bos" ? margins.bos : margins.hardware;
  return { kind, code: sku, description, qty, unit_cost: pending ? null : unit!, cost_ex_gst: cost, sell_ex_gst: cost == null ? null : round2(cost / (1 - margin)), price_pending: pending };
}

/* ---------- stack ---------- */
export interface Discounts {
  /** Referral discount, inc GST. Decided $250. */
  referral?: number;
  /** $99 report credit, inc GST. Decided $100. */
  reportCredit?: number;
  /** Bank transfer: this share of the amount payable after other discounts. Decided ≈1%. */
  bankTransferPct?: number;
}

export interface PriceStack {
  lines: PriceLine[];
  hardware_ex_gst: number; installation_ex_gst: number; variations_ex_gst: number;
  /** System price ex GST before discounts. */
  system_ex_gst: number;
  discounts: { code: "referral" | "report_credit" | "bank_transfer"; amount_inc_gst: number }[];
  discount_inc_gst: number;
  /** Price after discounts. GST is on this full pre-STC amount. */
  price_ex_gst: number; gst: number; price_inc_gst: number;
  stcs: number; less_stcs: number;
  /** One price, one payment. */
  amount_payable: number;
  cost_ex_gst: number; installer_pay_ex_gst: number; gross_margin: number; gross_margin_pct: number;
  price_pending: string[];
  checkout_allowed: boolean;
}

export function priceStack(lines: PriceLine[], rebate: { stcs: number; total: number }, discounts: Discounts = {}): PriceStack {
  const sum = (k: PriceLine["kind"][], f: "sell_ex_gst" | "cost_ex_gst") => round2(lines.filter((l) => k.includes(l.kind)).reduce((s, l) => s + (l[f] ?? 0), 0));
  const hardware = sum(["hardware", "bos"], "sell_ex_gst");
  const installation = sum(["installation"], "sell_ex_gst");
  const variations = sum(["variation"], "sell_ex_gst");
  const system = round2(hardware + installation + variations);
  const gross = round2(system * (1 + GST_RATE));

  const applied: PriceStack["discounts"] = [];
  let inc = gross;
  if (discounts.referral) { applied.push({ code: "referral", amount_inc_gst: round2(discounts.referral) }); inc = round2(inc - discounts.referral); }
  if (discounts.reportCredit) { applied.push({ code: "report_credit", amount_inc_gst: round2(discounts.reportCredit) }); inc = round2(inc - discounts.reportCredit); }
  if (discounts.bankTransferPct) {
    const d = round2(Math.max(0, inc - rebate.total) * discounts.bankTransferPct);
    applied.push({ code: "bank_transfer", amount_inc_gst: d }); inc = round2(inc - d);
  }
  const priceEx = applied.length ? round2(inc / (1 + GST_RATE)) : system;
  const gst = round2(inc - priceEx);
  const payable = round2(Math.max(0, inc - rebate.total));
  const cost = sum(["hardware", "bos", "installation", "variation"], "cost_ex_gst");
  const installerPay = sum(["installation", "variation"], "cost_ex_gst");
  const margin = round2(priceEx - cost);
  const pending = lines.filter((l) => l.price_pending).map((l) => l.code);
  return {
    lines, hardware_ex_gst: hardware, installation_ex_gst: installation, variations_ex_gst: variations, system_ex_gst: system,
    discounts: applied, discount_inc_gst: round2(gross - inc),
    price_ex_gst: priceEx, gst, price_inc_gst: inc, stcs: rebate.stcs, less_stcs: round2(rebate.total), amount_payable: payable,
    cost_ex_gst: cost, installer_pay_ex_gst: installerPay, gross_margin: margin, gross_margin_pct: priceEx ? Math.round((margin / priceEx) * 1000) / 10 : 0,
    price_pending: pending, checkout_allowed: pending.length === 0,
  };
}

/** Amount for a variation after payment: sell ex, GST, inc. */
export function variationAmount(line: PriceLine) {
  const ex = line.sell_ex_gst ?? 0;
  const inc = round2(ex * (1 + GST_RATE));
  return { ex_gst: ex, gst: round2(inc - ex), inc_gst: inc };
}
