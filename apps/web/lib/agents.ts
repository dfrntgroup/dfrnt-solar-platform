// Agent proposals (tier P) wait in approvals; a person approves and the operation runs as the proposing agent, audited.
import { db } from "@dfrnt/db";
import { runOperation } from "./operations";

export async function propose(agentId: string, action: string, payload: unknown, rationale: string) {
  const [a] = await db()`insert into approvals (proposer_type, proposer_id, action, payload, rationale) values ('agent', ${agentId}, ${action}, ${db().json(payload as never)}, ${rationale}) returning id`;
  return { approval_id: a!.id as string, status: "pending" };
}

export async function executeProposal(id: string, approve: boolean, staffId: string, note?: string, edited?: Record<string, unknown>) {
  // Claim it first: the second of two simultaneous approvers finds nothing to claim and stops here (used to run the operation twice).
  const [p] = await db()`update approvals set decision_note = coalesce(decision_note, '') where id = ${id} and status = 'pending' returning *`;
  if (!p) throw new Error("Already decided");
  if (new Date(p.created_at as string).getTime() < Date.now() - 24 * 3600_000) {
    await db()`update approvals set status = 'expired', decided_by = ${staffId}, decided_at = now() where id = ${id}`;
    if (p.agent_action_id) await db()`update agent_actions set outcome = 'expired' where id = ${p.agent_action_id}`;
    throw new Error("Proposal expired (24 h)");
  }
  if (p.proposer_id && String(p.proposer_id) === staffId) throw new Error("You can't approve your own proposal");
  if (String(p.action).startsWith("agent.")) {
    const { executeAgentProposal } = await import("./agent-runtime");
    await executeAgentProposal({ id, proposer_id: p.proposer_id as string, payload: p.payload as never, agent_action_id: (p.agent_action_id as string) ?? null }, approve, edited);
  } else if (approve) await runOperation(p.action as string, p.payload, { type: "agent", id: p.proposer_id as string }, `Approved proposal ${id}${note ? `: ${note}` : ""}`);
  await db()`update approvals set status = ${approve ? "approved" : "rejected"}, decided_by = ${staffId}, decided_at = now(), decision_note = ${note ?? null} where id = ${id} and status = 'pending'`;
}
