// Real-usage sizing (S1–S7): connect a meter through Fiskil, pull a year of reads, size by simple maths,
// replay the chosen system once on the customer's own tariff, and keep only the summary.
import { randomBytes } from "node:crypto";
import { db } from "@dfrnt/db";
import {
  configOptions, priceSystem, profileFromTotals, profileUsage, replay, sizeTargets, tariffFromPlan, toHalfHours, yieldFor,
  type CatalogueSystem, type ConfigInput, type DayRead, type Replay, type Tariff, type UsageProfile,
} from "@dfrnt/engine";
import { fiskilList, fiskilReady, fiskilSend } from "./fiskil";
import { getSetting, type EnergySettings } from "./settings";
import { pricingData, type FullData } from "./pricing-data";
import { configured } from "./configure";
import { todayAEST } from "./api";
import { siteUrl } from "./messages";

export interface EnergyLink {
  id: string; token: string; quote_id: string | null; source: string; email: string | null; name: string | null; postcode: string | null;
  phases: number; has_solar: boolean; roof_max_kw: number | null; fiskil_end_user_id: string | null; consent_id: string | null;
  status: "new" | "consenting" | "waiting" | "ready" | "fallback" | "failed" | "disconnected"; path: string | null; fail_reason: string | null;
  nmi: string | null; meter_type: string | null; state: string | null;
  profile: UsageProfile | null; tariff: Tariff | null; sizing: Sizing | null;
  last_pull_at: Date | null; ready_at: Date | null; consent_until: Date | null; revoke_status: string | null; created_at: Date;
}
export interface SystemPick { slug: string; title: string; brand: string; panels: number; modules: number; panel_kw: number; usable_kwh: number; price: number; url: string; replay: Omit<Replay, "monthly"> | null; payback_years: number | null }
export interface Sizing {
  built_at: string; city: string; yield: number;
  targets: ReturnType<typeof sizeTargets>; rec: SystemPick | null; up: SystemPick | null; tariff_source: "retailer" | "standard"; tariff_name?: string;
  monthly_after?: { month: number; imp_after: number }[];
}

export const energySettings = () => getSetting("energy");
/** Whether the "Use my real usage" button shows. Preview mode: only with ?usage=1 (testing on sandbox). */
export async function energyVisible(sp?: Record<string, string | undefined>) {
  if (!fiskilReady()) return false;
  const s = await energySettings();
  return s.mode === "all" || (s.mode === "preview" && sp?.usage === "1");
}

export async function linkByToken(token: string) {
  const [l] = await db()`select * from energy_links where token = ${token}`;
  return (l as unknown as EnergyLink) ?? null;
}
export async function linkForQuote(quoteId: string) {
  const [l] = await db()`select * from energy_links where quote_id = ${quoteId} and status <> 'disconnected' order by created_at desc limit 1`;
  return (l as unknown as EnergyLink) ?? null;
}

// ── S1: start the consent ─────────────────────────────────────────────────────────────────────────────────────
export async function startLink(a: { email: string; name?: string | null; phone?: string | null; postcode: string; phases: number; hasSolar: boolean; quoteId?: string | null; source: "estimate" | "record"; roofMaxKw?: number | null }): Promise<string> {
  if (!fiskilReady()) throw new Error("Real usage isn't switched on yet");
  const email = a.email.trim().toLowerCase();
  // Reuse the Fiskil end user if this email has connected before (Fiskil end users are per person).
  const [prev] = await db()`select fiskil_end_user_id from energy_links where email = ${email} and fiskil_end_user_id is not null order by created_at desc limit 1`;
  let endUser = (prev?.fiskil_end_user_id as string | undefined) ?? null;
  if (!endUser) {
    const phone = (a.phone ?? "").replace(/\D/g, "");
    const r = await fiskilSend("POST", "/end-users", { email, name: a.name || email, ...(phone.length >= 8 ? { phone } : {}) });
    endUser = (r.data?.end_user_id ?? r.data?.id) as string | undefined ?? null;
    if (!r.ok || !endUser) throw new Error(`Couldn't start the connection (${r.status}). Please try again, or use your bill instead.`);
  }
  const token = randomBytes(16).toString("hex");
  const [link] = await db()`insert into energy_links (token, quote_id, source, email, name, postcode, phases, has_solar, roof_max_kw, fiskil_end_user_id, status)
    values (${token}, ${a.quoteId ?? null}, ${a.source}, ${email}, ${a.name ?? null}, ${a.postcode}, ${a.phases === 3 ? 3 : 1}, ${a.hasSolar}, ${a.roofMaxKw ?? null}, null, 'consenting')
    returning id`;
  // fiskil_end_user_id is unique per link row only when first created; reused end users are kept on the newest link.
  await db()`update energy_links set fiskil_end_user_id = null where fiskil_end_user_id = ${endUser} and id <> ${link!.id}`;
  await db()`update energy_links set fiskil_end_user_id = ${endUser} where id = ${link!.id}`;
  const base = siteUrl();
  const s = await fiskilSend("POST", "/auth/session", { end_user_id: endUser, redirect_uri: `${base}/usage/${token}?back=1`, cancel_uri: `${base}/usage/${token}?cancelled=1` });
  const url = s.data?.auth_url as string | undefined;
  if (!s.ok || !url) {
    await db()`update energy_links set status = 'failed', fail_reason = ${`auth session ${s.status}: ${s.text}`} where id = ${link!.id}`;
    throw new Error("Couldn't open the consent screen. Please try again, or use your bill instead.");
  }
  if (a.quoteId) await db()`update quotes set energy_link_id = ${link!.id} where id = ${a.quoteId}`;
  return url.startsWith("http") ? url : `https://${url}`;
}

// ── Pull and build ────────────────────────────────────────────────────────────────────────────────────────────
type Raw = Record<string, any>;
const round3 = (xs: number[]) => xs.map((x) => Math.round(x * 1000) / 1000);

/** Turn Fiskil usage reads into days for one service point (the one with the most interval days). */
export function daysFromReads(reads: Raw[]): { sp: string | null; days: DayRead[]; totals: { from: string; to: string; kwh: number }[]; intervalMin: number | null } {
  const bySp = new Map<string, Set<string>>();
  for (const u of reads) if (u.read_u_type === "intervalRead" && /^E/.test(String(u.register_suffix ?? "")) && String(u.unit_of_measure ?? "KWH").toUpperCase() === "KWH") {
    const k = String(u.service_point_id); if (!bySp.has(k)) bySp.set(k, new Set()); bySp.get(k)!.add(String(u.read_start_date));
  }
  let sp = [...bySp.entries()].sort((a, b) => b[1].size - a[1].size)[0]?.[0] ?? null;
  if (!sp) sp = (reads.find((u) => u.read_u_type === "basicRead")?.service_point_id as string | undefined) ?? null;
  const map = new Map<string, DayRead>();
  const totals: { from: string; to: string; kwh: number }[] = [];
  let intervalMin: number | null = null;
  for (const u of reads) {
    if (String(u.service_point_id) !== sp) continue;
    if (String(u.unit_of_measure ?? "KWH").toUpperCase() !== "KWH") continue;          // skip kVArh registers
    const suffix = String(u.register_suffix ?? u.register_id ?? "");
    if (u.read_u_type === "basicRead") {
      if (/^E/.test(suffix)) totals.push({ from: String(u.read_start_date), to: String(u.read_end_date ?? u.read_start_date), kwh: Number(u.basic_read?.value) || 0 });
      continue;
    }
    const hh = toHalfHours((u.interval_read?.interval_reads ?? []) as number[]);
    if (hh.length !== 48) continue;
    intervalMin ??= Number(u.interval_read?.read_interval_length) || (1440 / ((u.interval_read?.interval_reads ?? []).length || 48));
    const date = String(u.read_start_date).slice(0, 10);
    const d = map.get(date) ?? { date, imp: new Array(48).fill(0), exp: new Array(48).fill(0), ctl: new Array(48).fill(0) };
    const add = (arr: number[]) => hh.forEach((v, i) => { arr[i] = (arr[i] ?? 0) + v; });
    if (/^B/.test(suffix)) add(d.exp!); else if (u.controlled_load) add(d.ctl!); else if (/^E/.test(suffix)) add(d.imp);
    map.set(date, d);
  }
  // Keep the latest 365 days.
  const days = [...map.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-365)
    .map((d) => ({ date: d.date, imp: round3(d.imp), exp: d.exp && d.exp.some((x) => x > 0) ? round3(d.exp) : undefined, ctl: d.ctl && d.ctl.some((x) => x > 0) ? round3(d.ctl) : undefined }));
  return { sp, days, totals, intervalMin };
}

function baseInput(s: CatalogueSystem, postcode: string, data: FullData): ConfigInput {
  return { backup: "none", roofType: "tin", storeys: 1, tilt: false, batteryLocation: "other", vehicleExposure: false, postcode, installDate: todayAEST(), ...s.config } as ConfigInput;
}
const TIER_RANK: Record<string, number> = { core: 0, value: 1, brand: 2, premium: 3 };

/** S2: the configurator builds the system nearest the targets; the chosen one and one size up are replayed once. */
export async function recommend(l: Pick<EnergyLink, "postcode" | "phases" | "has_solar" | "roof_max_kw">, profile: Pick<UsageProfile, "daily_kwh" | "night_kwh" | "daily_export_kwh">, days: DayRead[], tariff: Tariff, settings?: EnergySettings): Promise<Sizing> {
  const set = settings ?? await energySettings();
  const postcode = l.postcode ?? "4551";
  const loc = yieldFor(postcode, set.yields);
  const roof = l.roof_max_kw != null ? Number(l.roof_max_kw) : null;
  const targets = sizeTargets(profile, { yield: loc.kwh_per_kw, hasSolar: l.has_solar, roofMaxKw: roof });
  const data = await pricingData();
  const kind = l.has_solar ? "battery_only" : "solar_battery";
  const pool = data.catalogue.systems.filter((s) => s.kind === kind && s.config.phases === (l.phases === 3 ? 3 : 1));
  const seen = new Set<string>();
  type Cand = { s: CatalogueSystem; panels: number; modules: number; kw: number; kwh: number; price: number; score: number; opts: { panels: number[]; modules: number[]; moduleKwh: number; panelW: number } };
  const cands: Cand[] = [];
  const build = (base: CatalogueSystem, panels: number, modules: number) => {
    const s = configured(base, { panels, modules, backup: "none" }, postcode, data);
    const q = priceSystem(s, { postcode, asOf: todayAEST() }, data);
    return q.config.ok ? { q, kw: q.config.panel_kw, kwh: q.config.usable_kwh, price: q.stack.amount_payable } : null;
  };
  for (const base of pool) {
    if (seen.has(base.config.familyKey)) continue;           // one per brand family; counts are what change
    seen.add(base.config.familyKey);
    const o = configOptions(baseInput(base, postcode, data), data.rules);
    const wantPanels = targets.panel_kw * 1000 / o.panelW;
    const panelList = l.has_solar ? [0] : o.panels.filter((n) => !roof || n * o.panelW / 1000 <= roof + 0.25);
    if (!panelList.length || !o.modules.length) continue;
    const panels = l.has_solar ? 0 : panelList.reduce((b, n) => Math.abs(n - wantPanels) < Math.abs(b - wantPanels) ? n : b, panelList[0]!);
    const modules = o.modules.reduce((b, m) => { const d = Math.abs(m * o.moduleKwh - targets.battery_kwh), e = Math.abs(b * o.moduleKwh - targets.battery_kwh); return d < e || (d === e && m > b) ? m : b; }, o.modules[0]!);
    const r = build(base, panels, modules);
    if (!r) continue;
    const score = Math.abs(r.kw - targets.panel_kw) * 1.5 + Math.abs(r.kwh - targets.battery_kwh) + (TIER_RANK[base.tier] ?? 2) * 0.75;
    cands.push({ s: base, panels, modules, kw: r.kw, kwh: r.kwh, price: r.price, score, opts: o });
  }
  cands.sort((a, b) => a.score - b.score || a.price - b.price);
  const best = cands[0];
  const pick = (c: Cand | undefined, panels?: number, modules?: number): SystemPick | null => {
    if (!c) return null;
    const p = panels ?? c.panels, m = modules ?? c.modules;
    const r = panels == null && modules == null ? { kw: c.kw, kwh: c.kwh, price: c.price } : build(c.s, p, m);
    if (!r) return null;
    const rp = days.length ? replay(days, { panel_kw: r.kw, battery_kwh: r.kwh }, tariff, loc) : null;
    const { monthly: _m, ...rest } = rp ?? { monthly: [] };
    void _m;
    return { slug: c.s.slug, title: `${r.kw ? `${Math.round(r.kw * 10) / 10} kW solar + ` : ""}${Math.round(r.kwh * 10) / 10} kWh battery`, brand: c.s.brand, panels: p, modules: m,
      panel_kw: r.kw, usable_kwh: r.kwh, price: r.price, url: `/systems/${c.s.slug}?postcode=${postcode}&panels=${p}&modules=${m}`,
      replay: rp ? (rest as Omit<Replay, "monthly">) : null, payback_years: rp && rp.saving > 0 ? Math.round((r.price / rp.saving) * 10) / 10 : null };
  };
  const rec = pick(best);
  let up: SystemPick | null = null;
  if (best && rec) {
    const nextM = best.opts.modules.find((m) => m * best.opts.moduleKwh >= best.kwh + 3);
    const roomForPanels = !l.has_solar && !targets.capped_by_roof && best.opts.panels.find((n) => n * best.opts.panelW / 1000 >= best.kw + 2 && (!roof || n * best.opts.panelW / 1000 <= roof + 0.25));
    if (nextM) up = pick(best, best.panels, nextM);
    else if (roomForPanels) up = pick(best, roomForPanels, best.modules);
  }
  const monthly_after = best && days.length ? (() => {
    const rp = replay(days, { panel_kw: best.kw, battery_kwh: best.kwh }, tariff, loc);
    return rp.monthly.map((x) => ({ month: Number(x.ym.slice(5, 7)) - 1, imp_after: x.imp_after }));
  })() : undefined;
  return { built_at: new Date().toISOString(), city: loc.city, yield: loc.kwh_per_kw, targets, rec, up, tariff_source: tariff.source, tariff_name: tariff.name, monthly_after };
}

/** Pull everything for a link and (re)build. Safe to call often: throttled to once every 15 s unless forced. */
export async function pullLink(id: string, opts: { force?: boolean; monthlyOnly?: boolean } = {}): Promise<EnergyLink | null> {
  const [l0] = await db()`update energy_links set last_pull_at = now(), updated_at = now()
    where id = ${id} and fiskil_end_user_id is not null and status not in ('disconnected')
      and (${!!opts.force} or last_pull_at is null or last_pull_at < now() - interval '15 seconds') returning *`;
  const l = l0 as unknown as EnergyLink | undefined;
  if (!l) return null;
  const set = await energySettings();
  const age = (Date.now() - new Date(l.created_at).getTime()) / 60000;
  try {
    const usage = await fiskilList<Raw>("/energy/usage", { end_user_id: l.fiskil_end_user_id!, "page[size]": "1000" }, "usage", 60);
    if (usage.error && !usage.items.length) {
      if (usage.status === 403 || usage.status === 404) { if (age > 20) await markFallback(l.id, `Usage not available (${usage.status})`); return l; }
      throw new Error(`usage ${usage.status}: ${usage.error}`);
    }
    if (!usage.items.length) {
      if (age > 20) await markFallback(l.id, "Retailer sent no usage");
      else await db()`update energy_links set status = 'waiting' where id = ${l.id} and status in ('new','consenting')`;
      return l;
    }
    const { sp, days, totals, intervalMin } = daysFromReads(usage.items);
    if (opts.monthlyOnly) { await saveMonthly(l.id, days, set); return l; }
    const [sps, accts] = await Promise.all([
      fiskilList<Raw>("/energy/service-points", { end_user_id: l.fiskil_end_user_id! }, "service_points", 3).catch(() => ({ items: [] as Raw[] })),
      fiskilList<Raw>("/energy/accounts", { end_user_id: l.fiskil_end_user_id! }, "accounts", 3).catch(() => ({ items: [] as Raw[] })),
    ]);
    const spRow = sps.items.find((x) => x.service_point_id === sp) ?? null;
    const nmi = (spRow?.national_metering_id as string | undefined) ?? null;
    const meter = (spRow?.meters?.[0]?.specifications?.installation_type as string | undefined) ?? (days.length ? `interval ${intervalMin ?? 30} min` : "basic");
    const state = (spRow?.jurisdiction_code as string | undefined) ?? null;
    const postcode = (spRow?.location?.paf?.postcode ?? spRow?.location?.simple?.postcode) as string | undefined;
    const plan = accts.items.flatMap((a) => (a.plans ?? []) as Raw[]).find((p) => ((p.service_point_ids ?? []) as string[]).includes(String(sp))) ?? accts.items[0]?.plans?.[0];
    const tariff = tariffFromPlan(plan?.plan_detail?.electricity_contract ?? null, set.standard, plan?.plan_overview?.display_name);
    const loc = yieldFor(l.postcode ?? postcode, set.yields);
    let profile: UsageProfile | null = null, path: "interval" | "totals" = "interval", sizing: Sizing;
    const linkForSizing = { ...l, postcode: l.postcode ?? postcode ?? null };
    if (days.length < 7 && !totals.length && age < 20) {           // sync still filling in: wait for the next event
      await db()`update energy_links set status = 'waiting' where id = ${l.id} and status in ('new','consenting','fallback')`;
      return l;
    }
    if (days.length >= 7) {
      profile = profileUsage(days, loc);
      sizing = await recommend(linkForSizing, profile!, days, tariff, set);
    } else {
      const t = profileFromTotals(totals);
      if (!t) { await markFallback(l.id, days.length ? `Only ${days.length} days of interval data` : "No usable reads"); return l; }
      path = "totals";
      // Basic meter: no timing, so the evening share is the bill-estimate default (60 %).
      sizing = await recommend(linkForSizing, { daily_kwh: t.daily_kwh, night_kwh: Math.round(t.daily_kwh * 0.6 * 10) / 10, daily_export_kwh: 0 }, [], tariff, set);
    }
    await db()`update energy_links set status = 'ready', path = ${path}, fail_reason = null, nmi = ${nmi}, meter_type = ${meter}, state = ${state},
      postcode = coalesce(postcode, ${postcode ?? null}), profile = ${profile ? db().json(profile as never) : null}, tariff = ${db().json(tariff as never)}, sizing = ${db().json(sizing as never)},
      ready_at = coalesce(ready_at, now()), consent_until = coalesce(consent_until, now() + interval '12 months') where id = ${l.id}`;
    if (days.length) {
      await db()`insert into energy_raw (link_id, days, purge_after) values (${l.id}, ${db().json(days as never)}, now() + make_interval(days => ${set.raw_days}))
        on conflict (link_id) do update set days = excluded.days, pulled_at = now(), purge_after = excluded.purge_after`;
      await saveMonthly(l.id, days, set);
    }
    if (l.quote_id && nmi) await db()`update quotes set site_draft = coalesce(site_draft, '{}'::jsonb) || jsonb_build_object('nmi', ${nmi}::text) where id = ${l.quote_id} and coalesce(site_draft->>'nmi', '') = ''`;
    return (await linkByToken(l.token));
  } catch (e) {
    await db()`update energy_links set fail_reason = ${String(e).slice(0, 300)} where id = ${l.id}`;
    if (age > 30 && l.status !== "ready") await markFallback(l.id, String(e).slice(0, 200));
    return l;
  }
}

async function saveMonthly(id: string, days: DayRead[], _set: EnergySettings) {
  const m = new Map<string, { i: number; e: number }>();
  for (const d of days) { const k = d.date.slice(0, 7), r = m.get(k) ?? { i: 0, e: 0 }; r.i += d.imp.reduce((s, x) => s + x, 0); r.e += (d.exp ?? []).reduce((s, x) => s + x, 0); m.set(k, r); }
  for (const [ym, v] of m) await db()`insert into energy_monthly (link_id, ym, import_kwh, export_kwh) values (${id}, ${ym}, ${Math.round(v.i * 10) / 10}, ${Math.round(v.e * 10) / 10})
    on conflict (link_id, ym) do update set import_kwh = excluded.import_kwh, export_kwh = excluded.export_kwh`;
}

async function markFallback(id: string, reason: string) {
  await db()`update energy_links set status = 'fallback', path = 'bill', fail_reason = ${reason} where id = ${id} and status <> 'ready'`;
}

/** S5: customer disconnects. Revoke with Fiskil, then delete everything derived from their data. */
export async function disconnect(id: string) {
  const [l] = await db()`select consent_id, fiskil_end_user_id from energy_links where id = ${id}`;
  let revoke = "manual";
  if (l?.consent_id) { try { const r = await fiskilSend("DELETE", `/consents/${l.consent_id}`); if (r.ok) revoke = "revoked"; } catch { /* manual */ } }
  await db()`delete from energy_raw where link_id = ${id}`;
  await db()`delete from energy_monthly where link_id = ${id}`;
  await db()`update energy_links set status = 'disconnected', profile = null, tariff = null, sizing = null, nmi = null, revoke_status = ${revoke}, updated_at = now() where id = ${id}`;
}
/** Fiskil told us the consent ended (revoked at the retailer, or expired): stop and delete the raw data; keep the before/after only if it expired. */
export async function consentEnded(endUserId: string, revoked: boolean) {
  const [l] = await db()`select id from energy_links where fiskil_end_user_id = ${endUserId}`;
  if (!l) return;
  if (revoked) { await db()`delete from energy_raw where link_id = ${l.id}`; await db()`delete from energy_monthly where link_id = ${l.id}`;
    await db()`update energy_links set status = 'disconnected', profile = null, tariff = null, sizing = null, nmi = null, revoke_status = 'revoked' where id = ${l.id}`; }
  else await db()`update energy_links set consent_until = least(coalesce(consent_until, now()), now()) where id = ${l.id}`;
}

// ── Timers (S5 purge, S6 after-install check, S7 stuck consents) ──────────────────────────────────────────────
export async function runEnergy() {
  const out: Record<string, number> = {};
  out.purged = (await db()`delete from energy_raw where purge_after < now() returning link_id`).length;
  const stuck = await db()`update energy_links set status = 'fallback', path = 'bill', fail_reason = coalesce(fail_reason, 'Consent not finished')
    where status in ('new','consenting') and created_at < now() - interval '1 day' returning id`;
  out.unfinished = stuck.length;
  if (!fiskilReady()) return out;
  // Waiting links: try again (covers a missed webhook).
  const waiting = await db()`select id from energy_links where status = 'waiting' limit 20`;
  for (const w of waiting) await pullLink(w.id as string, { force: true });
  out.retried = waiting.length;
  // S6: installed jobs with a live consent: refresh monthly import every ~4 weeks and flag big misses.
  const live = await db()`select l.id, l.sizing, q.id quote_id, q.commissioned_on::text commissioned, q.title, q.customer_name, q.energy_alert
    from energy_links l join quotes q on q.id = l.quote_id
    where l.status = 'ready' and q.commissioned_on is not null and coalesce(l.consent_until, now()) > now()
      and (l.last_pull_at is null or l.last_pull_at < now() - interval '25 days') limit 50`;
  let flagged = 0;
  for (const j of live) {
    await pullLink(j.id as string, { force: true, monthlyOnly: true });
    const s = j.sizing as Sizing | null;
    if (!s?.monthly_after?.length) continue;
    const rows = await db()`select ym, import_kwh::float8 imp from energy_monthly where link_id = ${j.id} and ym > ${String(j.commissioned).slice(0, 7)} order by ym desc limit 1`;
    const last = rows[0];
    if (!last) continue;
    const thisMonth = new Date(Date.now() + 10 * 3600_000).toISOString().slice(0, 7);
    if (last.ym === thisMonth) continue;                                    // only full months
    const exp = s.monthly_after.find((m) => m.month === Number(String(last.ym).slice(5, 7)) - 1)?.imp_after;
    const prev = (j.energy_alert as { ym?: string } | null)?.ym;
    if (exp != null && last.imp > exp * 1.4 && last.imp - exp > 100 && prev !== last.ym) {
      await db()`update quotes set energy_alert = ${db().json({ ym: last.ym, expected: exp, actual: Math.round(last.imp), raised_at: new Date().toISOString() })} where id = ${j.quote_id}`;
      await db()`insert into tickets (quote_id, kind, subject, body) values (${j.quote_id}, 'fault', ${`Grid use higher than expected: ${j.customer_name ?? j.title}`},
        ${`In ${last.ym} the home drew ${Math.round(last.imp)} kWh from the grid; we estimated about ${exp} kWh with the new system. Check the battery and inverter (tripped battery, failed string, export setting) before the customer notices.`})`;
      flagged++;
    }
  }
  out.after_install_checked = live.length; out.flagged = flagged;
  return out;
}

export function webhookEventKind(event: string): "sync" | "revoked" | "expired" | "other" {
  if (/sync\.completed$/.test(event)) return "sync";
  if (/consent.*(revok|withdraw)/i.test(event)) return "revoked";
  if (/consent.*expir/i.test(event)) return "expired";
  return "other";
}
