// Install scheduling service (spec S1–S6): who can do a job, how long it takes, which days are free (live from installers'
// Google calendars plus our own bookings), booking, declines, moves, earlier-day offers and the installer-offer fallback.
import { db, write, type Actor } from "@dfrnt/db";
import {
  addDays, cannotDo, DEFAULT_PROFILE, DEFAULT_RULES, earliestDate, freeSlots, jobDays, loadFrom, rebateWindow,
  type Capacity, type CrewCalendar, type InstallerProfile, type JobNeeds, type Slot,
} from "@dfrnt/engine";
import { dateAEST, todayAEST } from "./api";
import { getQuote, type QuoteRow } from "./jobs";
import { queueMessage, siteUrl } from "./messages";
import { pricingDataFor } from "./pricing-data";
import { getSetting } from "./settings";
import { googleBusy, removeEvent, writeEvents } from "./google";

export const BOOKED: string[] = ["booked", "gear_ordered", "delivered", "on_site", "variation_pending"];
const SYSTEM: Actor = { type: "system", id: "scheduler" };

/* ---------- profiles, needs, crews ---------- */
type InstallerRow = { id: string; business_name: string; email: string | null; profile: Partial<InstallerProfile> | null; capacity: Omit<Capacity, "booked"> | null; is_test: boolean };

export function profileOf(i: Pick<InstallerRow, "profile" | "capacity">): InstallerProfile {
  const c = i.capacity;
  return {
    ...DEFAULT_PROFILE,
    ...(c ? { noticeDays: c.leadDays ?? DEFAULT_PROFILE.noticeDays, workingDays: c.workingDays?.length ? c.workingDays : DEFAULT_PROFILE.workingDays } : {}),
    ...(i.profile ?? {}),
    durations: { ...DEFAULT_PROFILE.durations, ...(i.profile?.durations ?? {}) },
  };
}

export function needsOf(q: QuoteRow): JobNeeds {
  const p = q.snapshot ?? q.result;
  const site = q.site ?? (q.site_draft as QuoteRow["site"]);
  const fam = DEFAULT_RULES.families[q.input.familyKey];
  return {
    brand: fam?.brand ?? (q.title ?? "").split(" · ")[0] ?? "",
    kind: q.input.panelCount > 0 ? "solar_battery" : "battery_only",
    panelKw: p.config.panel_kw ?? 0,
    phases: site?.phases ?? (q.input.phases as 1 | 3) ?? 1,
    roofType: site?.roofType ?? q.input.roofType ?? "tin",
    storeys: site?.storeys ?? q.input.storeys ?? 1,
    postcode: site?.address?.postcode ?? q.postcode,
  };
}

const live = (source: string, isTest: boolean) => source === "google" || (source === "test" && isTest);

export async function crewsOf(installerId: string) {
  return db()`select c.id, c.name, c.source, c.status, c.busy_calendar_ids, c.dfrnt_calendar_id, c.google_email, i.is_test
    from installer_crews c join installers i on i.id = c.installer_id where c.installer_id = ${installerId} and c.active order by c.created_at`;
}

/* ---------- busy times ---------- */
async function busyFor(crew: Record<string, unknown>, from: string, to: string, fresh: boolean) {
  const id = crew.id as string;
  if (crew.source === "test") {
    const rows = await db()`select starts_at, ends_at from crew_busy_test where crew_id = ${id} and ends_at >= ${from}::date and starts_at <= ${to}::date + 1`;
    return rows.map((r) => ({ start: new Date(r.starts_at as string).toISOString(), end: new Date(r.ends_at as string).toISOString() }));
  }
  if (crew.source !== "google" || crew.status === "error") return [];
  if (!fresh) {
    const [c] = await db()`select busy, range_from::text f, range_to::text t from crew_busy_cache where crew_id = ${id} and fetched_at > now() - interval '10 minutes'`;
    if (c && (c.f as string) <= from && (c.t as string) >= to) return c.busy as { start: string; end: string }[];
  }
  const busy = await googleBusy(id, from, to, crew.busy_calendar_ids as string[], (crew.dfrnt_calendar_id as string) ?? null);
  await db()`insert into crew_busy_cache (crew_id, fetched_at, range_from, range_to, busy) values (${id}, now(), ${from}, ${to}, ${db().json(busy as never)})
    on conflict (crew_id) do update set fetched_at = now(), range_from = excluded.range_from, range_to = excluded.range_to, busy = excluded.busy`;
  return busy;
}

/** Our own bookings on these crews, as crew-day load per date. */
async function loads(crewIds: string[], workingDays: number[], exceptQuote?: string) {
  if (!crewIds.length) return {} as Record<string, Record<string, number>>;
  const rows = await db()`select crew_id, install_date::text d, coalesce(job_days, 1)::float8 days from quotes
    where crew_id = any(${crewIds}::uuid[]) and install_date is not null and not rebook and status = any(${BOOKED}) and id::text <> ${exceptQuote ?? ""}`;
  const out: Record<string, Record<string, number>> = {};
  for (const id of crewIds) out[id] = loadFrom(rows.filter((r) => r.crew_id === id).map((r) => ({ date: r.d as string, days: r.days as number })), workingDays);
  return out;
}

async function liveCrews(installerId: string, profile: InstallerProfile, from: string, to: string, fresh: boolean, exceptQuote?: string): Promise<CrewCalendar[]> {
  const crews = (await crewsOf(installerId)).filter((c) => live(c.source as string, c.is_test as boolean) && c.status !== "error");
  if (!crews.length) return [];
  const load = await loads(crews.map((c) => c.id as string), profile.workingDays, exceptQuote);
  const out: CrewCalendar[] = [];
  for (const c of crews) {
    try { out.push({ id: c.id as string, busy: await busyFor(c, from, to, fresh), load: load[c.id as string] ?? {} }); }
    catch { /* a broken connection drops that crew, never the whole installer */ }
  }
  return out;
}

async function installerRow(id: string) {
  const [i] = await db()`select id, business_name, email, profile, capacity, is_test from installers where id = ${id}`;
  return i as unknown as InstallerRow | undefined;
}

/* ---------- when: days for a job ---------- */
export interface DayChoice { mode: "live" | "offer" | "none"; days: number; slots: Slot[]; offered?: string[]; until: string | null }

async function windowEnd(q: QuoteRow) {
  // The window the price was computed for (its rebate date), not the UTC day the row was created.
  return rebateWindow(q.input.installDate ?? dateAEST(q.created_at), (await pricingDataFor(q.result.versions)).rebates).window_end;
}

/** The days this customer can book: live from their installer's calendars, else the days their installer offered. */
export async function daysFor(q: QuoteRow, opts: { fresh?: boolean; max?: number } = {}): Promise<DayChoice> {
  const until = await windowEnd(q);
  if (!q.installer_id) return { mode: "none", days: 1, slots: [], until };
  const inst = await installerRow(q.installer_id);
  if (!inst) return { mode: "none", days: 1, slots: [], until };
  const profile = profileOf(inst);
  const [ex] = await db()`select coalesce(sum(extra_days), 0)::float8 d from quote_addons where quote_id = ${q.id} and status = 'in_quote'`;
  const days = q.job_days ? Number(q.job_days) : jobDays(profile, needsOf(q)) + ((ex?.d as number) ?? 0);
  const today = todayAEST();
  const crews = await liveCrews(inst.id, profile, today, addDays(today, 90), !!opts.fresh, q.id);
  if (crews.length) {
    const { gear_lead_days } = await getSetting("scheduling");
    return { mode: "live", days, until, slots: freeSlots({ today, crews, profile, days, until, gearLeadDays: gear_lead_days, max: opts.max ?? 15, blackouts: inst.capacity?.blackouts ?? [] }) };
  }
  const [offer] = await db()`select dates::text[] dates from date_offers where quote_id = ${q.id} and kind = 'installer' and status = 'open' order by created_at desc limit 1`;
  const offered = ((offer?.dates as string[]) ?? []).filter((d) => d >= today && (!until || d <= until));
  return { mode: "offer", days, until, slots: offered.map((d) => ({ date: d, crewId: "", days, part: days <= 0.5 ? "am" : "full", dates: [d] })), offered };
}

/* ---------- who + when for a postcode (before they pay) ---------- */
const pcCache = new Map<string, { at: number; v: string[] | null }>();
const includeTest = () => process.env.VERCEL_ENV !== "production";

/** Next free install days for a postcode and kind of job, across every installer who can do it. null = nobody covers it. */
export async function nextDaysFor(postcode: string, needs?: Partial<JobNeeds>, n = 3): Promise<string[] | null> {
  const key = `${postcode}|${needs?.brand ?? ""}|${needs?.kind ?? ""}|${n}`;
  const hit = pcCache.get(key);
  if (hit && Date.now() - hit.at < 120_000) return hit.v;
  const pc = parseInt(postcode, 10);
  const rows = await db()`select id, business_name, email, profile, capacity, is_test from installers
    where active and (not is_test or ${includeTest()}) and exists (select 1 from unnest(postcode_ranges) r where r @> ${pc}::int)`;
  if (!rows.length) { pcCache.set(key, { at: Date.now(), v: null }); return null; }
  const today = todayAEST();
  const full: JobNeeds = { brand: "", kind: "solar_battery", panelKw: 10, phases: 1, roofType: "tin", storeys: 1, postcode, ...needs };
  const { gear_lead_days } = await getSetting("scheduling");
  const dates = new Set<string>();
  for (const r of rows as unknown as InstallerRow[]) {
    const profile = profileOf(r);
    if (cannotDo(profile, { ...full, brand: full.brand || "" }).filter((x) => !x.startsWith("Not accredited for ") || full.brand).length) continue;
    const crews = await liveCrews(r.id, profile, today, addDays(today, 60), false);
    if (crews.length) {
      for (const s of freeSlots({ today, crews, profile, days: jobDays(profile, full), until: null, gearLeadDays: gear_lead_days, max: n })) dates.add(s.date);
    } else if (r.capacity) {
      // Not connected yet: their stated working days and notice give an estimate (the real day is offered after payment).
      const booked = Object.fromEntries((await db()`select install_date::text d, count(*)::int n from quotes where installer_id = ${r.id} and install_date is not null and status = any(${BOOKED}) group by 1`).map((x) => [x.d, x.n]));
      const e = earliestDate(today, { ...r.capacity, booked }, gear_lead_days);
      if (e) dates.add(e);
    }
  }
  const v = [...dates].sort().slice(0, n);
  pcCache.set(key, { at: Date.now(), v });
  return v;
}

/** Earliest day one installer could start this kind of job (live calendar, else their stated days as an estimate). */
export async function earliestFor(installerId: string, needs: JobNeeds): Promise<{ date: string | null; live: boolean; can: string[] }> {
  const inst = await installerRow(installerId);
  if (!inst) return { date: null, live: false, can: ["Unknown installer"] };
  const profile = profileOf(inst);
  const why = cannotDo(profile, needs);
  const today = todayAEST();
  const { gear_lead_days } = await getSetting("scheduling");
  const crews = await liveCrews(inst.id, profile, today, addDays(today, 60), false);
  if (crews.length) return { date: freeSlots({ today, crews, profile, days: jobDays(profile, needs), until: null, gearLeadDays: gear_lead_days, max: 1 })[0]?.date ?? null, live: true, can: why };
  if (!inst.capacity) return { date: null, live: false, can: why };
  const booked = Object.fromEntries((await db()`select install_date::text d, count(*)::int n from quotes where installer_id = ${inst.id} and install_date is not null and status = any(${BOOKED}) group by 1`).map((x) => [x.d, x.n]));
  return { date: earliestDate(today, { ...inst.capacity, booked }, gear_lead_days), live: false, can: why };
}

/* ---------- booking ---------- */
const placeOf = (q: QuoteRow) => { const a = q.site?.address; return a ? `${a.unit ? `${a.unit}/` : ""}${a.line1}, ${a.suburb} ${a.postcode}` : q.postcode; };

async function writeToCalendar(q: QuoteRow, crewId: string, dates: string[]) {
  const [c] = await db()`select source, dfrnt_calendar_id from installer_crews where id = ${crewId}`;
  if (c?.source !== "google" || !c.dfrnt_calendar_id) return null;
  const p = q.snapshot ?? q.result;
  const ids = await writeEvents(crewId, c.dfrnt_calendar_id as string, q.google_event_id, {
    title: `DFRNT install: ${q.customer_name ?? ""} · ${q.title ?? ""}`.slice(0, 120),
    location: placeOf(q),
    description: `${p.config.summary}\n\nJob, photos and messages: ${siteUrl()}/installer/job/${q.id}`,
    dates,
  });
  await db()`update quotes set google_event_id = ${ids} where id = ${q.id}`;
  return ids;
}

/** Book (or re-book) a day. Re-checks the installer's calendar live first, so a day can't be taken twice. */
export async function bookDay(q: QuoteRow, date: string, actor: Actor, via: "customer" | "desk" | "installer_offer" | "earlier_offer") {
  const rebooking = BOOKED.includes(q.status) && (q.rebook || via === "earlier_offer");
  if (q.status !== "awaiting_date" && !rebooking) throw new Error("Not ready to book");
  const choice = await daysFor(q, { fresh: true, max: 40 });
  const slot = choice.slots.find((s) => s.date === date);
  if (!slot) throw new Error("That day has just gone. Pick another.");
  const { decline_hours } = await getSetting("scheduling");
  if (choice.mode === "offer" && via === "customer") via = "installer_offer";
  const fields = { install_date: date, crew_id: slot.crewId || null, job_days: choice.days, install_part: slot.part, booked_via: via, booked_at: new Date(),
    decline_until: new Date(Date.now() + decline_hours * 3600_000), rebook: false, slot_hold_until: null };
  const oldDate = q.install_date, oldCrew = q.crew_id;
  await write({ actor, action: rebooking ? "jobs.rebook" : "jobs.book" }, { token: q.token, date, via }, async (tx) => {
    // One booking at a time per crew (or installer): the second of two simultaneous taps waits here, then
    // re-checks the calendar and finds the day gone. The lock ends with this transaction.
    await tx`select pg_advisory_xact_lock(hashtext(${`book:${slot.crewId || q.installer_id || "none"}`}))`;
    const still = (await daysFor(q, { fresh: true, max: 40 })).slots.some((x) => x.date === date && (x.crewId || "") === (slot.crewId || ""));
    if (!still) throw new Error("That day has just gone. Pick another.");
    const [row] = await tx`update quotes set ${tx({ ...fields, ...(rebooking ? {} : { status: "booked" }), updated_at: new Date() } as never)}
      where id = ${q.id} and status = ${q.status} returning id`;
    if (!row) throw new Error("Job changed while you were booking; reload and try again");
    if (!rebooking && q.installer_id) await tx`insert into pay_ledger (installer_id, quote_id, description, amount_ex)
      select ${q.installer_id}, ${q.id}, 'Installation (frozen at pricing)', ${(q.snapshot ?? q.result).stack.installer_pay_ex_gst}
      where not exists (select 1 from pay_ledger where quote_id = ${q.id} and variation_id is null)`;
    await tx`update date_offers set status = case when kind = 'installer' then 'taken' else status end where quote_id = ${q.id} and status = 'open' and kind = 'installer'`;
    return { entity: "quote", entityId: q.id, event: rebooking ? "quote.rebooked" : "quote.booked", result: { date, crew: slot.crewId || null, via } };
  });
  let fresh = (await getQuote(q.token))!;
  if (oldCrew && q.google_event_id && oldCrew !== slot.crewId) {
    const [c] = await db()`select dfrnt_calendar_id from installer_crews where id = ${oldCrew}`;
    if (c?.dfrnt_calendar_id) for (const id of q.google_event_id.split(",")) await removeEvent(oldCrew, c.dfrnt_calendar_id as string, id);
    await db()`update quotes set google_event_id = null where id = ${q.id}`;
    fresh = (await getQuote(q.token))!;
  }
  if (slot.crewId) await writeToCalendar(fresh, slot.crewId, slot.dates).catch(async (e) => {
    await db()`insert into events (type, entity, entity_id, payload) values ('calendar.write_failed', 'quote', ${q.id}, ${db().json({ error: (e as Error).message })})`;
  });
  const when = `${date}${slot.part === "am" ? " (morning)" : ""}`;
  await queueMessage(rebooking ? "M17" : "M4", q.token, q.customer_email, { name: q.customer_name, date: when });
  const inst = q.installer_id ? await installerRow(q.installer_id) : null;
  if (inst?.email) await queueMessage("I1", q.token, inst.email, { name: inst.business_name, date: when, place: placeOf(q), jobId: q.id, days: choice.days, rebook: rebooking });
  if (rebooking && oldDate && oldDate !== date) await offerEarlier(q.installer_id, oldCrew, oldDate, q.id);
}

/** Release a booked day: installer declined, rain, sick, parts, customer or ops. The customer picks again; the freed day is
 *  offered to customers booked later with the same installer. */
export async function releaseDay(q: QuoteRow, reason: string, actor: Actor) {
  if (!BOOKED.slice(0, 3).includes(q.status) || !q.install_date) throw new Error("This job has no day to move");
  const crewId = q.crew_id;
  const freed = q.install_date;
  await write({ actor, action: "jobs.release_day", rationale: reason }, { token: q.token, reason }, async (tx) => {
    await tx`update quotes set install_date = null, install_part = null, rebook = true, decline_until = null, updated_at = now() where id = ${q.id}`;
    await tx`insert into date_moves (quote_id, installer_id, from_date, reason, by_type) values (${q.id}, ${q.installer_id}, ${freed}, ${reason}, ${actor.type})`;
    return { entity: "quote", entityId: q.id, event: "quote.day_released", result: { freed, reason } };
  });
  if (crewId && q.google_event_id) {
    const [c] = await db()`select dfrnt_calendar_id from installer_crews where id = ${crewId}`;
    if (c?.dfrnt_calendar_id) for (const id of q.google_event_id.split(",")) await removeEvent(crewId, c.dfrnt_calendar_id as string, id);
    await db()`update quotes set google_event_id = null where id = ${q.id}`;
  }
  const words: Record<string, string> = { declined: "your installer can't make that day after all", rain: "rain is forecast", sick: "your installer is unwell", parts: "a part won't arrive in time", customer: "you asked to move it", ops: "we need to move it" };
  await queueMessage("M18", q.token, q.customer_email, { name: q.customer_name, date: freed, why: words[reason] ?? reason });
  await offerEarlier(q.installer_id, crewId, freed, q.id);
}

/** "An earlier day opened up": offer a freed day to up to 5 customers booked later with the same installer. First to tap gets it. */
export async function offerEarlier(installerId: string | null, crewId: string | null, freed: string, exceptQuote: string) {
  if (!installerId || freed <= todayAEST()) return 0;
  const { earlier_offer_hours } = await getSetting("scheduling");
  const later = await db()`select token, customer_email, customer_name, id from quotes where installer_id = ${installerId} and status in ('booked','gear_ordered')
    and not rebook and install_date > ${freed} and id <> ${exceptQuote} order by install_date limit 5`;
  let sent = 0;
  for (const l of later) {
    const q = (await getQuote(l.token as string))!;
    const choice = await daysFor(q, { max: 40 });
    if (!choice.slots.some((s) => s.date === freed)) continue;
    const [o] = await db()`insert into date_offers (quote_id, kind, dates, crew_id, expires_at) values (${q.id}, 'earlier', ${[freed]}::date[], ${crewId}, now() + ${`${earlier_offer_hours} hours`}::interval) returning id`;
    await queueMessage("M19", q.token, q.customer_email, { name: q.customer_name, date: freed, offer: o!.id });
    sent++;
  }
  return sent;
}

/** Customer taps "Yes, move me earlier". */
export async function takeEarlier(q: QuoteRow, offerId: string) {
  const [o] = await db()`select id, dates::text[] dates, status, expires_at from date_offers where id = ${offerId} and quote_id = ${q.id} and kind = 'earlier'`;
  if (!o || o.status !== "open" || new Date(o.expires_at as string) < new Date()) throw new Error("That earlier day has gone. Your booking hasn't changed.");
  const date = (o.dates as string[])[0]!;
  try { await bookDay(q, date, { type: "customer", id: "record-link" }, "earlier_offer"); }
  catch (e) { await db()`update date_offers set status = 'lost' where id = ${offerId}`; throw e; }
  await db()`update date_offers set status = 'taken' where id = ${offerId}`;
  await db()`update date_offers set status = 'lost' where kind = 'earlier' and status = 'open' and id <> ${offerId} and ${date}::date = any(dates)`;
}

/* ---------- fallback: the installer offers days ---------- */
/** After payment, if the installer isn't connected, ask them for 3 days (by email/text) instead of guessing. */
export async function requestOffer(q: QuoteRow) {
  if (!q.installer_id) return;
  const crews = (await crewsOf(q.installer_id)).filter((c) => live(c.source as string, c.is_test as boolean));
  if (crews.length) return;
  const [open] = await db()`select id from date_offers where quote_id = ${q.id} and kind = 'installer' and status in ('requested','open')`;
  if (open) return;
  await db()`insert into date_offers (quote_id, kind, status) values (${q.id}, 'installer', 'requested')`;
  const inst = await installerRow(q.installer_id);
  const until = await windowEnd(q);
  if (inst?.email) await queueMessage("I2", q.token, inst.email, { name: inst.business_name, place: placeOf(q), jobId: q.id, until: until ?? "" });
}

export async function installerOffers(q: QuoteRow, dates: string[], actor: Actor) {
  const until = await windowEnd(q);
  const today = todayAEST();
  const clean = [...new Set(dates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d > today && (!until || d <= until)))].sort();
  if (clean.length < 1) throw new Error(`Offer at least one day after today${until ? ` and on or before ${until} (the customer's rebate deadline)` : ""}`);
  await write({ actor, action: "jobs.offer_days" }, { token: q.token, dates: clean }, async (tx) => {
    await tx`update date_offers set status = 'expired' where quote_id = ${q.id} and kind = 'installer' and status in ('requested','open')`;
    await tx`insert into date_offers (quote_id, kind, dates, status) values (${q.id}, 'installer', ${clean}::date[], 'open')`;
    return { entity: "quote", entityId: q.id, event: "quote.days_offered", result: { dates: clean } };
  });
  await queueMessage("M20", q.token, q.customer_email, { name: q.customer_name });
}

/** S1: "your next 4 weeks as customers see them": per crew, per working day, free / half / taken. */
export async function previewFor(installerId: string, weeks = 4) {
  const inst = await installerRow(installerId);
  if (!inst) return { days: [] as { date: string; crews: { name: string; free: number }[] }[], profile: DEFAULT_PROFILE };
  const profile = profileOf(inst);
  const today = todayAEST(), to = addDays(today, weeks * 7);
  const rows = (await crewsOf(installerId)).filter((c) => live(c.source as string, c.is_test as boolean));
  const crews = await liveCrews(installerId, profile, today, to, true);
  const { freeOn } = await import("@dfrnt/engine");
  const days: { date: string; crews: { name: string; free: number }[] }[] = [];
  for (let d = addDays(today, 1); d <= to; d = addDays(d, 1)) {
    if (!profile.workingDays.includes(new Date(`${d}T00:00:00Z`).getUTCDay())) continue;
    days.push({ date: d, crews: crews.map((c) => ({ name: (rows.find((r) => r.id === c.id)?.name as string) ?? "Crew", free: freeOn(d, c, profile, inst.capacity?.blackouts ?? []) })) });
  }
  return { days, profile };
}

/* ---------- S6: capacity by area, installer scorecards ---------- */
export async function capacityView(weeks = 6) {
  const { freeCrewDays } = await import("@dfrnt/engine");
  const today = todayAEST();
  const monday = addDays(today, -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7));
  const wk = Array.from({ length: weeks }, (_, i) => ({ from: addDays(monday, i * 7), to: addDays(monday, i * 7 + 6) }));
  const insts = await db()`select id, business_name, email, profile, capacity, is_test,
      array(select lower(r) || '-' || (upper(r) - 1) from unnest(postcode_ranges) r) ranges from installers where active and (not is_test or ${includeTest()})`;
  const areaOf = (pc: string | number) => `${String(pc).slice(0, 3)}x`;
  const supply: Record<string, number[]> = {}, booked: Record<string, number[]> = {}, coveredBy: Record<string, string[]> = {};
  const perInstaller: { id: string; name: string; live: boolean; free: number[] }[] = [];
  for (const r of insts as unknown as (InstallerRow & { ranges: string[] })[]) {
    const profile = profileOf(r);
    const crews = await liveCrews(r.id, profile, wk[0]!.from, wk[weeks - 1]!.to, false);
    let free: number[];
    if (crews.length) free = wk.map((w) => freeCrewDays(w.from > today ? w.from : addDays(today, 1), w.to, crews, profile, r.capacity?.blackouts ?? []));
    else {
      const per = r.capacity?.jobsPerDay ?? 1;
      const used = await db()`select install_date::text d, coalesce(job_days, 1)::float8 n from quotes where installer_id = ${r.id} and install_date is not null and not rebook and status = any(${BOOKED})`;
      free = wk.map((w) => { let n = 0; for (let d = w.from > today ? w.from : addDays(today, 1); d <= w.to; d = addDays(d, 1)) if (profile.workingDays.includes(new Date(`${d}T00:00:00Z`).getUTCDay())) n += per; return Math.max(0, n - used.filter((u) => (u.d as string) >= w.from && (u.d as string) <= w.to).reduce((a, u) => a + (u.n as number), 0)); });
    }
    perInstaller.push({ id: r.id, name: r.business_name, live: crews.length > 0, free });
    const areas = new Set<string>();
    for (const rg of r.ranges) { const [a, b] = rg.split("-").map(Number); for (let p = a!; p <= b!; p += 10) areas.add(areaOf(p)); areas.add(areaOf(b!)); }
    for (const a of areas) { supply[a] = (supply[a] ?? Array(weeks).fill(0)).map((v, i) => v + free[i]!); (coveredBy[a] ??= []).push(r.business_name); }
  }
  const bk = await db()`select postcode, install_date::text d, coalesce(job_days, 1)::float8 n from quotes where install_date >= ${wk[0]!.from} and install_date <= ${wk[weeks - 1]!.to} and not rebook and status = any(${BOOKED})`;
  for (const b of bk) { const i = wk.findIndex((w) => (b.d as string) >= w.from && (b.d as string) <= w.to); if (i >= 0) { const a = areaOf(b.postcode as string); { const arr = (booked[a] ??= Array(weeks).fill(0)); arr[i] = (arr[i] ?? 0) + (b.n as number); } } }
  const [rate] = await db()`select coalesce(count(*) filter (where signed_at is not null)::float8 / nullif(count(*) filter (where status <> 'saved'), 0), 0.3) r
    from quotes where created_at > now() - interval '60 days'`;
  const pipe = await db()`select postcode, count(*)::int n from quotes where status in ('secured','pricing_instant','pricing_installer','tech_review','priced','signed','payment_pending','payment_review')
    or (status = 'awaiting_date') or rebook group by 1`;
  const likely: Record<string, number> = {};
  for (const p of pipe) likely[areaOf(p.postcode as string)] = (likely[areaOf(p.postcode as string)] ?? 0) + (p.n as number);
  const areas = [...new Set([...Object.keys(supply), ...Object.keys(booked), ...Object.keys(likely)])].sort().map((a) => {
    const s4 = (supply[a] ?? []).slice(0, 4).reduce((x, y) => x + y, 0), b4 = (booked[a] ?? []).slice(0, 4).reduce((x, y) => x + y, 0);
    const l = Math.round((likely[a] ?? 0) * (rate!.r as number) * 10) / 10;
    const util = s4 + b4 ? (b4 + l) / (s4 + b4) : l ? 1 : 0;
    return { area: a, installers: coveredBy[a] ?? [], free: supply[a] ?? Array(weeks).fill(0), booked: booked[a] ?? Array(weeks).fill(0), likely: l, util, red: util > 0.85 || (!(coveredBy[a]?.length) && l > 0) };
  });
  return { weeks: wk, areas, perInstaller, signRate: rate!.r as number };
}

export async function scorecards() {
  return db()`select i.id, i.business_name, i.is_test,
      (select count(*)::int from installer_crews c where c.installer_id = i.id and c.active and (c.source = 'google' and c.status = 'connected')) connected,
      (select count(*)::int from installer_crews c where c.installer_id = i.id and c.active) crews,
      (select count(*)::int from quotes q where q.installer_id = i.id and q.booked_at > now() - interval '90 days') bookings,
      (select count(*)::int from date_moves m where m.installer_id = i.id and m.reason = 'declined' and m.created_at > now() - interval '90 days') declines,
      (select count(*)::int from date_moves m where m.installer_id = i.id and m.reason in ('rain','sick','parts') and m.created_at > now() - interval '90 days') moves,
      (select count(*)::int from quotes q where q.installer_id = i.id and q.status in ('installed','lodged','settled','complete')) installs,
      (select count(*)::int from reviews r where r.installer_id = i.id and r.status = 'published') reviews,
      (select round(avg(rating)::numeric, 1)::float8 from reviews r where r.installer_id = i.id and r.status = 'published') rating
    from installers i where i.active order by i.is_test, i.business_name`;
}
