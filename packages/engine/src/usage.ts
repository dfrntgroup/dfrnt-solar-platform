// Real-usage sizing (Fiskil / CDR meter data). Pure functions: profile a year of half-hour reads, size by simple
// maths (daily kWh ÷ local yield; battery = what the home uses between sunset and sunrise), then replay the year once
// for the chosen system to cost it on the customer's own tariff.

export const SLOTS = 48;

/** One day of meter data in local standard time (NEM market time), 48 half-hours of kWh. */
export interface DayRead { date: string; imp: number[]; exp?: number[]; ctl?: number[] }

// ── Location: Clean Energy Council average daily output per kW of panels, by reference city ────────────────
export interface YieldCity { city: string; kwh_per_kw: number; lat: number; lon: number }
export const DEFAULT_YIELDS: Record<string, YieldCity> = {
  brisbane: { city: "Brisbane", kwh_per_kw: 4.2, lat: -27.5, lon: 153.0 },
  cairns: { city: "Cairns", kwh_per_kw: 4.2, lat: -16.9, lon: 145.8 },
  sydney: { city: "Sydney", kwh_per_kw: 3.9, lat: -33.9, lon: 151.2 },
  canberra: { city: "Canberra", kwh_per_kw: 4.3, lat: -35.3, lon: 149.1 },
  melbourne: { city: "Melbourne", kwh_per_kw: 3.6, lat: -37.8, lon: 145.0 },
  adelaide: { city: "Adelaide", kwh_per_kw: 4.2, lat: -34.9, lon: 138.6 },
  perth: { city: "Perth", kwh_per_kw: 4.4, lat: -31.95, lon: 115.9 },
  darwin: { city: "Darwin", kwh_per_kw: 4.4, lat: -12.5, lon: 130.8 },
  alice: { city: "Alice Springs", kwh_per_kw: 5.0, lat: -23.7, lon: 133.9 },
  hobart: { city: "Hobart", kwh_per_kw: 3.5, lat: -42.9, lon: 147.3 },
};

/** Which reference city a postcode uses. North QLD (4700+) uses Cairns; inland areas use their capital until edited. */
export function yieldKey(postcode: string | number | null | undefined): string {
  const p = Number(postcode);
  if (!Number.isFinite(p) || p <= 0) return "brisbane";
  if (p >= 800 && p <= 869) return "darwin";
  if (p >= 870 && p <= 899) return "alice";
  if ((p >= 2600 && p <= 2618) || (p >= 2900 && p <= 2920)) return "canberra";
  if (p >= 1000 && p <= 2999) return "sydney";
  if (p >= 3000 && p <= 3999) return "melbourne";
  if (p >= 4700 && p <= 4999) return "cairns";
  if (p >= 4000 && p <= 4699) return "brisbane";
  if (p >= 5000 && p <= 5999) return "adelaide";
  if (p >= 6000 && p <= 6999) return "perth";
  if (p >= 7000 && p <= 7999) return "hobart";
  return "brisbane";
}
export function yieldFor(postcode: string | number | null | undefined, table: Record<string, YieldCity> = DEFAULT_YIELDS): YieldCity {
  return table[yieldKey(postcode)] ?? DEFAULT_YIELDS[yieldKey(postcode)] ?? DEFAULT_YIELDS.brisbane!;
}

// ── Sun position (good enough for shaping a day; totals come from the yield table) ───────────────────────────
/** Sunrise and sunset in standard-time hours for a month (0 = Jan), using the middle of the month. */
export function daylight(month: number, lat: number, lon: number): { rise: number; set: number } {
  const n = 15 + month * 30.4;
  const dec = (23.44 * Math.PI / 180) * Math.sin(2 * Math.PI * (284 + n) / 365);
  const phi = lat * Math.PI / 180;
  const w0 = Math.acos(Math.max(-1, Math.min(1, -Math.tan(phi) * Math.tan(dec))));
  const half = (w0 * 180 / Math.PI) / 15;
  const meridian = Math.round(lon / 15) * 15;                 // AEST 150°, ACST 142.5° rounds to 135/150; fine for shape
  const noon = 12 + (meridian - lon) / 15;
  return { rise: noon - half, set: noon + half };
}
/** Month factor around the annual average (summer up, winter down), stronger further south. Mean ≈ 1. */
export function seasonFactor(month: number, lat: number): number {
  const a = Math.max(0.02, Math.min(0.25, 0.0067 * Math.abs(lat) - 0.06));
  return 1 + a * Math.cos(2 * Math.PI * (month + 0.5) / 12);
}
/** kWh per half-hour that 1 kW of panels makes on an average day of `month`. Sums to yield × season. */
export function pvShape(month: number, loc: YieldCity): number[] {
  const { rise, set } = daylight(month, loc.lat, loc.lon);
  const w = Array.from({ length: SLOTS }, (_, i) => {
    const t = i / 2 + 0.25;
    return t <= rise || t >= set ? 0 : Math.pow(Math.sin(Math.PI * (t - rise) / (set - rise)), 1.4);
  });
  const sum = w.reduce((s, x) => s + x, 0) || 1;
  const day = loc.kwh_per_kw * seasonFactor(month, loc.lat);
  return w.map((x) => x * day / sum);
}
const isNight = (slot: number, d: { rise: number; set: number }) => { const t = slot / 2 + 0.25; return t < d.rise || t > d.set; };

// ── Profile ───────────────────────────────────────────────────────────────────────────────────────────────────
/** Sum any 5- or 15-minute series into 48 half-hours. */
export function toHalfHours(xs: number[]): number[] {
  if (xs.length === SLOTS) return xs.map((x) => Number(x) || 0);
  const k = xs.length / SLOTS;
  if (!Number.isInteger(k) || k < 1) return [];
  return Array.from({ length: SLOTS }, (_, i) => xs.slice(i * k, i * k + k).reduce((s, x) => s + (Number(x) || 0), 0));
}

export interface UsageProfile {
  days: number; from: string; to: string;
  /** Annualised to 365 days. General import (battery can serve it), controlled load (separate circuit), export. */
  annual_import_kwh: number; annual_controlled_kwh: number; annual_export_kwh: number;
  daily_kwh: number;              // import + controlled, per day
  night_kwh: number;              // typical (median) kWh imported between sunset and sunrise
  evening_share: number;          // share of general import outside daylight
  day_kwh: number;                // average general import in daylight
  daily_export_kwh: number;
  peak_kw: number;                // highest half-hour, as kW
  months: { month: number; days: number; imp: number[]; exp: number[] }[];   // average day per calendar month
  monthly: { ym: string; imp: number; exp: number; ctl: number }[];
  has_export: boolean;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const sum = (xs: number[] = []) => xs.reduce((s, x) => s + x, 0);
const median = (xs: number[]) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2; };

export function profileUsage(daysIn: DayRead[], loc: YieldCity): UsageProfile | null {
  const days = daysIn.filter((d) => d.imp?.length === SLOTS).sort((a, b) => a.date.localeCompare(b.date));
  if (!days.length) return null;
  const n = days.length, scale = 365 / n;
  const nights: number[] = [];
  let night = 0, total = 0, peak = 0;
  const acc = Array.from({ length: 12 }, (_, month) => ({ month, days: 0, imp: new Array(SLOTS).fill(0) as number[], exp: new Array(SLOTS).fill(0) as number[] }));
  const monthly = new Map<string, { imp: number; exp: number; ctl: number }>();
  for (const d of days) {
    const m = Number(d.date.slice(5, 7)) - 1, dl = daylight(m, loc.lat, loc.lon);
    let nk = 0;
    d.imp.forEach((v, i) => { if (isNight(i, dl)) nk += v; peak = Math.max(peak, v * 2); acc[m]!.imp[i]! += v; });
    (d.exp ?? []).forEach((v, i) => { acc[m]!.exp[i]! += v; });
    acc[m]!.days++;
    nights.push(nk); night += nk; total += sum(d.imp);
    const ym = d.date.slice(0, 7), row = monthly.get(ym) ?? { imp: 0, exp: 0, ctl: 0 };
    row.imp += sum(d.imp); row.exp += sum(d.exp); row.ctl += sum(d.ctl); monthly.set(ym, row);
  }
  const imp = total, ctl = sum(days.map((d) => sum(d.ctl))), exp = sum(days.map((d) => sum(d.exp)));
  return {
    days: n, from: days[0]!.date, to: days[n - 1]!.date,
    annual_import_kwh: Math.round(imp * scale), annual_controlled_kwh: Math.round(ctl * scale), annual_export_kwh: Math.round(exp * scale),
    daily_kwh: r1((imp + ctl) / n), night_kwh: r1(median(nights)), evening_share: total ? Math.round((night / total) * 100) / 100 : 0,
    day_kwh: r1((imp - night) / n), daily_export_kwh: r1(exp / n), peak_kw: r1(peak),
    months: acc.filter((a) => a.days).map((a) => ({ month: a.month, days: a.days, imp: a.imp.map((v) => Math.round((v / a.days) * 1000) / 1000), exp: a.exp.map((v) => Math.round((v / a.days) * 1000) / 1000) })),
    monthly: [...monthly.entries()].map(([ym, v]) => ({ ym, imp: Math.round(v.imp), exp: Math.round(v.exp), ctl: Math.round(v.ctl) })),
    has_export: exp / n > 0.5,
  };
}

/** Basic (accumulation) meter: only total reads over periods. Gives a daily average and nothing about timing. */
export function profileFromTotals(reads: { from: string; to: string; kwh: number }[]): { daily_kwh: number; days: number } | null {
  const days = sum(reads.map((r) => Math.max(1, (Date.parse(r.to) - Date.parse(r.from)) / 86400000 + 1)));
  const kwh = sum(reads.map((r) => r.kwh));
  return days > 0 && kwh > 0 ? { daily_kwh: r1(kwh / days), days: Math.round(days) } : null;
}

// ── Sizing: simple maths ─────────────────────────────────────────────────────────────────────────────────────
export const BATTERY_TIERS = [14, 28, 50] as const;
export function snapToTier(kwh: number, tolerance = 0.12): number {
  for (const t of BATTERY_TIERS) if (Math.abs(kwh - t) <= t * tolerance) return t;
  return r1(kwh);
}
export interface Targets { panel_kw: number; battery_kwh: number; daily_kwh: number; night_kwh: number; yield: number; capped_by_roof: boolean; why: string[] }

export function sizeTargets(p: Pick<UsageProfile, "daily_kwh" | "night_kwh" | "daily_export_kwh">, o: { yield: number; hasSolar: boolean; roofMaxKw?: number | null }): Targets {
  const why: string[] = [];
  let panel = 0, capped = false;
  if (!o.hasSolar) {
    panel = p.daily_kwh / o.yield;
    why.push(`${p.daily_kwh} kWh a day ÷ ${o.yield} kWh per kW = ${r1(panel)} kW of panels`);
    if (o.roofMaxKw && panel > o.roofMaxKw) { panel = o.roofMaxKw; capped = true; why.push(`Roof fits about ${o.roofMaxKw} kW, so capped there`); }
  }
  // Battery covers sunset to sunrise, but can only fill from spare solar.
  const spare = o.hasSolar ? p.daily_export_kwh : Math.max(0, panel * o.yield - Math.max(0, p.daily_kwh - p.night_kwh));
  let batt = p.night_kwh;
  why.push(`${p.night_kwh} kWh used between sunset and sunrise on a typical day`);
  if (spare > 0 && batt > spare) { batt = spare; why.push(`The panels have about ${r1(spare)} kWh a day spare to refill it, so sized to that`); }
  const snapped = snapToTier(batt);
  if (snapped !== r1(batt)) why.push(`Close to the ${snapped} kWh rebate tier, so set to ${snapped} kWh`);
  return { panel_kw: r1(panel), battery_kwh: snapped, daily_kwh: p.daily_kwh, night_kwh: p.night_kwh, yield: o.yield, capped_by_roof: capped, why };
}

// ── Tariff ───────────────────────────────────────────────────────────────────────────────────────────────────
export interface Rate { price: number; slots: boolean[]; weekdays?: boolean; weekends?: boolean; label?: string }
export interface Tariff { kind: "flat" | "tou"; supply_day: number; rates: Rate[]; controlled: number; fit: number; source: "retailer" | "standard"; name?: string }
export interface StandardTariff { usage_c: number; supply_c_day: number; fit_c: number; controlled_c: number }
export const DEFAULT_STANDARD_TARIFF: StandardTariff = { usage_c: 33, supply_c_day: 130, fit_c: 5, controlled_c: 22 };
export const standardTariff = (s: StandardTariff = DEFAULT_STANDARD_TARIFF): Tariff => ({
  kind: "flat", supply_day: s.supply_c_day / 100, rates: [{ price: s.usage_c / 100, slots: new Array(SLOTS).fill(true) }], controlled: s.controlled_c / 100, fit: s.fit_c / 100, source: "standard", name: "Standard SEQ tariff",
});

const slotOf = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return Math.max(0, Math.min(SLOTS, (h! * 60 + (m ?? 0)) / 30)); };
function slotsBetween(start: string, end: string): boolean[] {
  const a = slotOf(start), b0 = slotOf(end), b = b0 === 0 ? SLOTS : b0;
  return Array.from({ length: SLOTS }, (_, i) => (a < b ? i >= Math.floor(a) && i < Math.ceil(b) : i >= Math.floor(a) || i < Math.ceil(b)));
}
const firstPrice = (rates: unknown): number | null => {
  const r = Array.isArray(rates) ? rates.find((x) => x && Number.isFinite(Number((x as { unit_price?: string }).unit_price))) : null;
  return r ? Number((r as { unit_price: string }).unit_price) : null;
};

/**
 * CDR energy plan → tariff. CDR prices are ex-GST: usage, supply and controlled load get 10 % added; feed-in doesn't.
 * Anything missing (common: rates not published in the plan detail) falls back to the standard tariff for that part.
 */
export function tariffFromPlan(contract: Record<string, unknown> | null | undefined, std: StandardTariff = DEFAULT_STANDARD_TARIFF, name?: string): Tariff {
  const base = standardTariff(std);
  if (!contract) return base;
  const GST = 1.1;
  const periods = (contract.tariff_period as Record<string, unknown>[] | undefined) ?? [];
  const p = periods[0] ?? {};
  const supply = Number(p.daily_supply_charges ?? p.daily_supply_charge);
  const rates: Rate[] = [];
  const single = firstPrice((p.single_rate as { rates?: unknown } | undefined)?.rates);
  if (single != null) rates.push({ price: single * GST, slots: new Array(SLOTS).fill(true) });
  for (const t of ((p.time_of_use_rates as Record<string, unknown>[] | undefined) ?? [])) {
    const price = firstPrice(t.rates);
    if (price == null) continue;
    for (const w of ((t.time_of_use as Record<string, unknown>[] | undefined) ?? [])) {
      const days = (w.days as string[] | undefined) ?? [];
      const st = String(w.start_time ?? "00:00"), en = String(w.end_time ?? "00:00");
      rates.push({ price: price * GST, slots: slotsBetween(st.slice(0, 5), en.slice(0, 5)), label: String(t.type ?? t.display_name ?? ""),
        weekdays: !days.length || days.some((d) => /MON|TUE|WED|THU|FRI|BUSINESS/i.test(d)), weekends: !days.length || days.some((d) => /SAT|SUN|WEEKEND/i.test(d)) });
    }
  }
  const cl = firstPrice(((contract.controlled_load as Record<string, unknown>[] | undefined)?.[0]?.single_rate as { rates?: unknown } | undefined)?.rates);
  const fitRaw = firstPrice(((contract.solar_feed_in_tariff as Record<string, unknown>[] | undefined)?.[0]?.single_tariff as { rates?: unknown } | undefined)?.rates);
  const usable = rates.length > 0;
  return {
    kind: rates.length > 1 ? "tou" : "flat",
    supply_day: Number.isFinite(supply) && supply > 0 ? supply * GST : base.supply_day,
    rates: usable ? rates : base.rates,
    controlled: cl != null ? cl * GST : base.controlled,
    fit: fitRaw != null ? Math.abs(fitRaw) : base.fit,
    source: usable ? "retailer" : "standard",
    name,
  };
}
export function priceAt(t: Tariff, slot: number, weekend: boolean): number {
  for (const r of t.rates) if (r.slots[slot] && (weekend ? r.weekends !== false : r.weekdays !== false)) return r.price;
  return t.rates[0]?.price ?? 0;
}

// ── Replay ───────────────────────────────────────────────────────────────────────────────────────────────────
export interface SystemSpec { panel_kw: number; battery_kwh: number; battery_kw?: number; efficiency?: number }
export interface Replay {
  import_kwh: number; export_kwh: number; bill: number;
  before: { import_kwh: number; export_kwh: number; bill: number };
  saving: number; self_sufficiency: number; battery_cycles: number;
  monthly: { ym: string; imp_before: number; imp_after: number }[];
}

/**
 * Replay every real day once. New panels add to what's there; the battery charges from spare solar
 * (existing export plus new panels) and discharges into general import. Controlled load is untouched.
 */
export function replay(daysIn: DayRead[], sys: SystemSpec, tariff: Tariff, loc: YieldCity): Replay {
  const days = daysIn.filter((d) => d.imp?.length === SLOTS).sort((a, b) => a.date.localeCompare(b.date));
  const scale = days.length ? 365 / days.length : 0;
  const eff = Math.sqrt(sys.efficiency ?? 0.9), cap = Math.max(0, sys.battery_kwh), kwSlot = (sys.battery_kw ?? Math.max(2.5, cap / 2)) / 2;
  const shapes = Array.from({ length: 12 }, (_, m) => pvShape(m, loc).map((x) => x * sys.panel_kw));
  let soc = cap * 0.3, bImp = 0, bExp = 0, aImp = 0, aExp = 0, billB = 0, billA = 0, thru = 0, load = 0;
  const monthly = new Map<string, { b: number; a: number }>();
  for (const d of days) {
    const m = Number(d.date.slice(5, 7)) - 1, wd = new Date(`${d.date}T00:00:00Z`).getUTCDay(), weekend = wd === 0 || wd === 6;
    const ctl = sum(d.ctl);
    billB += tariff.supply_day + ctl * tariff.controlled; billA += tariff.supply_day + ctl * tariff.controlled;
    let dayB = 0, dayA = 0;
    for (let i = 0; i < SLOTS; i++) {
      const imp = d.imp[i] ?? 0, exp = d.exp?.[i] ?? 0, pv = shapes[m]![i]!, price = priceAt(tariff, i, weekend);
      bImp += imp; bExp += exp; billB += imp * price - exp * tariff.fit; dayB += imp;
      // New panels first serve the home, then become spare.
      const fromPv = Math.min(imp, pv);
      let need = imp - fromPv, spare = exp + (pv - fromPv);
      load += imp;
      const charge = Math.min(spare, kwSlot, (cap - soc) / eff);
      soc += charge * eff; spare -= charge; thru += charge;
      const dis = Math.min(need, kwSlot, soc * eff);
      soc -= dis / eff; need -= dis;
      aImp += need; aExp += spare; billA += need * price - spare * tariff.fit; dayA += need;
    }
    const ym = d.date.slice(0, 7), row = monthly.get(ym) ?? { b: 0, a: 0 };
    row.b += dayB; row.a += dayA; monthly.set(ym, row);
  }
  const k = (n: number) => Math.round(n * scale);
  return {
    import_kwh: k(aImp), export_kwh: k(aExp), bill: k(billA),
    before: { import_kwh: k(bImp), export_kwh: k(bExp), bill: k(billB) },
    saving: k(billB - billA),
    self_sufficiency: load ? Math.round((1 - aImp / load) * 100) / 100 : 0,
    battery_cycles: cap ? Math.round((thru * scale) / cap) : 0,
    monthly: [...monthly.entries()].map(([ym, v]) => ({ ym, imp_before: Math.round(v.b), imp_after: Math.round(v.a) })),
  };
}

/** Average day for a season (summer Dec–Feb, winter Jun–Aug): usage and what `panel_kw` would make. */
export function seasonDay(p: UsageProfile, season: "summer" | "winter", panelKw: number, loc: YieldCity) {
  const ms = season === "summer" ? [11, 0, 1] : [5, 6, 7];
  const rows = p.months.filter((m) => ms.includes(m.month));
  const n = sum(rows.map((r) => r.days)) || 1;
  const use = Array.from({ length: SLOTS }, (_, i) => sum(rows.map((r) => (r.imp[i] ?? 0) * r.days)) / n);
  const pv = ms.map((m) => pvShape(m, loc)).reduce((a, s) => a.map((x, i) => x + s[i]! / ms.length), new Array(SLOTS).fill(0) as number[]).map((x) => x * panelKw);
  return { use, pv, has: rows.length > 0 };
}
