// Labelled savings estimate for product pages (launch copy, 3 Nov 2026).
// A typical SEQ home, replayed for a year against the standard tariff in Ops → Energy. Never a promise:
// every assumption is returned so the page can show it next to the number.
import { pvShape, replay, standardTariff, yieldFor, SLOTS, type DayRead } from "@dfrnt/engine";
import { energySettings } from "./energy";

export const TYPICAL_DAY_KWH = 20;
export const EXISTING_SOLAR_KW = 6.6;
/** The replay uses average-weather days; real years have runs of cloud. Take 20 % off and say so. */
export const WEATHER_ALLOWANCE = 0.2;

/** Half-hour load shape: low overnight, morning bump, steady day, evening peak. Sums to 1. */
const SHAPE = (() => {
  const w = Array.from({ length: SLOTS }, (_, i) => { const h = i / 2;
    return h < 6 ? 0.6 : h < 9 ? 1.4 : h < 16 ? 0.9 : h < 22 ? 2.0 : 1.0; });
  const t = w.reduce((a, b) => a + b, 0); return w.map((x) => x / t);
})();

export interface SavingEstimate { saving: number; payback_years: number | null; day_kwh: number; usage_c: number; fit_c: number; yield: number; city: string; existing_kw: number; allowance_pct: number }

export async function estimateSaving(o: { postcode: string; panelKw: number; batteryKwh: number; price: number }): Promise<SavingEstimate | null> {
  const es = await energySettings();
  const loc = yieldFor(o.postcode, es.yields);
  const existing = o.panelKw > 0 ? 0 : EXISTING_SOLAR_KW;
  const days: DayRead[] = [];
  for (let m = 0; m < 12; m++) {
    const pv = pvShape(m, loc).map((x) => x * existing);
    for (let d = 1; d <= 28; d++) {
      const load = SHAPE.map((f) => f * TYPICAL_DAY_KWH);
      days.push({ date: `2026-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
        imp: load.map((l, i) => Math.max(0, l - pv[i]!)), exp: load.map((l, i) => Math.max(0, pv[i]! - l)) });
    }
  }
  const r = replay(days, { panel_kw: o.panelKw, battery_kwh: o.batteryKwh }, standardTariff(es.standard), loc);
  const net = r.saving * (1 - WEATHER_ALLOWANCE);
  if (!(net > 50)) return null;
  const saving = Math.round(net / 50) * 50;
  return { saving, payback_years: o.price > 0 ? Math.round((o.price / net) * 2) / 2 : null, day_kwh: TYPICAL_DAY_KWH,
    usage_c: es.standard.usage_c, fit_c: es.standard.fit_c, yield: loc.kwh_per_kw, city: loc.city, existing_kw: existing, allowance_pct: WEATHER_ALLOWANCE * 100 };
}
