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
        postcode_ranges = ${ranges.map(([a, b]) => `[${a},${(b ?? a ?? 0) + 1})`)}::int4range[] where id = ${id}`;
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
    await write({ actor: me.actor, action: "installers.create" }, { application: a.id }, async (tx) => {
      const [i] = await tx`insert into installers (business_name, abn, contact_name, email, phone, licence_no, postcode_ranges, active, scope, capacity)
        values (${a.business_name}, ${a.abn}, ${a.contact_name}, ${a.email}, ${a.phone}, ${a.licence_no}, ${ranges.map(([x, y]) => `[${x},${(y ?? x ?? 0) + 1})`)}::int4range[], false,
        ${tx.json({ version: 1, maxStoreys: 1, roofTypes: ["tin"], batteryLocations: ["garage", "outdoor_wall"], switchboardOk: true, maxCableRunM: 10, phases: [1] })},
        ${tx.json({ jobsPerDay: 1, leadDays: 5, workingDays: [1, 2, 3, 4, 5], blackouts: [] })}) returning id`;
      await tx`update installer_applications set status = 'accepted' where id = ${a.id}`;
      return { entity: "installer", entityId: i!.id as string, event: "installer.created", result: { id: i!.id } };
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
