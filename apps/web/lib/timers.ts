// Timers (7.2/7.3): run daily at 7 am and at the 5 pm pricing cut-off (Brisbane). Every change is audited as the system.
import { db, write } from "@dfrnt/db";
import { todayAEST } from "./api";
import { queueMessage } from "./messages";
import { SYSTEM } from "./jobs";
import { rebateWindow } from "@dfrnt/engine";
import { pricingData } from "./pricing-data";
import { longDate } from "./site";

async function setStatus(id: string, from: string, to: string, why: string, extra: Record<string, unknown> = {}) {
  await write({ actor: SYSTEM, action: "timers.transition", rationale: why }, { id, from, to }, async (tx) => {
    const [r] = await tx`update quotes set ${tx({ status: to, updated_at: new Date(), ...extra } as never)} where id = ${id} and status = ${from} returning id`;
    return { entity: "quote", entityId: id, event: `quote.${to}`, result: { changed: !!r } };
  });
}

export async function runDaily() {
  const today = todayAEST();
  const out: Record<string, number> = {};
  // Price locks: secured or priced quotes past their lock lapse (the lock is held while we're pricing).
  const lapsed = await db()`select id, status from quotes where status in ('secured','priced') and lock_until < ${today}`;
  for (const q of lapsed) await setStatus(q.id as string, q.status as string, "lapsed", "Price lock expired");
  out.lapsed = lapsed.length;
  // Saved quotes close after 90 days.
  const expired = await db()`select id from quotes where status = 'saved' and created_at < now() - interval '90 days'`;
  for (const q of expired) await setStatus(q.id as string, "saved", "expired", "Saved quote older than 90 days");
  out.expired = expired.length;
  // Bank transfer: reminders on day 3 and day 6, released on day 7.
  const pending = await db()`select id, token, customer_email, customer_name, payment_reference, amount_payable::float8 amount, reminders,
    extract(day from now() - updated_at)::int age from quotes where status = 'payment_pending'`;
  let reminded = 0, released = 0;
  for (const q of pending) {
    const r = (q.reminders ?? {}) as Record<string, string>;
    if (q.age >= 7) { await setStatus(q.id as string, "payment_pending", "signed", "Bank transfer not received in 7 days; released"); released++; continue; }
    for (const day of [3, 6]) if (q.age >= day && !r[`bank_${day}`]) {
      await queueMessage("PAY", q.token as string, q.customer_email as string, { name: q.customer_name as string, amount: q.amount, reference: q.payment_reference as string });
      await db()`update quotes set reminders = reminders || ${db().json({ [`bank_${day}`]: today })} where id = ${q.id}`;
      reminded++;
    }
  }
  out.bank_reminders = reminded; out.bank_released = released;
  // 48 h date hold after payment.
  const holds = await db()`update quotes set slot_hold_until = null where status = 'awaiting_date' and slot_hold_until < now() returning id`;
  out.holds_released = holds.length;
  // M5: the day before install.
  const tomorrow = new Date(Date.now() + 34 * 3600_000).toISOString().slice(0, 10);
  const dayBefore = await db()`select id, token, customer_email, customer_name, reminders from quotes
    where install_date = ${tomorrow} and status in ('booked','gear_ordered','delivered') and not (reminders ? 'm5')`;
  for (const q of dayBefore) {
    await queueMessage("M5", q.token as string, q.customer_email as string, { name: q.customer_name as string });
    await db()`update quotes set reminders = reminders || '{"m5":true}' where id = ${q.id}`;
  }
  out.day_before = dayBefore.length;
  // M11: two gentle follow-ups for saved prices (day 2 and day 10), then nothing.
  const { rebates } = await pricingData();
  const w = rebateWindow(today, rebates);
  const saved = await db()`select id, token, customer_email, customer_name, amount_payable::float8 amount, reminders, extract(day from now() - created_at)::int age
    from quotes where status = 'saved' and customer_email is not null and created_at > now() - interval '30 days'
      and not exists (select 1 from marketing_optout o where o.email = lower(quotes.customer_email))`;
  let nudged = 0;
  for (const q of saved) {
    const r = (q.reminders ?? {}) as Record<string, unknown>;
    const due = [2, 10].find((d) => q.age >= d && !r[`m11_${d}`]);
    if (!due) continue;
    await queueMessage("M11", q.token as string, q.customer_email as string, { name: q.customer_name as string, amount: q.amount, drop: w.window_end ? longDate(w.window_end) : "" });
    await db()`update quotes set reminders = reminders || ${db().json({ [`m11_${due}`]: today })} where id = ${q.id}`;
    nudged++;
  }
  out.saved_followups = nudged;
  // M10: ask for a review once, after the install is lodged (a few days after switch-on).
  const ask = await db()`select q.id, q.token, q.customer_email, q.customer_name from quotes q
    where q.status in ('lodged','settled','complete') and not (q.reminders ? 'm10') and not exists (select 1 from reviews r where r.quote_id = q.id)`;
  for (const q of ask) {
    await queueMessage("M10", q.token as string, q.customer_email as string, { name: q.customer_name as string });
    await db()`update quotes set reminders = reminders || '{"m10":true}' where id = ${q.id}`;
  }
  out.review_requests = ask.length;
  // C5: checkout follow-ups for anyone who stopped partway.
  out.checkout_followups = await runCheckoutFollowups();
  // R1: service plan: first-year bill once installed, renewal reminders 30 days out, lapse 30 days after.
  const plans = await db()`select m.id, m.status, m.price::float8 price, m.reference, m.renews_on::text renews_on, q.token, q.customer_email, q.customer_name, q.status qs, q.reminders
    from memberships m join quotes q on q.id = m.quote_id where m.status in ('pending','active')`;
  let planMsgs = 0;
  for (const m of plans) {
    const r = (m.reminders ?? {}) as Record<string, unknown>;
    if (m.status === "pending" && ["installed", "lodged", "settled", "complete"].includes(m.qs as string) && !r.plan_first) {
      await queueMessage("M25", m.token as string, m.customer_email as string, { name: m.customer_name as string, amount: `$${m.price}`, reference: m.reference as string });
      await db()`update quotes set reminders = reminders || '{"plan_first":true}' where token = ${m.token}`; planMsgs++;
    }
    if (m.status === "active" && m.renews_on) {
      const days = (Date.parse(`${m.renews_on}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400_000;
      const k = `plan_${m.renews_on}`;
      if (days <= 30 && days > 0 && !r[k]) {
        await queueMessage("M25", m.token as string, m.customer_email as string, { name: m.customer_name as string, renewal: true, date: longDate(m.renews_on as string), amount: `$${m.price}`, reference: m.reference as string });
        await db()`update quotes set reminders = reminders || ${db().json({ [k]: true })} where token = ${m.token}`; planMsgs++;
      }
      if (days < -30) await db()`update memberships set status = 'lapsed' where id = ${m.id}`;
    }
  }
  out.service_plan = planMsgs;
  // B1: Xero.
  try { const { syncXero } = await import("./xero"); out.xero = (await syncXero()) as never; } catch { /* shown in Ops → Xero */ }
  // G4: waitlist alerts where an installer now covers the postcode.
  try { const { notifyWaitlist } = await import("./campaigns"); out.waitlist_alerts = await notifyWaitlist(); } catch { /* reported in messages */ }
  // Formbay status for every linked job.
  try { out.formbay = (await runFormbaySync()) as never; } catch { /* reported on the job pages */ }
  try { const { runEnergy } = await import("./energy"); out.energy = (await runEnergy()) as never; } catch { /* shown in Ops → Real usage */ }
  // Agent proposals expire after 24 h.
  const exp = await db()`update approvals set status = 'expired', decided_at = now(), decision_note = 'Expired after 24 h'
    where status = 'pending' and created_at < now() - interval '24 hours' returning id`;
  out.proposals_expired = exp.length;
  return out;
}

/** C5: someone gave their details but stopped before the photos: a nudge the same day (after 2 hours) and two days later. */
export async function runCheckoutFollowups() {
  const rows = await db()`select id, token, customer_email, customer_name, amount_payable::float8 amount, lock_until::text lock_until, reminders, site_draft is not null has_home,
      extract(epoch from now() - checkout_at)::int / 3600 hours from quotes
    where status = 'secured' and customer_email is not null and checkout_at is not null and design_fee_status is null and lock_until >= ${todayAEST()}
      and not exists (select 1 from marketing_optout o where o.email = lower(quotes.customer_email))`;
  const { SELLER } = await import("./legal");
  let sent = 0;
  for (const q of rows) {
    const r = (q.reminders ?? {}) as Record<string, unknown>;
    const h = q.hours as number;
    const due = h >= 48 && h < 240 && !r.co_2 ? "co_2" : h >= 2 && h < 30 && !r.co_0 ? "co_0" : null;
    if (!due) continue;
    await queueMessage("M13", q.token as string, q.customer_email as string, { name: String(q.customer_name ?? "").split(" ")[0] || null, amount: q.amount,
      until: longDate(q.lock_until as string), left: q.has_home ? "four photos" : "two short steps", phone: SELLER.phone, second: due === "co_2" });
    await db()`update quotes set reminders = reminders || ${db().json({ [due]: todayAEST(), ...(due === "co_2" ? { co_0: String(r.co_0 ?? "skipped") } : {}) } as never)} where id = ${q.id}`;
    sent++;
  }
  return sent;
}

/** 5 pm: jobs still waiting for an installer's price go to the next installer for the postcode; none → ops tech review. */
/** Scheduling S5: the evening job sheet for tomorrow's installs, to each installer. */
export async function runJobSheets() {
  const tomorrow = new Date(Date.now() + 34 * 3600_000).toISOString().slice(0, 10);
  const jobs = await db()`select q.id, q.token, q.title, q.customer_name, q.customer_phone, q.site, q.access_notes, q.install_part, q.job_days::float8 days, q.snapshot, q.reminders,
      i.business_name, i.email from quotes q join installers i on i.id = q.installer_id
    where q.install_date = ${tomorrow} and not q.rebook and q.status in ('booked','gear_ordered','delivered') and not (q.reminders ? 'sheet')`;
  const { siteUrl } = await import("./messages");
  for (const j of jobs) {
    const a = (j.site as { address?: { unit?: string; line1: string; suburb: string; postcode: string } } | null)?.address;
    const place = a ? `${a.unit ? `${a.unit}/` : ""}${a.line1}, ${a.suburb} ${a.postcode}` : "";
    const parts = ((j.snapshot as { config?: { bom?: { description: string; qty: number; included?: boolean }[] } } | null)?.config?.bom ?? []).filter((b) => !b.included).map((b) => `• ${b.qty} × ${b.description}`).join("\n");
    const sheet = [`Tomorrow${j.install_part === "am" ? " morning" : ""}: ${j.title}`, ``, `Customer: ${j.customer_name ?? ""}  ${j.customer_phone ?? ""}`, `Address: ${place}`,
      `Map: https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`, `Length: ${j.days ?? 1} crew-day(s), arrive 7–8 am`, ``,
      `Access: ${j.access_notes ?? "nothing noted"}`, ``, `Parts:`, parts, ``, `Photos, messages and the job: ${siteUrl()}/installer/job/${j.id}`].join("\n");
    if (j.email) await queueMessage("I4", j.token as string, j.email as string, { title: `${j.title} · ${a?.suburb ?? ""}`, sheet });
    await db()`update quotes set reminders = reminders || '{"sheet":true}' where id = ${j.id}`;
  }
  await db()`update date_offers set status = 'expired' where kind = 'earlier' and status = 'open' and expires_at < now()`;
  return jobs.length;
}

export async function runCutoff() {
  const followups = await runCheckoutFollowups();
  const sheets = await runJobSheets();
  const dow = new Date(Date.now() + 10 * 3600_000).getUTCDay();
  if (dow === 0 || dow === 6) return { followups, sheets, reassigned: 0, to_ops: 0, weekend: true };
  const waiting = await db()`select id, installer_id, postcode, pricing_reasons from quotes
    where status = 'pricing_installer' and updated_at < now() - interval '1 hour'`;
  let reassigned = 0, toOps = 0;
  for (const q of waiting) {
    const pc = parseInt(q.postcode as string, 10);
    const [next] = await db()`select id from installers where active and id <> ${q.installer_id} and exists (select 1 from unnest(postcode_ranges) r where r @> ${pc}::int) order by is_test, created_at limit 1`;
    if (next) {
      await write({ actor: SYSTEM, action: "timers.reassign", rationale: "5 pm cut-off missed" }, { id: q.id }, async (tx) => {
        await tx`update quotes set installer_id = ${next.id}, updated_at = now() where id = ${q.id}`;
        return { entity: "quote", entityId: q.id as string, event: "quote.reassigned", result: { installer: next.id } };
      });
      reassigned++;
    } else {
      await setStatus(q.id as string, "pricing_installer", "tech_review", "5 pm cut-off missed and no other installer covers this postcode");
      toOps++;
    }
  }
  return { followups, sheets, reassigned, to_ops: toOps };
}

/** Formbay has no webhooks: poll every linked job that isn't finished, store its status, and move installed jobs to lodged
 *  once Formbay has submitted them to the Clean Energy Regulator. */
export async function runFormbaySync() {
  const { formbayConfigured } = await import("./formbay");
  if (!formbayConfigured()) return { skipped: "not configured" };
  const { formbayJobStatus } = await import("./formbay-job");
  const jobs = await db()`select id, status, coalesce(formbay_bstc_id, formbay_formid) fid from quotes
    where coalesce(formbay_bstc_id, formbay_formid) is not null and status not in ('settled','complete','cancelled') limit 50`;
  let synced = 0, lodged = 0, failed = 0;
  for (const j of jobs) {
    try {
      const r = await formbayJobStatus(j.fid as string);
      if (r.http !== 200 || !r.status) { failed++; continue; }
      await db()`update quotes set formbay_status = ${r.status}, formbay_complete = ${r.complete}, formbay_synced_at = now() where id = ${j.id}`;
      synced++;
      if (["pending_cer_approval", "cer_approved", "sold"].includes(r.status)) {
        const { pullFormbayRecord } = await import("./record");
        await pullFormbayRecord(j.id as string).catch(() => null);
      }
      if (j.status === "installed" && ["pending_cer_approval", "cer_approved", "sold"].includes(r.status)) {
        await setStatus(j.id as string, "installed", "lodged", `Formbay status ${r.status}: submitted to the Clean Energy Regulator`);
        lodged++;
      }
    } catch { failed++; }
  }
  return { jobs: jobs.length, synced, lodged, failed };
}
