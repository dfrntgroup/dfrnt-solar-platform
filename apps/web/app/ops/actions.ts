"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, write } from "@dfrnt/db";
import type { JobState } from "@dfrnt/engine";
import { requireStaff } from "@/lib/auth";
import { advance, cancel, getQuoteById, installerPrice, markPaid, raiseVariation } from "@/lib/jobs";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
/** Ticked extras, with a quantity for per-metre / per-km items ("CODE:qty"). */
const extraCodes = (f: FormData) => f.getAll("codes").map(String).map((c) => { const q = s(f, `qty_${c}`); return q ? `${c}:${q}` : c; });
async function run(path: string, fn: () => Promise<unknown>) {
  try { await fn(); } catch (e) { if ((e as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw e; redirect(`${path}?error=${encodeURIComponent((e as Error).message)}`); }
  revalidatePath(path); redirect(path);
}

export async function opsMarkPaid(f: FormData) {
  const me = await requireStaff(); const id = s(f, "id");
  await run(`/ops/job/${id}`, async () => markPaid((await getQuoteById(id))!, me.actor));
}
export async function opsAdvance(f: FormData) {
  const me = await requireStaff(); const id = s(f, "id");
  await run(`/ops/job/${id}`, async () => {
    const reason = s(f, "reason"); if (!reason) throw new Error("Give a reason: every manual change is audited");
    await advance((await getQuoteById(id))!, s(f, "to") as JobState, me.actor, reason);
  });
}
export async function opsPrice(f: FormData) {
  const me = await requireStaff(); const id = s(f, "id");
  await run(`/ops/job/${id}`, async () => installerPrice((await getQuoteById(id))!, me.actor, extraCodes(f), s(f, "note")));
}
export async function opsVariation(f: FormData) {
  const me = await requireStaff(); const id = s(f, "id");
  await run(`/ops/job/${id}`, async () => raiseVariation((await getQuoteById(id))!, me.actor, s(f, "code"), s(f, "description"), s(f, "cost") ? Number(s(f, "cost")) : undefined));
}
export async function opsCancel(f: FormData) {
  const me = await requireStaff(); const id = s(f, "id");
  await run(`/ops/job/${id}`, async () => cancel((await getQuoteById(id))!, me.actor, s(f, "reason") || "Cancelled by ops"));
}
export async function ledgerApprove(f: FormData) {
  const me = await requireStaff();
  await run("/ops/ledger", async () => {
    const ids = f.getAll("ids").map(String); if (!ids.length) throw new Error("Tick at least one line");
    const to = s(f, "to") === "paid" ? "paid" : "approved";
    await write({ actor: me.actor, action: `ledger.${to}` }, { ids }, async (tx) => {
      await tx`update pay_ledger set status = ${to}, paid_at = ${to === "paid" ? new Date() : null} where id = any(${ids}) and status = ${to === "paid" ? "approved" : "eligible"}`;
      return { entity: "pay_ledger", entityId: ids.join(","), event: `ledger.${to}`, result: { count: ids.length } };
    });
    if (to === "paid") {
      const { completeIfSettled } = await import("@/lib/ops");
      const qs = await db()`select distinct quote_id from pay_ledger where id = any(${ids})`;
      for (const r of qs) await completeIfSettled(r.quote_id as string, me.actor);
    }
  });
}
export async function approveProposal(f: FormData) { await decideApproval(f, true); }
export async function rejectProposal(f: FormData) { await decideApproval(f, false); }
async function decideApproval(f: FormData, approve: boolean) {
  const me = await requireStaff();
  await run("/ops/approvals", async () => {
    const id = s(f, "id");
    const { executeProposal } = await import("@/lib/agents");
    const edited: Record<string, string> = {};
    for (const [k, v] of f.entries()) if (k.startsWith("edit_")) edited[k.slice(5)] = String(v).trim();
    await executeProposal(id, approve, me.id, s(f, "note"), Object.keys(edited).length ? edited : undefined);
  });
}
export async function saveInstaller(f: FormData) {
  const me = await requireStaff(); const id = s(f, "id");
  await run("/ops/installers", async () => {
    const num = (k: string, d: number) => (s(f, k) ? Number(s(f, k)) : d);
    const capacity = { jobsPerDay: num("jobsPerDay", 1), leadDays: num("leadDays", 3), workingDays: f.getAll("workingDays").map(Number), blackouts: s(f, "blackouts").split(/[\s,]+/).filter(Boolean) };
    const ranges = s(f, "ranges").split(/[\s,]+/).filter(Boolean).map((r) => r.split("-").map(Number));
    if (f.get("active") === "on") {
      const [i] = await db()`select abn, licence_no, saa_accreditation, insurance_expiry::text ins, is_test from installers where id = ${id}`;
      if (!i!.is_test && (!i!.abn || !i!.licence_no || !i!.saa_accreditation || !i!.ins || (i!.ins as string) < new Date().toISOString().slice(0, 10))) throw new Error("Can't activate: ABN, electrical licence, SAA accreditation and current insurance must be on the installer's profile");
    }
    await write({ actor: me.actor, action: "installers.update" }, { id, capacity, ranges }, async (tx) => {
      await tx`update installers set capacity = ${tx.json(capacity)}, active = ${f.get("active") === "on"},
        formbay_installer_id = ${s(f, "formbay_installer_id") || null}, postcode_ranges = ${ranges.map(([a, b]) => `[${a},${(b ?? a ?? 0) + 1})`)}::int4range[] where id = ${id}`;
      return { entity: "installer", entityId: id, event: "installer.updated", result: { ok: true } };
    });
    if (f.get("active") === "on") { const { notifyWaitlist } = await import("@/lib/campaigns"); await notifyWaitlist().catch(() => 0); }
  });
}
export async function addStaffNote(f: FormData) {
  const me = await requireStaff(); const id = s(f, "id");
  await run(`/ops/job/${id}`, async () => {
    await db()`insert into events (type, entity, entity_id, payload) values ('note.added', 'quote', ${id}, ${db().json({ by: me.name, note: s(f, "note") })})`;
  });
}

export async function saveContent(f: FormData) {
  const me = await requireStaff();
  const id = s(f, "id");
  const back = `/ops/content/${id}`;
  let saved = id;
  try {
    const slug = s(f, "slug").toLowerCase();
    if (!/^[a-z0-9-]+$/.test(slug)) throw new Error("Slug: lowercase letters, numbers and dashes");
    const v = { slug, title: s(f, "title"), summary: s(f, "summary"), body: s(f, "body"), system_slug: s(f, "system_slug") || null,
      tags: s(f, "tags").split(",").map((t) => t.trim()).filter(Boolean), status: s(f, "status") || "draft", author: me.name };
    await write({ actor: me.actor, action: "content.save" }, v, async (tx) => {
      const [row] = id === "new"
        ? await tx`insert into content_items ${tx(v as never)} returning id`
        : await tx`update content_items set ${tx(v as never)}, updated_at = now(), published_at = case when ${v.status} = 'published' then coalesce(published_at, now()) else published_at end where id = ${id} returning id`;
      saved = row!.id as string;
      return { entity: "content", entityId: saved, event: `content.${v.status}`, result: { slug } };
    });
  } catch (e) { redirect(`${back}?error=${encodeURIComponent((e as Error).message)}`); }
  revalidatePath("/learn"); redirect(`/ops/content/${saved}`);
}
export async function addCreatorCode(f: FormData) {
  const me = await requireStaff();
  await run("/ops/growth", async () => {
    const code = s(f, "code").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (code.length < 4) throw new Error("Code needs at least 4 letters or numbers");
    await write({ actor: me.actor, action: "codes.create" }, { code }, async (tx) => {
      await tx`insert into codes (code, kind, creator_name, creator_email, reward) values (${code}, 'creator', ${s(f, "name")}, ${s(f, "email") || null}, ${Number(s(f, "reward") || 300)})`;
      return { entity: "code", entityId: code, event: "code.created", result: { code } };
    });
  });
}
export async function markPayoutPaid(f: FormData) {
  const me = await requireStaff();
  await run("/ops/growth", async () => {
    const id = s(f, "id");
    await write({ actor: me.actor, action: "payouts.paid" }, { id }, async (tx) => {
      await tx`update payouts set status = 'paid', paid_at = now() where id = ${id} and status = 'eligible'`;
      return { entity: "payout", entityId: id, event: "payout.paid", result: { ok: true } };
    });
  });
}

export async function runTimersNow(f: FormData) {
  const me = await requireStaff();
  const which = s(f, "which");
  await run("/ops", async () => {
    if (!me.roles.includes("owner")) throw new Error("Owner only");
    const { runDaily, runCutoff } = await import("@/lib/timers");
    const r = which === "cutoff" ? await runCutoff() : await runDaily();
    await write({ actor: me.actor, action: `timers.${which}.manual` }, {}, async () => ({ entity: "timers", entityId: which, event: "timers.ran", result: r as never }));
  });
}

// ---- back office (O5, O14, O15, O16, O19, O20)
export async function techReview(f: FormData) {
  const me = await requireStaff(); const id = s(f, "id");
  await run(`/ops/job/${id}`, async () => {
    const q = (await getQuoteById(id))!;
    const d = s(f, "decision");
    if (d === "installer") await advance(q, "pricing_installer", me.actor, s(f, "note") || "Tech review: back to the installer");
    else if (d === "decline") await advance(q, "declined", me.actor, s(f, "note") || "Tech review: declined");
    else await installerPrice(q, me.actor, extraCodes(f), s(f, "note") || "Tech review: priced by ops");
  });
}
export async function draftPO(f: FormData) {
  const me = await requireStaff(); const id = s(f, "id");
  await run(`/ops/job/${id}`, async () => { const { draftPOs } = await import("@/lib/ops"); await draftPOs(id, me.actor); });
}
export async function poAction(f: FormData) {
  const me = await requireStaff(); const back = s(f, "back") || "/ops/purchasing";
  await run(back, async () => { const { poStep } = await import("@/lib/ops"); await poStep(s(f, "po"), s(f, "to") as never, me.actor, s(f, "eta") || undefined); });
}
export async function refund(f: FormData) {
  const me = await requireStaff(); const id = s(f, "id");
  await run(`/ops/job/${id}`, async () => { const { recordRefund } = await import("@/lib/ops"); await recordRefund(id, Number(s(f, "amount")), s(f, "note") || "Refund", me.actor); });
}
export async function refundSent(f: FormData) {
  const me = await requireStaff(); const id = s(f, "id");
  await run(`/ops/job/${id}`, async () => { const { markRefundSent } = await import("@/lib/ops"); await markRefundSent(s(f, "payment"), me.actor); });
}
export async function newCredit(f: FormData) {
  const me = await requireStaff();
  await run("/ops/credits", async () => { const { issueCredit } = await import("@/lib/ops"); await issueCredit(Number(s(f, "amount")), s(f, "reason") || "Goodwill", s(f, "email") || null, me.actor); });
}
export async function ticketReply(f: FormData) {
  const me = await requireStaff(); const id = s(f, "id");
  await run(`/ops/support/${id}`, async () => { const { replyTicket } = await import("@/lib/ops"); if (!s(f, "body")) throw new Error("Write a reply"); await replyTicket(id, me.name, s(f, "body"), f.get("internal") === "on", f.get("close") === "on"); });
}
export async function stcAction(f: FormData) {
  const me = await requireStaff();
  await run("/ops/stc", async () => { const { stcStep } = await import("@/lib/ops"); await stcStep(s(f, "id"), s(f, "to") as never, me.actor, s(f, "realised") ? Number(s(f, "realised")) : undefined, s(f, "ref") || undefined); });
}

export async function createInstallerFromApplication(f: FormData) {
  const me = await requireStaff();
  await run("/ops/installers", async () => {
    const [a] = await db()`select * from installer_applications where id = ${s(f, "id")} and status = 'new'`;
    if (!a) throw new Error("Application not found");
    const ranges = String(a.postcodes ?? "").split(/[\s,]+/).filter(Boolean).map((r) => r.split("-").map(Number)).filter(([x]) => x! > 0);
    type Details = { team?: { name: string; saa: string | null; formbay_id: string | null }[]; capacity?: { workingDays?: number[]; leadDays?: number }; scope?: { roofTypes?: string[]; phases?: number[]; maxStoreys?: number }; brands?: string[]; crews?: number };
    const d = (a.details ?? {}) as Details;
    const scope = d.scope ?? { version: 1, maxStoreys: 1, roofTypes: ["tin"], batteryLocations: ["garage", "outdoor_wall"], switchboardOk: true, maxCableRunM: 10, phases: [1] };
    const capacity = d.capacity ?? { jobsPerDay: 1, leadDays: 5, workingDays: [1, 2, 3, 4, 5], blackouts: [] };
    const team = d.team ?? [];
    await write({ actor: me.actor, action: "installers.create" }, { application: a.id }, async (tx) => {
      const [i] = await tx`insert into installers (business_name, abn, contact_name, email, phone, licence_no, saa_accreditation, insurance, insurance_expiry, formbay_installer_id, postcode_ranges, active, scope, capacity)
        values (${a.business_name}, ${a.abn}, ${a.contact_name}, ${a.email}, ${a.phone}, ${a.licence_no}, ${a.saa_accreditation ?? null}, ${a.insurance ?? null}, ${a.insurance_expiry ?? null},
          ${team.find((t) => t.formbay_id)?.formbay_id ?? null}, ${ranges.map(([x, y]) => `[${x},${(y ?? x ?? 0) + 1})`)}::int4range[], false, ${tx.json(scope as never)}, ${tx.json(capacity as never)}) returning id`;
      const profile = { brands: d.brands ?? [], roofTypes: [], maxStoreys: 2, phases: [], durations: { battery_only: 0.5, solar_battery: 1 }, largeKw: 13, twoStoreyExtra: 0.5,
        noticeDays: d.capacity?.leadDays ?? 3, workingDays: d.capacity?.workingDays?.length ? d.capacity.workingDays : [1, 2, 3, 4, 5] };
      await tx`update installers set profile = ${tx.json(profile as never)} where id = ${i!.id}`;
      for (let n = 1; n <= (d.crews ?? 1); n++) await tx`insert into installer_crews (installer_id, name) values (${i!.id}, ${(d.crews ?? 1) === 1 ? "Crew" : `Crew ${n}`})`;
      for (const [n, t] of team.entries()) await tx`insert into technicians (installer_id, name, saa_number, formbay_id, is_default) values (${i!.id}, ${t.name}, ${t.saa}, ${t.formbay_id}, ${n === 0})`;
      if (a.insurance_doc) await tx`insert into installer_documents (installer_id, kind, path, expires_on) values (${i!.id}, 'insurance', ${a.insurance_doc}, ${a.insurance_expiry ?? null})`;
      await tx`update installer_applications set status = 'accepted' where id = ${a.id}`;
      return { entity: "installer", entityId: i!.id as string, event: "installer.created", result: { id: i!.id, technicians: team.length } };
    });
  });
}

/** O17: publish, hide or reply to a review. Every review is published unless it is not from a real install or breaks the rules. */
export async function reviewDecide(f: FormData) {
  const me = await requireStaff();
  const id = String(f.get("id") ?? ""), to = String(f.get("to") ?? ""), reply = String(f.get("reply") ?? "").trim().slice(0, 2000) || null;
  if (!["published", "hidden", "reply"].includes(to)) redirect("/ops/reviews");
  await write({ actor: me.actor, action: `reviews.${to}` }, { id, reply }, async (tx) => {
    if (to === "reply") await tx`update reviews set reply = ${reply} where id = ${id}`;
    else await tx`update reviews set status = ${to}, published_at = case when ${to} = 'published' then now() else null end where id = ${id}`;
    return { entity: "review", entityId: id, event: `review.${to}`, result: { id } };
  });
  revalidatePath("/reviews"); revalidatePath("/ops/reviews"); redirect("/ops/reviews");
}

/** A22: show or hide one install photo on the real installs page. Only allowed with the customer's consent. */
export async function photoPublic(f: FormData) {
  const me = await requireStaff();
  const id = String(f.get("photo") ?? ""), job = String(f.get("job") ?? ""), on = f.get("on") === "1";
  await write({ actor: me.actor, action: "photos.public" }, { id, on }, async (tx) => {
    const [ok] = await tx`select q.showcase_consent from quote_photos p join quotes q on q.id = p.quote_id where p.id = ${id}`;
    if (on && !ok?.showcase_consent) throw new Error("The customer hasn't agreed to share photos");
    await tx`update quote_photos set public = ${on} where id = ${id}`;
    return { entity: "quote", entityId: job, event: on ? "photo.public" : "photo.private", result: { id, on } };
  });
  revalidatePath("/installs"); redirect(`/ops/job/${job}`);
}

/** Email mode: held (nothing leaves), test (everything goes to the test address), live (customers get their messages). */
export async function setEmailMode(f: FormData) {
  const me = await requireStaff();
  const mode = String(f.get("mode") ?? "held"), test_to = String(f.get("test_to") ?? "").trim();
  if (!["held", "test", "live"].includes(mode)) redirect("/ops/messages");
  if (test_to && !/^\S+@\S+\.\S+$/.test(test_to)) redirect("/ops/messages?error=Test%20address%20looks%20wrong");
  await write({ actor: me.actor, action: "settings.email" }, { mode, test_to }, async (tx) => {
    await tx`insert into settings (key, value, updated_by) values ('email', ${tx.json({ mode, test_to })}, ${me.name})
      on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by`;
    return { entity: "settings", entityId: "email", event: `email.${mode}`, result: { mode } };
  });
  revalidatePath("/ops/messages"); redirect("/ops/messages");
}

export async function sendTemplateTests(f: FormData) {
  await requireStaff();
  const to = String(f.get("to") ?? "").trim();
  if (!/^\S+@\S+\.\S+$/.test(to)) redirect("/ops/messages?error=Enter%20an%20email%20address");
  const [q] = await db()`select token from quotes order by created_at desc limit 1`;
  const { sendAllTemplatesTo } = await import("@/lib/messages");
  const results = await sendAllTemplatesTo(to, (q?.token as string) ?? "00000000000000000000000000000000000");
  redirect(`/ops/messages?sent=${encodeURIComponent(results.join(" · "))}`);
}

export async function resendMessage(f: FormData) {
  await requireStaff();
  const { deliver } = await import("@/lib/email");
  await db()`update messages set status = 'queued' where id = ${String(f.get("id"))} and status in ('failed','held')`;
  await deliver(String(f.get("id")));
  revalidatePath("/ops/messages"); redirect("/ops/messages");
}


/* Formbay: ops sends a booked job, links an existing one, or syncs statuses. Every action is audited. */
export async function formbaySend(f: FormData) {
  const me = await requireStaff();
  const id = String(f.get("id"));
  if (f.get("confirm") !== "on") redirect(`/ops/job/${id}?error=${encodeURIComponent("Tick the box to confirm the details are right")}`);
  const { sendFormbayJob } = await import("@/lib/formbay-job");
  try {
    const q = (await getQuoteById(id))!;
    const [inst] = await db()`select formbay_installer_id, business_name from installers where id = ${q.installer_id}`;
    const r = await sendFormbayJob(q, (inst as never) ?? null);
    await write({ actor: me.actor, action: "formbay.create" }, { id, formid: r.formid }, async () => ({ entity: "quote", entityId: id, event: "formbay.created", result: r }));
  } catch (e) { redirect(`/ops/job/${id}?error=${encodeURIComponent((e as Error).message)}`); }
  revalidatePath(`/ops/job/${id}`); redirect(`/ops/job/${id}`);
}

export async function formbayLink(f: FormData) {
  const me = await requireStaff();
  const id = String(f.get("id")), formid = String(f.get("formid") ?? "").trim(), bstc = String(f.get("bstc") ?? "").trim();
  if (!/^\d+$/.test(formid || bstc)) redirect(`/ops/job/${id}?error=${encodeURIComponent("Enter the Formbay form or BSTC number")}`);
  await write({ actor: me.actor, action: "formbay.link" }, { id, formid, bstc }, async (tx) => {
    await tx`update quotes set formbay_formid = ${formid || null}, formbay_bstc_id = ${bstc || null} where id = ${id}`;
    return { entity: "quote", entityId: id, event: "formbay.linked", result: { formid, bstc } };
  });
  revalidatePath(`/ops/job/${id}`); redirect(`/ops/job/${id}`);
}

export async function formbaySyncNow(f: FormData) {
  await requireStaff();
  const { runFormbaySync } = await import("@/lib/timers");
  const out = await runFormbaySync();
  const back = String(f.get("back") ?? "/ops");
  redirect(`${back}${back.includes("?") ? "&" : "?"}ok=${encodeURIComponent(`Formbay sync: ${JSON.stringify(out)}`)}`);
}

/* C5 / C8 / C4: call-backs and settings */
export async function callbackDone(f: FormData) {
  const me = await requireStaff();
  await run("/ops/callbacks", async () => { await db()`update callbacks set status = 'done', done_at = now(), done_by = ${me.name} where id = ${s(f, "id")}`; });
}
export async function saveDesignCheck(f: FormData) {
  const me = await requireStaff();
  const { setSetting } = await import("@/lib/settings");
  const amount = Number(s(f, "amount") || 99);
  await run("/ops/settings", async () => {
    if (!(amount >= 0 && amount <= 500)) throw new Error("Amount between $0 and $500");
    await setSetting("design_check", { fee_on: f.get("fee_on") === "on", amount }, me.name);
  });
}
export async function saveTrust(f: FormData) {
  const me = await requireStaff();
  const { setSetting } = await import("@/lib/settings");
  const v = (k: string) => s(f, k).slice(0, 200);
  await run("/ops/settings", async () => {
    const video = v("founder_video");
    if (video && !/^https:\/\//.test(video)) throw new Error("The video link must start with https://");
    if (v("callback_to") && !/^\S+@\S+\.\S+$/.test(v("callback_to"))) throw new Error("Call-back email isn't valid");
    const g = v("google_review_url");
    if (g && !/^https:\/\//.test(g)) throw new Error("The Google review link must start with https://");
    await setSetting("trust", { founder_line: v("founder_line"), founder_video: video, licence: v("licence"), insurance: v("insurance"), accreditations: v("accreditations"), callback_to: v("callback_to"), google_review_url: g,
      founder_quote: s(f, "founder_quote").slice(0, 600), address: v("address"), hours: v("hours"), callback_minutes: v("callback_minutes").replace(/\D/g, "").slice(0, 3), team: s(f, "team").slice(0, 2000) }, me.name);
  });
}
export async function opsDesignFeePaid(f: FormData) {
  const me = await requireStaff(); const id = s(f, "id");
  const { designFeePaid } = await import("@/lib/jobs");
  await run(`/ops/job/${id}`, async () => designFeePaid((await getQuoteById(id))!, me.actor));
}
export async function opsRevise(f: FormData) {
  const me = await requireStaff(); const id = s(f, "id");
  const { proposeRevision } = await import("@/lib/jobs");
  await run(`/ops/job/${id}`, async () => proposeRevision((await getQuoteById(id))!, me.actor, {
    panels: Number(s(f, "panels")), modules: Number(s(f, "modules")), backup: s(f, "backup") === "whole_home" ? "whole_home" : "none",
    extraCodes: f.getAll("codes").map(String), reason: s(f, "reason"),
  }));
}

/* Scheduling S6/S7 */
export async function setDeskMode(f: FormData) {
  const me = await requireStaff();
  const mode = s(f, "mode");
  const { setSetting } = await import("@/lib/settings");
  await run("/ops/desk", async () => { if (!["off", "all", "help"].includes(mode)) throw new Error("Pick a mode"); await setSetting("booking_desk", { mode: mode as "off" | "all" | "help" }, me.name); });
}
export async function deskCalled(f: FormData) {
  await requireStaff();
  await run("/ops/desk", async () => { await db()`update quotes set desk_called_at = coalesce(desk_called_at, now()), desk_notes = ${s(f, "notes").slice(0, 1000) || null} where id = ${s(f, "id")}`; });
}
export async function deskBook(f: FormData) {
  const me = await requireStaff();
  await run("/ops/desk", async () => {
    const { bookDay } = await import("@/lib/schedule");
    await bookDay((await getQuoteById(s(f, "id")))!, s(f, "date"), me.actor, "desk");
    await db()`update quotes set desk_called_at = coalesce(desk_called_at, now()) where id = ${s(f, "id")}`;
  });
}
export async function opsReleaseDay(f: FormData) {
  const me = await requireStaff(); const id = s(f, "id");
  await run(`/ops/job/${id}`, async () => {
    const reason = s(f, "reason");
    if (!["rain", "sick", "parts", "customer", "ops", "declined"].includes(reason)) throw new Error("Pick a reason");
    const { releaseDay } = await import("@/lib/schedule");
    await releaseDay((await getQuoteById(id))!, reason, me.actor);
  });
}
export async function opsMessage(f: FormData) {
  const me = await requireStaff(); const id = s(f, "id");
  await run(`/ops/job/${id}`, async () => {
    const q = (await getQuoteById(id))!;
    const { postMessage } = await import("@/lib/thread");
    await postMessage(q.token, "ops", me.name, s(f, "body"));
  });
}
export async function saveScheduling(f: FormData) {
  const me = await requireStaff();
  const { setSetting } = await import("@/lib/settings");
  await run("/ops/settings", async () => {
    const n = (k: string, lo: number, hi: number, d: number) => { const v = Number(s(f, k)); return Number.isFinite(v) && s(f, k) !== "" ? Math.min(hi, Math.max(lo, v)) : d; };
    await setSetting("scheduling", { gear_lead_days: n("gear_lead_days", 0, 30, 3), decline_hours: n("decline_hours", 1, 72, 24), earlier_offer_hours: n("earlier_offer_hours", 1, 72, 12) }, me.name);
  });
}

/* R0/R2: System Record documents, Formbay pack, warranty registration, product datasheets */
export async function opsAddDocument(f: FormData) {
  await requireStaff(); const id = s(f, "id");
  await run(`/ops/job/${id}`, async () => {
    const file = f.get("file");
    if (!(file instanceof File) || !file.size) throw new Error("Choose a file");
    if (file.size > 25_000_000) throw new Error("File over 25 MB");
    const kind = ["coc", "stc_form", "warranty_card", "service_report", "other"].includes(s(f, "kind")) ? s(f, "kind") : "other";
    const { putPhoto } = await import("@/lib/storage");
    const path = `records/${id}/${kind}-${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
    await putPhoto(path, await file.arrayBuffer(), file.type || "application/octet-stream");
    await db()`insert into job_documents (quote_id, kind, title, path, content_type) values (${id}, ${kind}, ${s(f, "title") || file.name}, ${path}, ${file.type || null})`;
  });
}
export async function opsPullFormbay(f: FormData) {
  await requireStaff(); const id = s(f, "id");
  await run(`/ops/job/${id}`, async () => {
    await db()`update quotes set formbay_docs_at = null where id = ${id}`;
    const { pullFormbayRecord } = await import("@/lib/record");
    const r = await pullFormbayRecord(id);
    if (r !== "saved") throw new Error(`Formbay: ${r}. The pack appears once Formbay has the job's documents.`);
  });
}
export async function opsWarranty(f: FormData) {
  const me = await requireStaff(); const id = s(f, "id");
  await run(`/ops/job/${id}`, async () => {
    const brand = s(f, "brand");
    await db()`update quotes set warranty = coalesce(warranty, '{}'::jsonb) || ${db().json({ [brand]: { registered_at: new Date().toISOString().slice(0, 10), by: me.name, ref: s(f, "ref") || null } } as never)} where id = ${id}`;
    if (f.get("tell") === "on") {
      const q = (await getQuoteById(id))!;
      const { queueMessage } = await import("@/lib/messages");
      await queueMessage("M23", q.token, q.customer_email, { name: q.customer_name });
    }
  });
}
export async function opsProductDoc(f: FormData) {
  await requireStaff();
  await run("/ops/products", async () => {
    const sku = s(f, "sku"), kind = ["datasheet", "manual", "warranty"].includes(s(f, "kind")) ? s(f, "kind") : "datasheet";
    const url = s(f, "url"), file = f.get("file");
    let path: string | null = null;
    if (file instanceof File && file.size) {
      const { putPhoto } = await import("@/lib/storage");
      path = `products/${sku}/${kind}-${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
      await putPhoto(path, await file.arrayBuffer(), file.type || "application/pdf");
    } else if (!/^https:\/\//.test(url)) throw new Error("Add a file or an https:// link to the manufacturer's document");
    await db()`insert into product_docs (sku, kind, title, url, path) values (${sku}, ${kind}, ${s(f, "title") || `${kind[0]!.toUpperCase()}${kind.slice(1)}`}, ${path ? null : url}, ${path})`;
  });
}
export async function opsRemoveProductDoc(f: FormData) {
  await requireStaff();
  await run("/ops/products", async () => { await db()`delete from product_docs where id = ${s(f, "id")}`; });
}

/* G5 campaigns */
export async function campaignSave(f: FormData) {
  const me = await requireStaff();
  const id = s(f, "id");
  await run("/ops/campaigns", async () => {
    const { AUDIENCES } = await import("@/lib/campaigns");
    if (!AUDIENCES[s(f, "audience")]) throw new Error("Pick an audience");
    if (s(f, "subject").length < 5 || s(f, "body").length < 20) throw new Error("Add a subject and a message");
    if (id) await db()`update campaigns set name = ${s(f, "name")}, audience = ${s(f, "audience")}, subject = ${s(f, "subject")}, body = ${s(f, "body")} where id = ${id} and status = 'draft'`;
    else await db()`insert into campaigns (name, audience, subject, body, created_by) values (${s(f, "name") || "Rebate deadline"}, ${s(f, "audience")}, ${s(f, "subject")}, ${s(f, "body")}, ${me.name})`;
  });
}
export async function campaignTest(f: FormData) {
  await requireStaff();
  await run("/ops/campaigns", async () => {
    const { sendCampaign } = await import("@/lib/campaigns");
    const { getSetting } = await import("@/lib/settings");
    await sendCampaign(s(f, "id"), { test: true, testTo: (await getSetting("trust")).callback_to || "hello@dfrntsolar.com.au" });
  });
}
export async function campaignSend(f: FormData) {
  await requireStaff();
  await run("/ops/campaigns", async () => {
    if (f.get("confirm") !== "on") throw new Error("Tick the box to confirm you've checked the test email");
    const { sendCampaign } = await import("@/lib/campaigns");
    await sendCampaign(s(f, "id"), { batch: 200 });
  });
}

/* U1 add-ons catalogue */
export async function addonSave(f: FormData) {
  await requireStaff();
  await run("/ops/addons", async () => {
    const code = s(f, "code").toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 20);
    if (!code || s(f, "name").length < 2) throw new Error("Code and name are needed");
    const n = (k: string) => Math.max(0, Number(s(f, k)) || 0);
    await db()`insert into addons (code, name, description, supplier_cost_ex, installer_labour_ex, extra_days, active, sort)
      values (${code}, ${s(f, "name")}, ${s(f, "description")}, ${n("supplier")}, ${n("labour")}, ${Math.round(n("days") * 2) / 2}, ${f.get("active") === "on"}, ${n("sort")})
      on conflict (code) do update set name = excluded.name, description = excluded.description, supplier_cost_ex = excluded.supplier_cost_ex,
        installer_labour_ex = excluded.installer_labour_ex, extra_days = excluded.extra_days, active = excluded.active, sort = excluded.sort`;
  });
}

/* R1 service plan */
export async function saveServicePlan(f: FormData) {
  const me = await requireStaff();
  const { setSetting } = await import("@/lib/settings");
  await run("/ops/settings", async () => {
    const price = Number(s(f, "price") || 0);
    if (f.get("on") === "on" && !(price > 0)) throw new Error("Set a price before switching the plan on");
    await setSetting("service_plan", { on: f.get("on") === "on", price, includes: s(f, "includes").slice(0, 300) }, me.name);
  });
}
export async function memberAction(f: FormData) {
  await requireStaff();
  await run("/ops/service", async () => {
    const id = s(f, "id"), what = s(f, "what");
    if (what === "paid") await db()`update memberships set status = 'active', started_on = coalesce(started_on, current_date),
      renews_on = greatest(coalesce(renews_on, current_date), current_date) + interval '1 year' where id = ${id}`;
    else if (what === "visit") await db()`update memberships set last_visit_on = current_date where id = ${id}`;
    else if (what === "cancel") await db()`update memberships set status = 'cancelled' where id = ${id}`;
  });
}

/* B1 Xero */
export async function xeroCodes(f: FormData) {
  const me = await requireStaff();
  await run("/ops/xero", async () => {
    const { getSetting, setSetting } = await import("@/lib/settings");
    const x = await getSetting("xero");
    const k = ["sales", "stc", "stc_sale", "installer", "bank", "stripe", "stripe_fees", "sales_tax", "stc_tax", "stc_sale_tax", "installer_tax"] as const;
    const codes = Object.fromEntries(k.map((n) => [n, s(f, n).slice(0, 30)])) as typeof x.codes;
    await setSetting("xero", { ...x, codes }, me.name);
  });
}
export async function xeroDisconnect() {
  const me = await requireStaff();
  await run("/ops/xero", async () => {
    if (!me.roles.includes("owner")) throw new Error("Owner only");
    const { getSetting, setSetting } = await import("@/lib/settings");
    const x = await getSetting("xero");
    await setSetting("xero", { codes: x.codes }, me.name);
  });
}
export async function xeroSyncNow() {
  await requireStaff();
  await run("/ops/xero", async () => {
    const { syncXero } = await import("@/lib/xero");
    const r = await syncXero();
    if ("skipped" in r) throw new Error(`Not sent: ${r.skipped}`);
  });
}

/** Real-usage sizing settings: who sees the button, the yield table, the standard tariff. */
export async function energySave(f: FormData) {
  const me = await requireStaff();
  await run("/ops/energy", async () => {
    const { getSetting, setSetting } = await import("@/lib/settings");
    const e = await getSetting("energy");
    const mode = (["off", "preview", "all"] as const).find((m) => m === s(f, "mode")) ?? e.mode;
    const yields = { ...e.yields };
    for (const k of Object.keys(yields)) { const v = Number(s(f, `y_${k}`)); if (v >= 2 && v <= 7) yields[k] = { ...yields[k]!, kwh_per_kw: Math.round(v * 100) / 100 }; }
    const n = (k: string, d: number) => { const v = Number(s(f, k)); return Number.isFinite(v) && v >= 0 && v < 500 ? v : d; };
    const standard = { usage_c: n("usage_c", e.standard.usage_c), supply_c_day: n("supply_c_day", e.standard.supply_c_day), fit_c: n("fit_c", e.standard.fit_c), controlled_c: n("controlled_c", e.standard.controlled_c) };
    await setSetting("energy", { ...e, mode, yields, standard }, me.name);
  });
}
export async function energyRepull(f: FormData) {
  await requireStaff();
  await run("/ops/energy", async () => { const { pullLink } = await import("@/lib/energy"); await pullLink(s(f, "id"), { force: true }); });
}
export async function energyRevoked(f: FormData) {
  await requireStaff();
  await run("/ops/energy", async () => { await db()`update energy_links set revoke_status = 'revoked' where id = ${s(f, "id")}`; });
}

/** S2: register this app's own Stripe webhook (signing secret stored sealed, nobody copies it). */
export async function stripeRegister() {
  const me = await requireStaff();
  await run("/ops/payments", async () => {
    const { registerWebhook } = await import("@/lib/stripe");
    const { siteUrl } = await import("@/lib/messages");
    await registerWebhook(`${siteUrl()}/api/v1/stripe/webhook`, me.name);
  });
}
/** S4: finance lenders shown at checkout. */
export async function financeSave(f: FormData) {
  const me = await requireStaff();
  await run("/ops/payments", async () => {
    const { getSetting, setSetting } = await import("@/lib/settings");
    const cur = await getSetting("finance");
    const providers = cur.providers.map((p) => {
      const url = s(f, `url_${p.id}`);
      if (url && !/^https:\/\//.test(url)) throw new Error(`${p.name}: the link must start with https://`);
      return { ...p, url, blurb: s(f, `blurb_${p.id}`) || p.blurb, on: f.get(`on_${p.id}`) === "on" && !!url };
    });
    await setSetting("finance", { providers }, me.name);
  });
}
/** Daily reconcile on demand. */
export async function stripeReconcile() {
  await requireStaff();
  await run("/ops/payments", async () => { const { reconcileStripe } = await import("@/lib/stripe"); await reconcileStripe(); });
}

/** Bank details customers pay by transfer into (shown on the pay screen). */
export async function bankSave(f: FormData) {
  const me = await requireStaff();
  if (!me.roles.includes("owner")) redirect("/ops/payments?error=Owner%20only");
  await run("/ops/payments", async () => {
    const bsb = s(f, "bsb").replace(/\D/g, ""), acct = s(f, "account_number").replace(/\D/g, "");
    if (bsb && bsb.length !== 6) throw new Error("BSB must be 6 digits");
    if (acct && (acct.length < 6 || acct.length > 10)) throw new Error("Account number must be 6–10 digits");
    const { setSetting } = await import("@/lib/settings");
    await setSetting("bank", { account_name: s(f, "account_name").slice(0, 80), bsb: bsb ? `${bsb.slice(0, 3)}-${bsb.slice(3)}` : "", account_number: acct, bank: s(f, "bank").slice(0, 60) }, me.name);
    await db()`insert into events (type, entity, entity_id, payload) values ('bank.changed', 'settings', null, ${db().json({ by: me.name })})`;
  });
}
