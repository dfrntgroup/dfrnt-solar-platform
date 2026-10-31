// Ported from Solar Ops src/lib/config.test.ts. Anker cases dropped (range decision); Shopify price/variant
// cases replaced by component-cost pricing in money.test.ts; stack-product BOM checks now read module rows.
import { describe, expect, it } from "vitest";
import { DEFAULT_RULES, planStrings, resolveConfig, serialCounts, stringWindow, type ConfigInput, type ConfigRules } from "../src";

const base: ConfigInput = {
  familyKey: "solax_x1vast", panelSku: "PNL-RISEN-475", panelCount: 20, batteryModules: 3, stacks: 1, backup: "none",
  phases: 1, postcode: "4551", roofType: "tin", storeys: 1, tilt: false, batteryLocation: "other", vehicleExposure: false, installDate: "2026-11-15",
};
const run = (p: Partial<ConfigInput>, ctx: { rules?: ConfigRules } = {}) => resolveConfig({ ...base, ...p }, ctx);
const msgs = (o: ReturnType<typeof run>) => o.blockers.map((b) => b.message).join(" | ");
const skus = (o: ReturnType<typeof run>) => o.bom.map((b) => b.sku);

describe("config engine", () => {
  it.each([2, 4, 5, 6])("GoodWe ESA 1P supports %i modules in one stack", (batteryModules) => {
    const o = run({ familyKey: "goodwe_esa_1p", panelCount: 0, panelSku: "", batteryModules });
    expect(o.ok).toBe(true);
    expect(o.stacks?.modules).toEqual([batteryModules]);
    expect(o.usable_kwh).toBe(batteryModules * 8);
  });

  it("GoodWe ESA 1P keeps the 6-module and single-stack limits", () => {
    expect(run({ familyKey: "goodwe_esa_1p", panelCount: 0, panelSku: "", batteryModules: 7 }).ok).toBe(false);
    expect(run({ familyKey: "goodwe_esa_1p", panelCount: 0, panelSku: "", batteryModules: 8, stacks: 2 }).ok).toBe(false);
  });

  it("verify status is internal; pending_cec blocks", () => {
    const input = { familyKey: "goodwe_esa_1p", panelCount: 0, panelSku: "", batteryModules: 6, inverterSku: "INV-GW-EHA-10K" };
    const rules = structuredClone(DEFAULT_RULES);
    const inv = rules.inverters["INV-GW-EHA-10K"]!;
    const verified = run(input, { rules });
    delete inv.status;
    expect(verified).toEqual(run(input, { rules }));
    inv.status = "pending_cec";
    expect(run(input, { rules }).blockers.some((b) => b.step === "cec")).toBe(true);
  });

  it("HS51 2 modules on X3 is blocked by battery voltage", () => {
    const o = run({ familyKey: "solax_x3hybrid_g4", panelSku: "PNL-LONGI-475", phases: 3, batteryModules: 2 });
    expect(o.ok).toBe(false);
    expect(msgs(o)).toMatch(/voltage 102\.4 V/);
  });

  it.each([14, 17])("%i panels on X1-VAST with battery stay on 8K", (n) => {
    const o = run({ panelCount: n });
    expect(o.ok).toBe(true);
    expect(o.inverter?.sku).toBe("INV-SOLAX-VAST-8K");
  });

  it("23 panels picks 10K within 133%", () => {
    const o = run({ panelCount: 23 });
    expect(o.panel_kw).toBeCloseTo(10.925);
    expect(o.inverter?.sku).toBe("INV-SOLAX-VAST-10K");
  });

  it("preferInverterSku keeps a bundle's 8K for 23 panels with the clipping warning", () => {
    const o = run({ panelCount: 23, preferInverterSku: "INV-SOLAX-VAST-8K" });
    expect(o.inverter?.sku).toBe("INV-SOLAX-VAST-8K");
    expect(o.warnings.map((w) => w.message)).toContain("Array exceeds 133% of the inverter rating: allowed with a battery, expect some midday clipping");
  });

  it("invalid preferInverterSku falls back", () => expect(run({ panelCount: 23, preferInverterSku: "INV-NOPE" }).inverter?.sku).toBe("INV-SOLAX-VAST-10K"));

  it("34 panels steps to 10K via max DC with a battery", () => {
    const o = run({ panelCount: 34 });
    expect(o.ok).toBe(true);
    expect(o.inverter?.sku).toBe("INV-SOLAX-VAST-10K");
  });

  it("29 panels on 10K without battery is blocked at 133% with nearest 27", () => {
    const o = run({ panelCount: 29, batteryModules: 0, stacks: 0, inverterSku: "INV-SOLAX-VAST-10K" });
    expect(o.ok).toBe(false);
    expect(msgs(o)).toMatch(/133%/);
    expect(o.blockers[0]?.nearest).toBe(27);
  });

  it("Sungrow 2 stacks add the Y-connector; 3 stacks add the combiner", () => {
    const two = run({ familyKey: "sungrow_shrs", batteryModules: 8, stacks: 2 });
    expect(two.ok).toBe(true);
    expect(skus(two)).toContain("PRT-SGR-Y-CONNECTOR-B0B01253");
    expect(two.bom.find((b) => b.sku === "PRT-SGR-SMR050")?.qty).toBe(8);
    expect(two.bom.find((b) => b.sku === "PRT-SGR-SBH-ACCESSORY-KIT")?.qty).toBe(2);
    expect(skus(run({ familyKey: "sungrow_shrs", batteryModules: 12, stacks: 3 }))).toContain("PRT-SGR-SJR050-04-COMBINER");
  });

  it("Sungrow 6 modules needs manufacturer confirmation", () => {
    expect(run({ familyKey: "sungrow_shrs", batteryModules: 6 }).ok).toBe(false);
    expect(run({ familyKey: "sungrow_shrs", batteryModules: 6, confirmations: ["stack_6"] }).blockers).toEqual([]);
  });

  it("Sungrow unequal stacks are blocked", () => expect(run({ familyKey: "sungrow_shrs", batteryModules: 7, stacks: 2 }).ok).toBe(false));

  it("HS51 9 modules on X3 adds the series box and a second tower of labour", () => {
    const o = run({ familyKey: "solax_x3hybrid_g4", panelSku: "PNL-LONGI-475", phases: 3, panelCount: 20, batteryModules: 9 });
    expect(o.ok).toBe(true);
    expect(skus(o)).toContain("PRT-SOLAX-SERIES-BOX-TB-HS51");
    expect(o.labour).toContainEqual({ code: "SVC-BAT-ADD", qty: 1 });
    expect(skus(run({ familyKey: "solax_x3hybrid_g4", panelSku: "PNL-LONGI-475", phases: 3, panelCount: 20, batteryModules: 8 }))).not.toContain("PRT-SOLAX-SERIES-BOX-TB-HS51");
  });

  it("Sigen SP with 2 × BAT 10.0 is quotable, pending CEC, power 9.2 kW", () => {
    const o = run({ familyKey: "sigen_sp", panelSku: "PNL-LONGI-475", batteryModules: 2 });
    expect(o.blockers.map((b) => b.step)).toEqual(["cec", "cec"]);
    expect(o.stacks?.power_kw).toBe(9.2);
    expect(o.warnings.map((w) => w.message).join()).toMatch(/limited to 9\.2 kW/);
  });

  it("Energex single phase with EC15 TP is blocked by the DNSP", () => {
    const o = run({ familyKey: "sigen_tp", panelSku: "PNL-LONGI-475", inverterSku: "INV-SIGEN-EC15-TP", batteryModules: 2 });
    expect(o.ok).toBe(false);
    expect(o.dnsp?.name).toBe("Energex");
    expect(msgs(o)).toMatch(/Energex 10 kVA cap/);
  });

  it("unknown phases price as single phase with a warning", () => {
    const o = run({ phases: "unknown" });
    expect(o.ok).toBe(true);
    expect(o.warnings[0]?.message).toMatch(/Phases unknown/);
  });

  it("marginal value of the last module drops past 14 and 28 kWh", () => {
    const hs = (n: number) => run({ batteryModules: n, stacks: n > 8 ? 2 : 1 }).rebates.marginal_last_module_stcs;
    expect(hs(2)).toBe(Math.floor(10.2 * 6.8) - Math.floor(5.1 * 6.8));
    expect(hs(3)).toBeLessThan(hs(2));
    expect(hs(6)).toBeLessThan(hs(5));
  });

  it("string plan for 21 panels on SH10RS: window 9–15, 10/11 across 2 MPPTs", () => {
    const o = run({ familyKey: "sungrow_shrs", panelCount: 21, batteryModules: 4 });
    expect(o.strings?.per_string_min).toBe(9);
    expect(o.strings?.per_string_max).toBe(15);
    expect(o.strings?.inputs.map((i) => i.panels_per_string).sort()).toEqual([10, 11]);
  });

  it("Risen on an inverter with isc_per_mppt 15.2 is blocked by current", () => {
    const rules = structuredClone(DEFAULT_RULES);
    rules.inverters["INV-SOLAX-VAST-8K"]!.isc_per_mppt = 15.2;
    rules.inverters["INV-SOLAX-VAST-10K"]!.isc_per_mppt = 15.2;
    const o = run({}, { rules });
    expect(o.ok).toBe(false);
    expect(msgs(o)).toMatch(/current/);
  });

  it("voltage window uses fault_v and cold Voc", () => {
    const inv = DEFAULT_RULES.inverters["INV-SOLAX-VAST-8K"]!, p = DEFAULT_RULES.panels["PNL-RISEN-475"]!;
    expect(stringWindow(inv, p, DEFAULT_RULES).max).toBe(14);
    expect(planStrings(inv, p, DEFAULT_RULES, 15).plan?.length).toBe(2);
  });

  it("barrier and bollards labour + parts", () => {
    const o = run({ batteryLocation: "garage", vehicleExposure: true });
    expect(o.labour.find((l) => l.code === "SVC-BARRIER")?.qty).toBe(1);
    expect(o.bom.find((b) => b.sku === "PRT-BARRIER-CFC-6MM")?.qty).toBe(2);
    expect(o.labour.map((l) => l.code)).toContain("SVC-BOLLARDS");
    expect(skus(o)).toEqual(expect.arrayContaining(["PRT-BARRIER-CFC-6MM", "PRT-BOLLARD-PAIR"]));
  });

  it("racking follows roof type; whole-home backup adds changeover + EPS labour", () => {
    const o = run({ roofType: "kliplok", backup: "whole_home" });
    expect(skus(o)).toEqual(expect.arrayContaining(["MNT-KLIPLOK-PP", "PRT-SOLAX-CHANGEOVER"]));
    expect(o.labour.map((l) => l.code)).toContain("SVC-EPS-WH-1P");
  });

  it("serial counts derive from the BOM", () => {
    expect(serialCounts(run({ familyKey: "sungrow_shrs", batteryModules: 8, stacks: 2 }).bom)).toMatchObject({ panel: 20, inverter: 1, module: 8, bms: 2 });
  });

  it("phase mismatch with the family is blocked", () => expect(msgs(run({ phases: 3 }))).toMatch(/1-phase system/));

  it("GoodWe ESA 1P, 21 panels, 2 modules, whole-home: 10K, kit included", () => {
    const o = run({ familyKey: "goodwe_esa_1p", panelCount: 21, batteryModules: 2, backup: "whole_home" });
    expect(o.inverter?.sku).toBe("INV-GW-EHA-10K");
    expect(o.usable_kwh).toBe(16);
    expect(o.blockers).toEqual([]);
    expect(skus(o)).toEqual(skus(run({ familyKey: "goodwe_esa_1p", panelCount: 21, batteryModules: 2 })));
  });

  it.each([[12, 4, "INV-SGR-SH8.0RS"], [21, 5, "INV-SGR-SH10RS"], [8, 3, "INV-SGR-SH8.0RS"], [0, 3, "INV-SGR-SH5.0RS"]] as const)(
    "SBH selection for %i panels and %i modules", (panels, modules, sku) => {
      const o = run({ familyKey: "sungrow_shrs", panelSku: "PNL-LONGI-475", panelCount: panels, batteryModules: modules });
      expect(o.inverter?.sku).toBe(sku);
      expect(o.ok).toBe(true);
    });

  it("forced SBH cap carries nearest per-stack limit", () => {
    expect(run({ familyKey: "sungrow_shrs", panelCount: 0, batteryModules: 4, inverterSku: "INV-SGR-SH5.0RS" }).blockers)
      .toContainEqual({ step: "stacks", message: "SBH200 exceeds SH5.0RS limit", nearest: 3 });
  });

  it("black Longi keeps its own SKU", () => expect(run({ panelSku: "PNL-LONGI-475-BLACK", panelCount: 12 }).bom.find((b) => b.serial === "panel")?.sku).toBe("PNL-LONGI-475-BLACK"));
});

describe("launch range resolves", () => {
  const cases: [string, Partial<ConfigInput>][] = [
    ["goodwe_esa_1p EHA-5K", { familyKey: "goodwe_esa_1p", inverterSku: "INV-GW-EHA-5K", panelSku: "PNL-TRINA-475", panelCount: 13, batteryModules: 2 }],
    ["goodwe_esa_1p EHA-10K", { familyKey: "goodwe_esa_1p", inverterSku: "INV-GW-EHA-10K", panelSku: "PNL-TRINA-475", panelCount: 21, batteryModules: 2 }],
    ["goodwe_esa_3p ETA-10K", { familyKey: "goodwe_esa_3p", inverterSku: "INV-GW-ETA-10K", panelSku: "PNL-TRINA-475", panelCount: 21, batteryModules: 3, phases: 3 }],
    ["goodwe_esa_3p ETA-15K", { familyKey: "goodwe_esa_3p", inverterSku: "INV-GW-ETA-15K", panelSku: "PNL-TRINA-475", panelCount: 30, batteryModules: 4, phases: 3 }],
    ["sungrow SH5.0RS battery only", { familyKey: "sungrow_shrs", inverterSku: "INV-SGR-SH5.0RS", panelSku: "PNL-LONGI-475", panelCount: 0, batteryModules: 3 }],
    ["sungrow SH8.0RS", { familyKey: "sungrow_shrs", inverterSku: "INV-SGR-SH8.0RS", panelSku: "PNL-LONGI-475", panelCount: 18, batteryModules: 4 }],
    ["solax HYB-8K", { familyKey: "solax_x3hybrid_g4", inverterSku: "INV-SOLAX-HYB-8K", panelSku: "PNL-LONGI-475", panelCount: 17, batteryModules: 3, phases: 3 }],
    ["solax HYB-15K", { familyKey: "solax_x3hybrid_g4", inverterSku: "INV-SOLAX-HYB-15K", panelSku: "PNL-LONGI-475", panelCount: 26, batteryModules: 4, phases: 3 }],
    ["Longi black panel", { familyKey: "sungrow_shrs", inverterSku: "INV-SGR-SH10RS", panelSku: "PNL-LONGI-475-BLACK", panelCount: 20, batteryModules: 4 }],
  ];
  for (const [name, p] of cases) it(`${name} resolves with no blockers`, () => {
    const o = run(p);
    expect(o.blockers).toEqual([]);
    expect(o.inverter?.sku).toBe(p.inverterSku);
  });
});
