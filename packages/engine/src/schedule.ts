// Install scheduling (spec S1–S6). Pure: who can do a job, how long it takes, and which days are free, from installers'
// calendar busy blocks plus our own bookings. Times are Brisbane (UTC+10, no daylight saving).
import { addDays } from "./rebates";

/* ---------- how: what a job needs ---------- */
export interface JobNeeds {
  brand: string;               // "SolaX" | "Sungrow" | "GoodWe" | "Sigenergy" …
  kind: "battery_only" | "solar_battery";
  panelKw: number;
  phases: 1 | 3 | "unknown";
  roofType: "tin" | "tile" | "kliplok";
  storeys: number;
  postcode: string;
}

/** What an installer can do and how long things take them (set once on their profile). */
export interface InstallerProfile {
  brands: string[];            // empty = not yet set: any brand
  roofTypes: string[];         // empty = any
  maxStoreys: number;
  phases: number[];            // empty = any
  durations: { battery_only: number; solar_battery: number };  // crew-days: 0.5, 1, 1.5, 2 …
  largeKw: number;             // above this many kW of panels, add a day
  twoStoreyExtra: number;      // crew-days added for two storeys
  noticeDays: number;          // working days' notice
  workingDays: number[];       // 0 = Sunday … 6 = Saturday
}

export const DEFAULT_PROFILE: InstallerProfile = {
  brands: [], roofTypes: [], maxStoreys: 2, phases: [], durations: { battery_only: 0.5, solar_battery: 1 },
  largeKw: 13, twoStoreyExtra: 0.5, noticeDays: 3, workingDays: [1, 2, 3, 4, 5],
};

/** Reasons this installer can't take the job ([] = can). */
export function cannotDo(p: InstallerProfile, n: JobNeeds): string[] {
  const r: string[] = [];
  if (p.brands.length && !p.brands.some((b) => b.toLowerCase() === n.brand.toLowerCase())) r.push(`Not accredited for ${n.brand}`);
  if (n.kind === "solar_battery" && p.roofTypes.length && !p.roofTypes.includes(n.roofType)) r.push(`Doesn't do ${n.roofType} roofs`);
  if (n.storeys > p.maxStoreys) r.push(`${n.storeys} storeys`);
  if (n.phases !== "unknown" && p.phases.length && !p.phases.includes(n.phases)) r.push(`${n.phases}-phase`);
  return r;
}

/** Crew-days the job takes for this installer, in half-day steps. */
export function jobDays(p: InstallerProfile, n: JobNeeds): number {
  let d = p.durations[n.kind] ?? (n.kind === "battery_only" ? 0.5 : 1);
  if (n.kind === "solar_battery" && n.panelKw > p.largeKw) d += 1;
  if (n.storeys >= 2) d += p.twoStoreyExtra;
  return Math.max(0.5, Math.ceil(d * 2) / 2);
}

/* ---------- when: free days ---------- */
export interface Busy { start: string; end: string }          // ISO instants (from Google free/busy)
export interface CrewCalendar {
  id: string;
  busy: Busy[];                                                // the installer's own commitments
  load: Record<string, number>;                                // our bookings already on this crew: date → crew-days used (0.5 or 1)
}

const TZ_MS = 10 * 3600_000;
const dow = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();
const dayStart = (d: string, hour: number) => Date.parse(`${d}T00:00:00Z`) - TZ_MS + hour * 3600_000;

/** A day is taken by the installer's own calendar when their events cover 2 hours or more of the 7 am–3 pm work window
 *  (an all-day event covers all of it). Returns the busy minutes inside the window. */
export function busyMinutes(date: string, busy: Busy[]): number {
  const a = dayStart(date, 7), b = dayStart(date, 15);
  const spans = busy.map((x) => [Math.max(a, Date.parse(x.start)), Math.min(b, Date.parse(x.end))] as const).filter(([s, e]) => e > s).sort((x, y) => x[0] - y[0]);
  let total = 0, curS = -1, curE = -1;
  for (const [s, e] of spans) {
    if (s > curE) { if (curE > curS) total += curE - curS; curS = s; curE = e; } else curE = Math.max(curE, e);
  }
  if (curE > curS) total += curE - curS;
  return Math.round(total / 60_000);
}

/** Free crew-days on this crew for one date: 1, 0.5 or 0. */
export function freeOn(date: string, crew: CrewCalendar, p: Pick<InstallerProfile, "workingDays">, blackouts: string[] = []): number {
  if (!p.workingDays.includes(dow(date)) || blackouts.includes(date)) return 0;
  if (busyMinutes(date, crew.busy) >= 120) return 0;
  return Math.max(0, 1 - (crew.load[date] ?? 0));
}

/** Next working day for this installer. */
export function nextWorkday(d: string, workingDays: number[]) {
  let out = addDays(d, 1);
  for (let i = 0; i < 14 && !workingDays.includes(dow(out)); i++) out = addDays(out, 1);
  return out;
}

export function addWorkdays(d: string, n: number, workingDays: number[]) {
  let out = d;
  for (let i = 0; i < n; i++) out = nextWorkday(out, workingDays);
  return out;
}

export interface Slot { date: string; crewId: string; days: number; part: "am" | "full"; dates: string[] }

/** Bookable start days for a job of `days` crew-days: a half-day job needs half a free day; longer jobs need that many
 *  fully free back-to-back working days on one crew. Earliest is after the notice period and the gear lead time;
 *  latest start keeps the whole job on or before `until` (the rebate deadline). One slot per date (first crew that fits). */
export function freeSlots(opts: {
  today: string; crews: CrewCalendar[]; profile: Pick<InstallerProfile, "workingDays" | "noticeDays">; days: number;
  until: string | null; gearLeadDays?: number; blackouts?: string[]; max?: number; horizonDays?: number;
}): Slot[] {
  const { today, crews, profile, days, until, gearLeadDays = 3, blackouts = [], max = 15, horizonDays = 84 } = opts;
  const out: Slot[] = [];
  if (!crews.length) return out;
  const floor = addWorkdays(today, Math.max(profile.noticeDays, gearLeadDays), [1, 2, 3, 4, 5]);
  const whole = Math.ceil(days);
  for (let i = 0, d = floor; i < horizonDays && out.length < max; i++, d = addDays(d, 1)) {
    if (!profile.workingDays.includes(dow(d))) continue;
    for (const c of crews) {
      const run = [d];
      while (run.length < whole) run.push(nextWorkday(run[run.length - 1]!, profile.workingDays));
      if (until && run[run.length - 1]! > until) continue;
      const ok = days <= 0.5 ? freeOn(d, c, profile, blackouts) >= 0.5 : run.every((x) => freeOn(x, c, profile, blackouts) >= 1);
      if (ok) { out.push({ date: d, crewId: c.id, days, part: days <= 0.5 ? "am" : "full", dates: run }); break; }
    }
    if (until && d > until) break;
  }
  return out;
}

/** Crew-day load per date from our bookings (start date + length in crew-days, laid over working days). */
export function loadFrom(bookings: { date: string; days: number }[], workingDays: number[]): Record<string, number> {
  const load: Record<string, number> = {};
  for (const b of bookings) {
    let left = b.days, d = b.date;
    while (left > 0) { load[d] = (load[d] ?? 0) + Math.min(1, left); left -= 1; if (left > 0) d = nextWorkday(d, workingDays); }
  }
  return load;
}

/** Free crew-days in a date range across crews (for the Ops capacity view). */
export function freeCrewDays(from: string, to: string, crews: CrewCalendar[], profile: Pick<InstallerProfile, "workingDays">, blackouts: string[] = []) {
  let n = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) for (const c of crews) n += freeOn(d, c, profile, blackouts);
  return n;
}
