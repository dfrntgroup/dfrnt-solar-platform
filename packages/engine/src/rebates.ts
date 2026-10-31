// STC maths and the rebate window. Pure functions. Dates are ISO yyyy-mm-dd strings (AEST calendar dates).
import settingsJson from "./data/rebate-settings.json";
import { ZONE_RATINGS, stcZoneOrDefault, type StcZone } from "./zones";

export interface RebateSettings {
  version: string;
  stc_rate: number;
  lock_days: number;
  solar_deeming: { from: string; years: number }[];
  battery_factor: { from: string; factor: number }[];
  battery_tiers: [number, number][];
}
export const DEFAULT_REBATE_SETTINGS = settingsJson as unknown as RebateSettings;

const EPS = 1e-9;

/** Value in effect on `date` from an effective-dated schedule (sorted or not). Before the first entry → fallback. */
function effective<T extends { from: string }>(rows: T[], date: string): T | undefined {
  return [...rows].sort((a, b) => a.from.localeCompare(b.from)).filter((r) => r.from <= date).pop();
}

export const deemingYears = (date: string, s: RebateSettings = DEFAULT_REBATE_SETTINGS) => effective(s.solar_deeming, date)?.years ?? 0;
export const batteryFactor = (date: string, s: RebateSettings = DEFAULT_REBATE_SETTINGS) => effective(s.battery_factor, date)?.factor ?? 0;

/** Solar STCs = floor(kW × zone rating × deeming years). */
export function solarStcs(kw: number, zone: StcZone, date: string, s: RebateSettings = DEFAULT_REBATE_SETTINGS): number {
  if (!kw || kw <= 0) return 0;
  return Math.floor(kw * ZONE_RATINGS[zone] * deemingYears(date, s) + EPS);
}

/** CEC usable kWh after tiers: 100% of the first 14, 60% to 28, 15% to 50, nothing above. */
export function tieredKwh(kwh: number, s: RebateSettings = DEFAULT_REBATE_SETTINGS): number {
  if (!kwh || kwh <= 0) return 0;
  let prev = 0, out = 0;
  for (const [cap, pct] of s.battery_tiers) {
    out += Math.max(0, Math.min(kwh, cap) - prev) * pct;
    prev = cap;
  }
  return out;
}

export const batteryStcsWithFactor = (kwh: number, factor: number, s: RebateSettings = DEFAULT_REBATE_SETTINGS) =>
  !kwh || kwh <= 0 ? 0 : Math.floor(tieredKwh(kwh, s) * factor + EPS);

export const batteryStcs = (kwh: number, date: string, s: RebateSettings = DEFAULT_REBATE_SETTINGS) =>
  batteryStcsWithFactor(kwh, batteryFactor(date, s), s);

export interface RebateInput {
  /** Eligible solar kW (full kWp with a battery; capped at 133% of inverter AC without). */
  eligibleKw: number;
  /** CEC usable kWh — never nameplate. 0 when no battery or the NMI already claimed. */
  usableKwh: number;
  postcode: string;
  installDate: string;
  /** Override the fixed rate (tests / ops). */
  stcRate?: number;
}
export interface Rebate {
  zone: StcZone; zone_rating: number; deeming_years: number; battery_factor: number; tiered_kwh: number;
  solar_stcs: number; battery_stcs: number; stc_rate: number;
  solar_rebate: number; battery_rebate: number; total: number;
}

export function computeRebate(i: RebateInput, s: RebateSettings = DEFAULT_REBATE_SETTINGS): Rebate {
  const zone = stcZoneOrDefault(i.postcode);
  const rate = i.stcRate ?? s.stc_rate;
  const solar = solarStcs(i.eligibleKw, zone, i.installDate, s);
  const factor = batteryFactor(i.installDate, s);
  const battery = batteryStcsWithFactor(i.usableKwh, factor, s);
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return {
    zone, zone_rating: ZONE_RATINGS[zone], deeming_years: deemingYears(i.installDate, s), battery_factor: factor,
    tiered_kwh: r2(tieredKwh(i.usableKwh, s)), solar_stcs: solar, battery_stcs: battery, stc_rate: rate,
    solar_rebate: r2(solar * rate), battery_rebate: r2(battery * rate), total: r2((solar + battery) * rate),
  };
}

/* ---------- rebate window ---------- */

export const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** Every date on which either schedule changes. */
export function changeDates(s: RebateSettings = DEFAULT_REBATE_SETTINGS): string[] {
  return [...new Set([...s.solar_deeming.map((r) => r.from), ...s.battery_factor.map((r) => r.from)])].sort();
}

export interface RebateWindow {
  /** First day of the schedule window that contains asOf. */
  window_start: string;
  /** Last install date priced under this window (day before the next change); null if no change ahead. */
  window_end: string | null;
  /** Price lock = the earlier of asOf + lock_days and window_end. */
  lock_until: string;
}

/**
 * Rebate window rule (decided): a quote's rebate is locked until the earlier of 14 days or the end of the
 * current schedule window. Booking (E1) only offers install dates on or before window_end, so a locked price
 * can never be installed under a lower rebate.
 */
export function rebateWindow(asOf: string, s: RebateSettings = DEFAULT_REBATE_SETTINGS): RebateWindow {
  const dates = changeDates(s);
  const start = dates.filter((d) => d <= asOf).pop() ?? asOf;
  const next = dates.find((d) => d > asOf);
  const end = next ? addDays(next, -1) : null;
  const lock = addDays(asOf, s.lock_days);
  return { window_start: start, window_end: end, lock_until: end && end < lock ? end : lock };
}

/** True when an install date may be offered for a quote priced under `asOf`'s window. */
export const installDateAllowed = (installDate: string, asOf: string, s: RebateSettings = DEFAULT_REBATE_SETTINGS) => {
  const w = rebateWindow(asOf, s);
  return installDate >= asOf && (w.window_end == null || installDate <= w.window_end);
};
