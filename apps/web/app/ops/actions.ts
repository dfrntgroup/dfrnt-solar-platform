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
  });
}
export async function decideApproval(f: FormData) {
  const me = await requireStaff();
  await run("/ops/approvals", async () => {
    const id = s(f, "id"), approve = s(f, "decision") === "approve";
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
