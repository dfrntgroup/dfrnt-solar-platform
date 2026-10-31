"use server";
import { createHash, randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { write } from "@dfrnt/db";
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
export async function toggleAgent(f: FormData) {
  const me = await owner(); const id = String(f.get("id"));
  await write({ actor: me.actor, action: "agents.toggle" }, { id }, async (tx) => {
    const [a] = await tx`update agents set enabled = not enabled where id = ${id} returning enabled`;
    return { entity: "agent", entityId: id, event: a!.enabled ? "agent.enabled" : "agent.disabled", result: { enabled: a!.enabled } };
  });
  redirect("/ops/agents");
}
export async function revokeKey(f: FormData) {
  const me = await owner(); const id = String(f.get("id"));
  await write({ actor: me.actor, action: "api_keys.revoke" }, { id }, async (tx) => {
    await tx`update api_keys set revoked_at = now() where id = ${id}`;
    return { entity: "api_key", entityId: id, event: "api_key.revoked", result: { ok: true } };
  });
  redirect("/ops/agents");
}
