// Quote and job lifecycle (build book 7.2) + instant-price scope check and earliest-date maths (7.3). Pure.
import { addDays } from "./rebates";

export const STATES = [
  "saved", "secured", "pricing_instant", "pricing_installer", "tech_review", "priced", "signed", "payment_pending",
  "payment_review", "awaiting_date", "booked", "gear_ordered", "delivered", "on_site", "variation_pending", "installed",
  "lodged", "settled", "complete", "cancelled", "expired", "lapsed", "declined",
] as const;
export type JobState = (typeof STATES)[number];

export const TRANSITIONS: Record<JobState, JobState[]> = {
  saved: ["secured", "expired"],
  secured: ["pricing_instant", "pricing_installer", "tech_review", "lapsed"],
  pricing_instant: ["priced"],
  pricing_installer: ["priced", "pricing_installer", "tech_review", "lapsed"],
  tech_review: ["pricing_installer", "priced", "declined"],
  priced: ["signed", "declined", "lapsed", "pricing_installer"],
  signed: ["payment_pending", "cancelled"],
  payment_pending: ["awaiting_date", "payment_review", "signed", "cancelled"],
  payment_review: ["awaiting_date", "cancelled"],
  awaiting_date: ["booked", "cancelled"],
  booked: ["gear_ordered", "awaiting_date", "cancelled"],
  gear_ordered: ["delivered", "cancelled"],
  delivered: ["on_site", "cancelled"],
  on_site: ["variation_pending", "installed"],
  variation_pending: ["on_site", "cancelled"],
  installed: ["lodged"],
  lodged: ["settled"],
  settled: ["complete"],
  complete: [], cancelled: [], expired: [], lapsed: ["secured"], declined: [],
};

/** Ops board column for each state (O1). */
export const BOARD: Record<JobState, string> = {
  saved: "Saved", secured: "Pricing", pricing_instant: "Pricing", pricing_installer: "Pricing", tech_review: "Tech review",
  priced: "Quoted", signed: "Pending payment", payment_pending: "Pending payment", payment_review: "Payment review",
  awaiting_date: "Awaiting date", booked: "Booked", gear_ordered: "Gear ordered", delivered: "Delivered", on_site: "On site",
  variation_pending: "On hold", installed: "Installed", lodged: "Lodged", settled: "Settled", complete: "Complete",
  cancelled: "Cancelled", expired: "Closed", lapsed: "Closed", declined: "Closed",
};

export const canTransition = (from: JobState, to: JobState) => TRANSITIONS[from]?.includes(to) ?? false;
export function assertTransition(from: JobState, to: JobState) {
  if (!canTransition(from, to)) throw new Error(`Not allowed: ${from} → ${to}`);
}

/* ---------- site answers + instant price ---------- */
export interface SiteAnswers {
  address: { line1: string; unit?: string; suburb: string; state: string; postcode: string; gnafPid?: string };
  phases: 1 | 3 | "unknown";
  roofType: "tin" | "tile" | "kliplok";
  storeys: number;
  batteryLocation: "garage" | "outdoor_wall" | "other";
  againstHabitableRoom?: boolean;
  vehicleExposure?: boolean;
  switchboard: "ok" | "needs_subboard" | "unsure";
  cableRunM?: number;
  /** National Metering Identifier (on the electricity bill). Needed for the battery rebate and grid connection. */
  nmi?: string;
  energyRetailer?: string;
  /** NMI already claimed a battery rebate. */
  priorBatteryClaim?: boolean;
  photos: Record<string, boolean>;
}

export const REQUIRED_PHOTOS = ["switchboard", "meter", "roof", "battery_location"] as const;

export interface StandardScope {
  version: number;
  maxStoreys: number;
  roofTypes: SiteAnswers["roofType"][];
  batteryLocations: SiteAnswers["batteryLocation"][];
  switchboardOk: boolean;           // only "ok" switchboards are in scope
  maxCableRunM: number;
  phases: (1 | 3)[];
}

export const DEFAULT_SCOPE: StandardScope = { version: 1, maxStoreys: 2, roofTypes: ["tin", "tile", "kliplok"], batteryLocations: ["garage", "outdoor_wall", "other"], switchboardOk: true, maxCableRunM: 10, phases: [1, 3] };

/** Returns [] when the job can be priced instantly; otherwise the reasons it goes to the installer (I2). */
export function instantPriceBlockers(a: SiteAnswers, scope: StandardScope): string[] {
  const r: string[] = [];
  for (const p of REQUIRED_PHOTOS) if (!a.photos[p]) r.push(`Photo missing: ${p.replace("_", " ")}`);
  if (a.phases === "unknown") r.push("Phases unknown");
  else if (!scope.phases.includes(a.phases)) r.push(`${a.phases}-phase outside scope`);
  if (a.storeys > scope.maxStoreys) r.push(`${a.storeys} storeys outside scope`);
  if (!scope.roofTypes.includes(a.roofType)) r.push(`${a.roofType} roof outside scope`);
  if (!scope.batteryLocations.includes(a.batteryLocation)) r.push(`Battery location ${a.batteryLocation} outside scope`);
  if (a.switchboard !== "ok") r.push(a.switchboard === "unsure" ? "Switchboard to be checked" : "Switchboard needs a sub-board");
  if ((a.cableRunM ?? 0) > scope.maxCableRunM) r.push(`Cable run ${a.cableRunM} m over ${scope.maxCableRunM} m`);
  if (!a.address.line1 || !a.address.suburb) r.push("Address incomplete");
  return r;
}

/* ---------- earliest install date ---------- */
export interface Capacity {
  jobsPerDay: number;
  leadDays: number;
  /** 0 = Sunday … 6 = Saturday */
  workingDays: number[];
  blackouts: string[];
  /** Booked jobs per date (paid jobs and 48 h holds only — unpaid quotes never hold a slot). */
  booked: Record<string, number>;
}

const dow = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();
const isWorkday = (d: string) => dow(d) !== 0 && dow(d) !== 6;

export function addWorkingDays(d: string, n: number) {
  let out = d, left = n;
  while (left > 0) { out = addDays(out, 1); if (isWorkday(out)) left--; }
  return out;
}

/** Later of: next free installer slot after lead days, and today + gear lead + 2 working days. Null if none within `horizon` days. */
export function earliestDate(today: string, cap: Capacity, gearLeadDays = 0, horizon = 120): string | null {
  const floor = addWorkingDays(addDays(today, gearLeadDays), 2);
  let d = addDays(today, cap.leadDays);
  if (d < floor) d = floor;
  for (let i = 0; i < horizon; i++, d = addDays(d, 1)) {
    if (!cap.workingDays.includes(dow(d)) || cap.blackouts.includes(d)) continue;
    if ((cap.booked[d] ?? 0) < cap.jobsPerDay) return d;
  }
  return null;
}

/** Bookable dates from the earliest up to `until` (inclusive), e.g. the rebate window end. */
export function bookableDates(today: string, cap: Capacity, until: string | null, gearLeadDays = 0, max = 20): string[] {
  const out: string[] = [];
  let d = earliestDate(today, cap, gearLeadDays);
  while (d && out.length < max && (!until || d <= until)) {
    if (cap.workingDays.includes(dow(d)) && !cap.blackouts.includes(d) && (cap.booked[d] ?? 0) < cap.jobsPerDay) out.push(d);
    d = addDays(d, 1);
    if (until == null && out.length >= max) break;
    if (addDays(today, 180) < d) break;
  }
  return out;
}

/* ---------- cancellation (7.3) ---------- */
export function businessDaysBetween(from: string, to: string) {
  let n = 0, d = from;
  while (d < to) { d = addDays(d, 1); if (isWorkday(d)) n++; }
  return n;
}

export type RefundRule = "full_cooling_off" | "full_less_unrecoverable" | "less_restocking";
export function refundRule(signedOn: string, today: string, state: JobState): RefundRule {
  if (businessDaysBetween(signedOn, today) <= 10) return "full_cooling_off";
  return ["gear_ordered", "delivered", "on_site", "variation_pending"].includes(state) ? "less_restocking" : "full_less_unrecoverable";
}
