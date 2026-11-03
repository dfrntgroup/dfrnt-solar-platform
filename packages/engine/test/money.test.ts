// Money acceptance tests from the build book (§7 tests T1, T2, T4, T7, T8) using the #1002 figures.
// #1002: 21 × Risen 475, X1-VAST-10K, 3 × HS51, single phase, tin roof, postcode 4551.
import { describe, expect, it } from "vitest";
import {
  computeRebate, hardwareLine, installDateAllowed, labourLines, priceStack, quote, rebateWindow, variationAmount, variationLine,
  type ConfigInput, type PriceLine,
} from "../src";

const job1002: ConfigInput = {
  familyKey: "solax_x1vast", panelSku: "PNL-RISEN-475", panelCount: 21, batteryModules: 3, stacks: 1, backup: "none",
  phases: 1, postcode: "4551", roofType: "tin", storeys: 1, tilt: false, batteryLocation: "other", vehicleExposure: false,
  installDate: "2026-11-15", preferInverterSku: "INV-SOLAX-VAST-10K", inverterMeterIntegration: true,
};

/** The #1002 hardware sell ex GST as booked in the live snapshot (hardware_inc 12,600.31). */
const HARDWARE_1002_EX = 11454.83;
const hardwareFixture: PriceLine = { kind: "hardware", code: "HW-1002", description: "#1002 hardware (snapshot)", qty: 1, unit_cost: 8591.12, cost_ex_gst: 8591.12, sell_ex_gst: HARDWARE_1002_EX, price_pending: false };
const install = labourLines([{ code: "SVC-SOLAR-INSTALL" }, { code: "SVC-BATTERY-INSTALL" }, { code: "SVC-METER-1P" }], { kw: 9.975, panels: 21 });
const rebate2026 = computeRebate({ eligibleKw: 9.975, usableKwh: 15.3, postcode: "4551", installDate: "2026-11-15" });
const r = (x: typeof rebate2026) => ({ stcs: x.solar_stcs + x.battery_stcs, total: x.total });

describe("T1 — price stack (#1002, locked 25/10 rule)", () => {
  const s = priceStack([hardwareFixture, ...install], r(rebate2026));
  it("installation lines are installer cost ÷ 0.9", () => {
    expect(install.map((l) => [l.code, l.qty, l.cost_ex_gst, l.sell_ex_gst])).toEqual([
      ["SVC-SOLAR-INSTALL", 100, 2800, 3111.11],
      ["SVC-BATTERY-INSTALL", 1, 1950, 2166.67],
      ["SVC-METER-1P", 1, 200, 222.22],
    ]);
    expect(s.installation_ex_gst).toBe(5500);
    expect(s.installer_pay_ex_gst).toBe(4950);
  });
  it("STCs 68 + 100 at $37 = $6,216", () => {
    expect([rebate2026.solar_stcs, rebate2026.battery_stcs, rebate2026.total]).toEqual([68, 100, 6216]);
  });
  it("GST on the full pre-STC price; customer pays $12,434.31", () => {
    expect(s.system_ex_gst).toBe(16954.83);
    expect(s.gst).toBe(1695.48);
    expect(s.price_inc_gst).toBe(18650.31);
    expect(s.less_stcs).toBe(6216);
    expect(s.amount_payable).toBe(12434.31);
  });
  it("gross margin $3,413.71 = 20.1%", () => {
    expect(s.gross_margin).toBe(3413.71);
    expect(s.gross_margin_pct).toBe(20.1);
  });
});

describe("T2 — discounts come off before GST", () => {
  it("bank transfer ≈1%: discount $124.34, GST $1,684.18, pays $12,309.97", () => {
    const s = priceStack([hardwareFixture, ...install], r(rebate2026), { bankTransferPct: 0.01 });
    expect(s.discounts).toEqual([{ code: "bank_transfer", amount_inc_gst: 124.34 }]);
    expect(s.gst).toBe(1684.18);
    expect(s.amount_payable).toBe(12309.97);
  });
  it("referral $250: GST $1,672.76, pays $12,184.31", () => {
    const s = priceStack([hardwareFixture, ...install], r(rebate2026), { referral: 250 });
    expect(s.gst).toBe(1672.76);
    expect(s.amount_payable).toBe(12184.31);
  });
});

describe("T4 — 2027 rebate rules", () => {
  it("install after 1 Jan 2027: STCs 55 + 84 = $5,143, pays $13,507.31", () => {
    const rb = computeRebate({ eligibleKw: 9.975, usableKwh: 15.3, postcode: "4551", installDate: "2027-01-12" });
    expect([rb.solar_stcs, rb.battery_stcs, rb.total]).toEqual([55, 84, 5143]);
    expect(priceStack([hardwareFixture, ...install], r(rb)).amount_payable).toBe(13507.31);
  });
  it("factor drops again on 1 Jul 2027", () => {
    expect(computeRebate({ eligibleKw: 0, usableKwh: 15.3, postcode: "4551", installDate: "2027-07-01" }).battery_factor).toBe(5.2);
  });
});

describe("T7 — rebate window: lock = earlier of 14 days or window end", () => {
  it("mid-November lock is 14 days", () => {
    expect(rebateWindow("2026-11-01")).toEqual({ window_start: "2026-05-01", window_end: "2026-12-31", lock_until: "2026-11-15", rebate_date: "2026-11-15" });
  });
  it("late December lock stops at 31 Dec", () => {
    expect(rebateWindow("2026-12-24").lock_until).toBe("2026-12-31");
  });
  it("booking only offers dates inside the window", () => {
    expect(installDateAllowed("2026-12-31", "2026-12-20")).toBe(true);
    expect(installDateAllowed("2027-01-04", "2026-12-20")).toBe(false);
    expect(installDateAllowed("2027-01-04", "2027-01-01")).toBe(true);
  });
});

describe("T8 — variation after payment", () => {
  it("SVC-SWB-HALF: $688.71 + GST $68.87 = $757.58", () => {
    const v = labourLines([{ code: "SVC-SWB-HALF" }], { kw: 0, panels: 0 }, { kind: "variation" })[0]!;
    expect(variationAmount(v)).toEqual({ ex_gst: 688.71, gst: 68.87, inc_gst: 757.58 });
  });
  it("installer-priced variation at $619.84 cost sells at $688.71", () => {
    expect(variationLine("VAR-1", "Half switchboard", 619.84).sell_ex_gst).toBe(688.71);
  });
});

describe("Battery labour is per stack", () => {
  it("two stacks: first stack + one additional, no per-module line", () => {
    const q = quote({ ...job1002, batteryModules: 10, stacks: 2 }, { asOf: "2026-11-01" });
    const codes = q.stack.lines.filter((l) => l.kind === "installation").map((l) => `${l.code}:${l.qty}`);
    expect(codes).toContain("SVC-BATTERY-INSTALL:1");
    expect(codes).toContain("SVC-BAT-ADD:1");
    expect(codes.some((c) => c.startsWith("SVC-BAT-MODULE"))).toBe(false);
  });
});

describe("End to end from component costs", () => {
  const q = quote(job1002, { asOf: "2026-11-01" });
  it("#1002 resolves, installation $5,500, STCs $6,216", () => {
    expect(q.ok).toBe(true);
    expect(q.config.inverter?.sku).toBe("INV-SOLAX-VAST-10K");
    expect(q.stack.installation_ex_gst).toBe(5500);
    expect(q.stack.less_stcs).toBe(6216);
  });
  it("hardware from the exported cost table is $11,374.33 ex (snapshot used $11,454.83 — see docs/open-questions.md)", () => {
    expect(q.stack.hardware_ex_gst).toBe(11374.33);
    expect(q.checkout_allowed).toBe(true);
  });
  it("hardware line is cost ÷ 0.75", () => {
    expect(hardwareLine("INV-SOLAX-VAST-10K", 1, "inv").sell_ex_gst).toBe(2337.33);
  });
  it("a zero-cost labour line blocks checkout but still quotes", () => {
    const b = quote({ ...job1002, batteryLocation: "garage", vehicleExposure: true }, { asOf: "2026-11-01" });
    expect(b.ok).toBe(true);
    expect(b.stack.price_pending).toContain("SVC-BOLLARDS");
    expect(b.checkout_allowed).toBe(false);
  });
  it("prior battery claim on the NMI removes battery STCs", () => {
    expect(quote({ ...job1002, priorBatteryClaim: true }, { asOf: "2026-11-01" }).rebate.battery_stcs).toBe(0);
  });
});

describe("labour lines survive a re-price round-trip (review fix, 3 Nov 2026)", () => {
  it("per-km and per-metre allowances are not subtracted twice", async () => {
    const { labourLines, requestFromLine } = await import("../src/pricing");
    const ctx = { kw: 10, panels: 21 };
    const first = labourLines([{ code: "SVC-TRAVEL", qty: 60 }, { code: "SVC-CABLE-1P", qty: 15 }], ctx);
    expect(first.map((l) => l.qty)).toEqual([10, 10]);
    const second = labourLines(first.map(requestFromLine), ctx);
    expect(second.map((l) => [l.code, l.qty, l.sell_ex_gst])).toEqual(first.map((l) => [l.code, l.qty, l.sell_ex_gst]));
    const third = labourLines(second.map(requestFromLine), ctx);
    expect(third).toEqual(second);
  });
});

describe("GoodWe ESA default module is the Lynx D G2 9.0 (3 Nov 2026)", () => {
  it("3 modules = 26.55 kWh usable, 146 battery STCs at factor 6.8, 4.5 kW per module capped by the inverter", async () => {
    const { findSystem, priceSystem } = await import("../src");
    const s = findSystem("goodwe-10kw-18kwh")!;
    const q = priceSystem({ ...s, config: { ...s.config, batteryModules: 3 } }, { postcode: "4012", asOf: "2026-11-03" });
    expect(q.config.usable_kwh).toBeCloseTo(26.55, 2);
    expect(q.rebate.battery_stcs).toBe(146);
    expect(q.config.bom.some((b) => b.sku === "PRT-GW-LX-D-9.0-G20" && b.qty === 3)).toBe(true);
    expect(q.config.stacks?.power_kw).toBe(10);
  });
  it("the archived 2026-11-01.1 rules still price the 8.3 module (secured quotes keep their price)", async () => {
    const { ARCHIVED_RULES, ARCHIVED_CATALOGUES, findSystem, priceSystem } = await import("../src");
    const rules = ARCHIVED_RULES["2026-11-01.1"]!, cat = ARCHIVED_CATALOGUES["2026-11-01.1"]!;
    const s = findSystem("goodwe-10kw-16kwh", cat)!;
    const q = priceSystem(s, { postcode: "4012", asOf: "2026-11-03" }, { rules, catalogue: cat });
    expect(q.config.usable_kwh).toBe(16);
    expect(q.config.bom.some((b) => b.sku === "PRT-GW-LX-D-8.3-G20")).toBe(true);
  });
});

describe("December full → price for the next rebate window (3 Nov 2026)", () => {
  it("priced forward: rebate on the January schedule, held from today, window ends 30 June", async () => {
    const { findSystem, priceSystem, rebateWindow, nextWindowStart } = await import("../src");
    const asOf = "2026-12-05";
    const from = nextWindowStart(asOf)!;
    expect(from).toBe("2027-01-01");
    const w = rebateWindow(asOf, undefined, from);
    expect(w.lock_until).toBe("2026-12-19");
    expect(w.rebate_date).toBe("2027-01-01");
    expect(w.window_end).toBe("2027-06-30");
    const s = findSystem("solax-10kw-15kwh")!;
    const dec = priceSystem(s, { postcode: "4551", asOf });
    const jan = priceSystem(s, { postcode: "4551", asOf, rebateFrom: from });
    expect(jan.rebate.battery_factor).toBe(5.7);
    expect(dec.rebate.battery_factor).toBe(6.8);
    expect(jan.stack.amount_payable).toBeGreaterThan(dec.stack.amount_payable);
    expect(jan.window.window_end).toBe("2027-06-30");
  });
  it("normal case is unchanged: rebate date = lock date", async () => {
    const { rebateWindow } = await import("../src");
    const w = rebateWindow("2026-11-03");
    expect(w.rebate_date).toBe(w.lock_until);
  });
});
