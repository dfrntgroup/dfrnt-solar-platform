"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, write } from "@dfrnt/db";
import type { JobState } from "@dfrnt/engine";
import { requireStaff } from "@/lib/auth";
import { advance, cancel, getQuoteById, installerPrice, markPaid, raiseVariation } from "@/lib/jobs";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
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
  await run(`/ops/job/${id}`, async () => installerPrice((await getQuoteById(id))!, me.actor, f.getAll("codes").map(String), s(f, "note")));
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
    await executeProposal(id, approve, me.id, s(f, "note"));
  });
}
export async function saveInstaller(f: FormData) {
  const me = await requireStaff(); const id = s(f, "id");
  await run("/ops/installers", async () => {
    const num = (k: string, d: number) => (s(f, k) ? Number(s(f, k)) : d);
    const capacity = { jobsPerDay: num("jobsPerDay", 1), leadDays: num("leadDays", 3), workingDays: f.getAll("workingDays").map(Number), blackouts: s(f, "blackouts").split(/[\s,]+/).filter(Boolean) };
    const ranges = s(f, "ranges").split(/[\s,]+/).filter(Boolean).map((r) => r.split("-").map(Number));
    if (f.get("active") === "on") {
      const [i] = await db()`select abn, licence_no, insurance_expiry::text ins, is_test from installers where id = ${id}`;
      if (!i!.is_test && (!i!.abn || !i!.licence_no || !i!.ins || (i!.ins as string) < new Date().toISOString().slice(0, 10))) throw new Error("Can't activate: ABN, licence and current insurance must be on the installer's profile");
    }
    await write({ actor: me.actor, action: "installers.update" }, { id, capacity, ranges }, async (tx) => {
      await tx`update installers set capacity = ${tx.json(capacity)}, active = ${f.get("active") === "on"},
        formbay_installer_id = ${s(f, "formbay_installer_id") || null}, postcode_ranges = ${ranges.map(([a, b]) => `[${a},${(b ?? a ?? 0) + 1})`)}::int4range[] where id = ${id}`;
      return { entity: "installer", entityId: id, event: "installer.updated", result: { ok: true } };
    });
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
    else await installerPrice(q, me.actor, f.getAll("codes").map(String), s(f, "note") || "Tech review: priced by ops");
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
    type Details = { team?: { name: string; saa: string | null; formbay_id: string | null }[]; capacity?: object; scope?: object };
    const d = (a.details ?? {}) as Details;
    const scope = d.scope ?? { version: 1, maxStoreys: 1, roofTypes: ["tin"], batteryLocations: ["garage", "outdoor_wall"], switchboardOk: true, maxCableRunM: 10, phases: [1] };
    const capacity = d.capacity ?? { jobsPerDay: 1, leadDays: 5, workingDays: [1, 2, 3, 4, 5], blackouts: [] };
    const team = d.team ?? [];
    await write({ actor: me.actor, action: "installers.create" }, { application: a.id }, async (tx) => {
      const [i] = await tx`insert into installers (business_name, abn, contact_name, email, phone, licence_no, saa_accreditation, insurance, insurance_expiry, formbay_installer_id, postcode_ranges, active, scope, capacity)
        values (${a.business_name}, ${a.abn}, ${a.contact_name}, ${a.email}, ${a.phone}, ${a.licence_no}, ${a.saa_accreditation ?? null}, ${a.insurance ?? null}, ${a.insurance_expiry ?? null},
          ${team.find((t) => t.formbay_id)?.formbay_id ?? null}, ${ranges.map(([x, y]) => `[${x},${(y ?? x ?? 0) + 1})`)}::int4range[], false, ${tx.json(scope as never)}, ${tx.json(capacity as never)}) returning id`;
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
    await setSetting("trust", { founder_line: v("founder_line"), founder_video: video, licence: v("licence"), insurance: v("insurance"), accreditations: v("accreditations"), callback_to: v("callback_to") }, me.name);
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
