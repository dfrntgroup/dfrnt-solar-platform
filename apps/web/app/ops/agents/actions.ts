"use server";
import { createHash, randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { db, write } from "@dfrnt/db";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";

async function owner() { const me = await requireStaff(); if (!me.roles.includes("owner")) redirect("/ops/agents?error=Owner%20only"); return me; }

/** Tier H: only the owner issues keys. The key is shown once; only its hash is stored. */
export async function issueKey(f: FormData) {
  const me = await owner();
  const agent = String(f.get("agent")), label = String(f.get("label") || `${agent} key`);
  const key = `dfs_${agent}_${randomBytes(24).toString("base64url")}`;
  await write({ actor: me.actor, action: "api_keys.issue" }, { agent, label }, async (tx) => {
    const [k] = await tx`insert into api_keys (agent_id, label, key_hash) values (${agent}, ${label}, ${createHash("sha256").update(key).digest("hex")}) returning id`;
    return { entity: "api_key", entityId: k!.id as string, event: "api_key.issued", result: { agent, label } };
  });
  redirect(`/ops/agents?key=${encodeURIComponent(key)}`);
}
/** Kill switch: anyone on staff can switch an agent off; only the owner switches one on. */
export async function toggleAgent(f: FormData) {
  const me = await requireStaff(); const id = String(f.get("id")); const back = String(f.get("back") || "/ops/agents");
  const [cur] = await db()`select enabled from agents where id = ${id}`;
  if (!cur?.enabled && !me.roles.includes("owner")) redirect(`${back}?error=${encodeURIComponent("Only the owner can switch an agent on")}`);
  await write({ actor: me.actor, action: "agents.toggle" }, { id }, async (tx) => {
    const [a] = await tx`update agents set enabled = not enabled where id = ${id} returning enabled`;
    return { entity: "agent", entityId: id, event: a!.enabled ? "agent.enabled" : "agent.disabled", result: { enabled: a!.enabled } };
  });
  redirect(back);
}
export async function revokeKey(f: FormData) {
  const me = await owner(); const id = String(f.get("id"));
  await write({ actor: me.actor, action: "api_keys.revoke" }, { id }, async (tx) => {
    await tx`update api_keys set revoked_at = now() where id = ${id}`;
    return { entity: "api_key", entityId: id, event: "api_key.revoked", result: { ok: true } };
  });
  redirect("/ops/agents");
}

const back = (id: string, err?: string) => redirect(`/ops/agents/${id}${err ? `?error=${encodeURIComponent(err)}` : ""}`);
async function guard(id: string, fn: () => Promise<unknown>) {
  try { await fn(); } catch (e) { if ((e as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw e; back(id, (e as Error).message); }
  revalidatePath(`/ops/agents/${id}`); back(id);
}
async function testsLater(id: string, reason: string) {
  try { const { after } = await import("next/server"); after(async () => { const { runAgentTests } = await import("@/lib/agent-tests"); await runAgentTests(id, reason).catch(() => null); }); } catch { /* run from the page */ }
}

/** Owner: Off / Propose / Act for each tool. */
export async function setPermission(f: FormData) {
  const me = await owner(); const id = String(f.get("id")), tool = String(f.get("tool")), mode = String(f.get("mode"));
  await guard(id, async () => {
    const { TOOL } = await import("@/lib/agent-tools");
    if (!TOOL[tool]?.agents.includes(id) || !["off", "propose", "act"].includes(mode)) throw new Error("Unknown action");
    await write({ actor: me.actor, action: "agents.permission" }, { id, tool, mode }, async (tx) => {
      await tx`insert into agent_permissions (agent_id, tool, mode, updated_by) values (${id}, ${tool}, ${mode}, ${me.name})
        on conflict (agent_id, tool) do update set mode = excluded.mode, updated_by = excluded.updated_by, updated_at = now()`;
      return { entity: "agent", entityId: id, event: "agent.permission", result: { tool, mode } };
    });
    await testsLater(id, `${tool} → ${mode}`);
  });
}
/** Owner: limits and budget. */
export async function saveLimits(f: FormData) {
  const me = await owner(); const id = String(f.get("id"));
  await guard(id, async () => {
    const n = (k: string, lo: number, hi: number) => { const v = Number(f.get(k)); if (!Number.isFinite(v) || v < lo || v > hi) throw new Error(`${k.replace(/_/g, " ")} must be ${lo}–${hi}`); return v; };
    const limits = { messages_per_customer_day: n("messages_per_customer_day", 0, 10), refund_max: 0, discount_max: 0, spend_per_day: 0 };
    const hours = { start: n("start", 0, 23), end: n("end", 1, 24) };
    if (hours.end <= hours.start) throw new Error("Working hours must end after they start");
    const cap = n("cap", 0, 20000), pct = n("alert_pct", 10, 100);
    await write({ actor: me.actor, action: "agents.limits" }, { id, limits, hours, cap, pct }, async (tx) => {
      await tx`update agents set limits = ${tx.json(limits)}, hours = ${tx.json(hours)}, monthly_spend_cap_aud = ${cap}, alert_pct = ${pct}, budget_alerted_month = null where id = ${id}`;
      return { entity: "agent", entityId: id, event: "agent.limits", result: { cap } };
    });
  });
}
/** Staff: plain-English instructions (re-runs the tests). */
export async function saveInstructions(f: FormData) {
  const me = await requireStaff(); const id = String(f.get("id"));
  await guard(id, async () => {
    const text = String(f.get("instructions") ?? "").trim();
    if (text.length < 20) throw new Error("Instructions are too short");
    await write({ actor: me.actor, action: "agents.instructions" }, { id }, async (tx) => {
      await tx`update agents set instructions = ${text.slice(0, 6000)} where id = ${id}`;
      return { entity: "agent", entityId: id, event: "agent.instructions", result: { length: text.length } };
    });
    await testsLater(id, `Instructions edited by ${me.name}`);
  });
}
export async function runTests(f: FormData) {
  await requireStaff(); const id = String(f.get("id"));
  await guard(id, async () => { const { runAgentTests } = await import("@/lib/agent-tests"); await runAgentTests(id, "Run from Ops"); });
}
export async function undoAction(f: FormData) {
  const me = await requireStaff(); const id = String(f.get("id"));
  await guard(id, async () => { const { undoAgentAction } = await import("@/lib/agent-runtime"); await undoAgentAction(String(f.get("action")), me.name); });
}
/** Owner: promote one action from Propose to Act once it has earned it (50+ decided, 98 %+ unedited). */
export async function promote(f: FormData) {
  const me = await owner(); const id = String(f.get("id")), tool = String(f.get("tool"));
  await guard(id, async () => {
    const { promotionStats } = await import("@/lib/agent-runtime");
    const st = (await promotionStats(id)).find((r) => r.tool === tool);
    const decided = (st?.decided as number) ?? 0, clean = (st?.clean as number) ?? 0;
    if (decided < 50 || clean / decided < 0.98) throw new Error(`Not yet: ${clean} of ${decided} approved unedited (needs 50+ at 98 %)`);
    await write({ actor: me.actor, action: "agents.promote" }, { id, tool }, async (tx) => {
      await tx`update agent_permissions set mode = 'act', updated_by = ${me.name}, updated_at = now() where agent_id = ${id} and tool = ${tool}`;
      return { entity: "agent", entityId: id, event: "agent.promoted", result: { tool } };
    });
  });
}
