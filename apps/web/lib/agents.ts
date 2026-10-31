// Agent proposals (tier P) wait in approvals; a person approves and the operation runs as the proposing agent, audited.
import { db } from "@dfrnt/db";
import { runOperation } from "./operations";

export async function propose(agentId: string, action: string, payload: unknown, rationale: string) {
  const [a] = await db()`insert into approvals (proposer_type, proposer_id, action, payload, rationale) values ('agent', ${agentId}, ${action}, ${db().json(payload as never)}, ${rationale}) returning id`;
  return { approval_id: a!.id as string, status: "pending" };
}

export async function executeProposal(id: string, approve: boolean, staffId: string, note?: string) {
  const [p] = await db()`select * from approvals where id = ${id} and status = 'pending'`;
  if (!p) throw new Error("Already decided");
  if (new Date(p.created_at as string).getTime() < Date.now() - 24 * 3600_000) {
    await db()`update approvals set status = 'expired', decided_by = ${staffId}, decided_at = now() where id = ${id}`;
    throw new Error("Proposal expired (24 h)");
  }
  if (approve) await runOperation(p.action as string, p.payload, { type: "agent", id: p.proposer_id as string }, `Approved proposal ${id}${note ? `: ${note}` : ""}`);
  await db()`update approvals set status = ${approve ? "approved" : "rejected"}, decided_by = ${staffId}, decided_at = now(), decision_note = ${note ?? null} where id = ${id}`;
}
