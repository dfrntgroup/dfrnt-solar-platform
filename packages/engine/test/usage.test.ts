import { describe, expect, it } from "vitest";
import { DEFAULT_YIELDS, daylight, profileUsage, pvShape, replay, seasonFactor, sizeTargets, snapToTier, standardTariff, tariffFromPlan, toHalfHours, yieldFor, priceAt, type DayRead } from "../src";

const BNE = DEFAULT_YIELDS.brisbane!;
// A home using 0.5 kWh every half-hour (24 kWh/day), no solar, for a full year.
const year = (f: (slot: number, date: string) => number, exp?: (slot: number) => number): DayRead[] => {
  const out: DayRead[] = [];
  for (let t = Date.parse("2025-01-01T00:00:00Z"); t < Date.parse("2026-01-01T00:00:00Z"); t += 86400000) {
    const date = new Date(t).toISOString().slice(0, 10);
    out.push({ date, imp: Array.from({ length: 48 }, (_, i) => f(i, date)), exp: exp ? Array.from({ length: 48 }, (_, i) => exp(i)) : undefined });
  }
  return out;
};

describe("location yield", () => {
  it("uses the Clean Energy Council city figures by postcode", () => {
    expect(yieldFor("4551").kwh_per_kw).toBe(4.2);   // Caloundra → Brisbane
    expect(yieldFor("2000").kwh_per_kw).toBe(3.9);   // Sydney
    expect(yieldFor("2600").kwh_per_kw).toBe(4.3);   // Canberra
    expect(yieldFor("3000").kwh_per_kw).toBe(3.6);
    expect(yieldFor("6000").kwh_per_kw).toBe(4.4);
    expect(yieldFor("7000").kwh_per_kw).toBe(3.5);
    expect(yieldFor("0870").kwh_per_kw).toBe(5.0);   // Alice Springs
    expect(yieldFor("4870").city).toBe("Cairns");
  });
  it("an edited table wins", () => expect(yieldFor("2000", { ...DEFAULT_YIELDS, sydney: { ...DEFAULT_YIELDS.sydney!, kwh_per_kw: 4.1 } }).kwh_per_kw).toBe(4.1));
  it("a day of panel output adds up to the yield, more in summer than winter", () => {
    const year = Array.from({ length: 12 }, (_, m) => pvShape(m, BNE).reduce((s, x) => s + x, 0));
    expect(year.reduce((s, x) => s + x, 0) / 12).toBeCloseTo(4.2, 1);
    expect(year[0]!).toBeGreaterThan(year[6]!);
  });
  it("winter days are shorter", () => {
    const s = daylight(0, BNE.lat, BNE.lon), w = daylight(6, BNE.lat, BNE.lon);
    expect(s.set - s.rise).toBeGreaterThan(w.set - w.rise);
    expect(w.rise).toBeGreaterThan(5.5); expect(w.set).toBeLessThan(18);
    expect(seasonFactor(6, -42.9)).toBeLessThan(seasonFactor(6, -27.5));
  });
});

describe("profile", () => {
  it("5-minute reads become half-hours", () => {
    expect(toHalfHours(new Array(288).fill(0.1)).map((x) => Math.round(x * 10) / 10)).toEqual(new Array(48).fill(0.6));
    expect(toHalfHours(new Array(7).fill(1))).toEqual([]);
  });
  it("splits a flat 24 kWh day into night and day", () => {
    const p = profileUsage(year(() => 0.5), BNE)!;
    expect(p.daily_kwh).toBe(24);
    expect(p.annual_import_kwh).toBe(24 * 365);
    expect(p.night_kwh).toBeGreaterThan(9); expect(p.night_kwh).toBeLessThan(13);
    expect(p.peak_kw).toBe(1);
    expect(p.months).toHaveLength(12);
  });
  it("an evening-heavy home has a bigger night share", () => {
    const flat = profileUsage(year(() => 0.5), BNE)!;
    const eve = profileUsage(year((i) => (i >= 34 && i < 46 ? 1.5 : 0.17)), BNE)!;
    expect(eve.evening_share).toBeGreaterThan(flat.evening_share);
  });
});

describe("sizing by simple maths", () => {
  it("80 kWh a day gets ~19 kW, unless the roof only fits 6.6", () => {
    expect(sizeTargets({ daily_kwh: 80, night_kwh: 30, daily_export_kwh: 0 }, { yield: 4.2, hasSolar: false }).panel_kw).toBe(19);
    const t = sizeTargets({ daily_kwh: 80, night_kwh: 30, daily_export_kwh: 0 }, { yield: 4.2, hasSolar: false, roofMaxKw: 6.6 });
    expect(t.panel_kw).toBe(6.6); expect(t.capped_by_roof).toBe(true);
    expect(t.battery_kwh).toBeLessThan(30);           // can't fill 30 kWh from 6.6 kW
  });
  it("Sydney needs more panels for the same usage", () => {
    expect(sizeTargets({ daily_kwh: 24, night_kwh: 12, daily_export_kwh: 0 }, { yield: 3.9, hasSolar: false }).panel_kw)
      .toBeGreaterThan(sizeTargets({ daily_kwh: 24, night_kwh: 12, daily_export_kwh: 0 }, { yield: 4.2, hasSolar: false }).panel_kw);
  });
  it("battery only: sized to the night, limited by what the old system exports", () => {
    expect(sizeTargets({ daily_kwh: 20, night_kwh: 12, daily_export_kwh: 20 }, { yield: 4.2, hasSolar: true }).battery_kwh).toBe(12);
    expect(sizeTargets({ daily_kwh: 20, night_kwh: 12, daily_export_kwh: 6 }, { yield: 4.2, hasSolar: true }).battery_kwh).toBe(6);
  });
  it("snaps to rebate tiers when close", () => {
    expect(snapToTier(13)).toBe(14); expect(snapToTier(26)).toBe(28); expect(snapToTier(9.4)).toBe(9.4);
  });
});

describe("tariff from the retailer plan", () => {
  const flat = { pricing_model: "SINGLE_RATE", tariff_period: [{ daily_supply_charges: "1.0", single_rate: { rates: [{ unit_price: "0.30" }] } }],
    solar_feed_in_tariff: [{ single_tariff: { rates: [{ unit_price: "-0.05" }] } }], controlled_load: [{ single_rate: { rates: [{ unit_price: "0.1946" }] } }] };
  it("adds GST to usage and supply, not feed-in", () => {
    const t = tariffFromPlan(flat);
    expect(t.source).toBe("retailer"); expect(t.rates[0]!.price).toBeCloseTo(0.33); expect(t.supply_day).toBeCloseTo(1.1); expect(t.fit).toBe(0.05);
    expect(t.controlled).toBeCloseTo(0.214, 3);
  });
  it("reads time-of-use windows", () => {
    const t = tariffFromPlan({ tariff_period: [{ time_of_use_rates: [
      { type: "PEAK", rates: [{ unit_price: "0.40" }], time_of_use: [{ days: ["MON", "TUE", "WED", "THU", "FRI"], start_time: "16:00", end_time: "21:00" }] },
      { type: "OFF_PEAK", rates: [{ unit_price: "0.20" }], time_of_use: [{ days: ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"], start_time: "00:00", end_time: "00:00" }] }] }] });
    expect(t.kind).toBe("tou");
    expect(priceAt(t, 34, false)).toBeCloseTo(0.44);   // 5 pm weekday
    expect(priceAt(t, 34, true)).toBeCloseTo(0.22);    // 5 pm Saturday
    expect(priceAt(t, 4, false)).toBeCloseTo(0.22);
  });
  it("a plan without published rates falls back to the standard tariff, labelled", () => {
    const t = tariffFromPlan({ pricing_model: "SINGLE_RATE_CONT_LOAD", tariff_period: [{ display_name: "All-year" }] });
    expect(t.source).toBe("standard"); expect(t.rates[0]!.price).toBeCloseTo(0.33);
  });
});

describe("replay", () => {
  const days = year(() => 0.5);
  const t = standardTariff();
  it("no system, no change", () => {
    const r = replay(days, { panel_kw: 0, battery_kwh: 0 }, t, BNE);
    expect(r.import_kwh).toBe(r.before.import_kwh); expect(r.saving).toBe(0);
  });
  it("panels cut daytime import; a battery cuts the night too", () => {
    const p = replay(days, { panel_kw: 6.6, battery_kwh: 0 }, t, BNE);
    const pb = replay(days, { panel_kw: 6.6, battery_kwh: 14 }, t, BNE);
    expect(p.import_kwh).toBeLessThan(p.before.import_kwh);
    expect(pb.import_kwh).toBeLessThan(p.import_kwh);
    expect(pb.saving).toBeGreaterThan(p.saving);
    expect(pb.self_sufficiency).toBeGreaterThan(0.6);
    expect(pb.self_sufficiency).toBeLessThanOrEqual(1);
  });
  it("energy adds up: what the battery saves never beats what solar makes", () => {
    const pb = replay(days, { panel_kw: 6.6, battery_kwh: 14 }, t, BNE);
    const made = 6.6 * 4.2 * 365;
    expect(pb.before.import_kwh - pb.import_kwh + pb.export_kwh).toBeLessThanOrEqual(made * 1.02);
  });
  it("battery only catches what the old system exports", () => {
    const solarHome = year((i) => (i >= 16 && i < 34 ? 0.05 : 0.6), (i) => (i >= 18 && i < 32 ? 1.0 : 0));
    const r = replay(solarHome, { panel_kw: 0, battery_kwh: 10 }, t, BNE);
    expect(r.export_kwh).toBeLessThan(r.before.export_kwh);
    expect(r.import_kwh).toBeLessThan(r.before.import_kwh);
    expect(r.saving).toBeGreaterThan(0);
  });
});
