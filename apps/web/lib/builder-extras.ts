// Server-only parts of the builder's price panel: the rebate sentence, the savings estimate, the size check and the
// next free install days. Same sources as product pages.
import { rebateWindow, yieldFor } from "@dfrnt/engine";
import type { BuildOptions } from "./builder";
import { pricingData } from "./pricing-data";
import { energySettings } from "./energy";
import { estimateSaving, TYPICAL_DAY_KWH, type SavingEstimate } from "./saving";
import { rebateLine } from "./rebate-line";
import { nextDays } from "./capacity";
import { todayAEST } from "./api";

export interface BuildExtras { rebateLine: string; lockUntil: string; dayKwhPerKw: number; saving: SavingEstimate | null; sizeNote: string | null; nextDays: string[] | null | undefined }

/** Daylight use a typical home takes from its own panels before the battery charges (share of TYPICAL_DAY_KWH). */
const DAYTIME_USE = Math.round(TYPICAL_DAY_KWH * 0.4);

export async function buildExtras(o: BuildOptions, postcode: string, rebateFrom: string | null | undefined): Promise<BuildExtras> {
  const data = await pricingData();
  const w = rebateWindow(todayAEST(), data.rebates, rebateFrom);
  const dayKwhPerKw = yieldFor(postcode, (await energySettings()).yields).kwh_per_kw;
  const p = o.price;
  let sizeNote: string | null = null;
  if (p && p.kw > 0) {
    const makes = Math.round(p.kw * dayKwhPerKw), spare = makes - DAYTIME_USE;
    if (p.kwh > spare) sizeNote = `Your panels make about ${makes} kWh on an average day. After a typical home uses about ${DAYTIME_USE} kWh in daylight, about ${Math.max(0, spare)} kWh is left to charge the battery, so ${Math.round(p.kwh * 10) / 10} kWh won't fill on most days. Add panels or choose a smaller battery.`;
  }
  const [saving, days] = await Promise.all([
    p ? estimateSaving({ postcode, panelKw: p.kw, batteryKwh: p.kwh, price: p.you_pay }).catch(() => null) : Promise.resolve(null),
    p ? nextDays(postcode, { brand: o.brands.find((b) => b.family === o.choice.family)?.brand, phases: o.choice.phases, kind: p.kw > 0 ? "solar_battery" : "battery_only", panelKw: p.kw }, 3) : Promise.resolve(undefined),
  ]);
  return { rebateLine: rebateLine(w, rebateFrom), lockUntil: w.lock_until, dayKwhPerKw, saving, sizeNote, nextDays: days };
}
