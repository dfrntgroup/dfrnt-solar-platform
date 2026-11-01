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
    from quotes where status = 'saved' and customer_email is not null and created_at > now() - interval '30 days'`;
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
  // Formbay status for every linked job.
  try { out.formbay = (await runFormbaySync()) as never; } catch { /* reported on the job pages */ }
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
    where status = 'secured' and customer_email is not null and checkout_at is not null and design_fee_status is null and lock_until >= ${todayAEST()}`;
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
export async function runCutoff() {
  const followups = await runCheckoutFollowups();
  const dow = new Date(Date.now() + 10 * 3600_000).getUTCDay();
  if (dow === 0 || dow === 6) return { followups, reassigned: 0, to_ops: 0, weekend: true };
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
  return { followups, reassigned, to_ops: toOps };
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
      if (j.status === "installed" && ["pending_cer_approval", "cer_approved", "sold"].includes(r.status)) {
        await setStatus(j.id as string, "installed", "lodged", `Formbay status ${r.status}: submitted to the Clean Energy Regulator`);
        lodged++;
      }
    } catch { failed++; }
  }
  return { jobs: jobs.length, synced, lodged, failed };
}
