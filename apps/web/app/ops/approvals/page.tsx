import { db } from "@dfrnt/db";
import { AdminShell, input } from "@/components/Admin";
import { requireStaff } from "@/lib/auth";
import { approveProposal, rejectProposal } from "../actions";
import { TOOL } from "@/lib/agent-tools";

export const dynamic = "force-dynamic";

export default async function Approvals({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const me = await requireStaff();
  const { error } = await searchParams;
  const pending = await db()`select id, created_at, proposer_id, action, payload, rationale from approvals where status = 'pending' order by created_at`;
  const recent = await db()`select a.action, a.proposer_id, a.status, a.decided_at, s.name from approvals a left join staff s on s.id = a.decided_by where a.status <> 'pending' order by a.decided_at desc limit 20`;
  const agents = await db()`select id, name, max_tier, enabled from agents order by id`;
  return (
    <AdminShell who={me.name} area="ops">
      <h1 style={{ fontSize: 28 }}>Approvals</h1>
      <p className="muted">Agents propose; people decide. Edit a message before sending if you like: edits count against the agent when it asks to be promoted. Proposals expire after 24 hours.</p>
      {error && <div className="note">{error}</div>}
      {pending.length === 0 && <div className="ok">Nothing waiting.</div>}
      {pending.map((p) => {
        const ag = String(p.action).startsWith("agent.") ? p.payload as { tool: string; input: Record<string, unknown> } : null;
        const tool = ag ? TOOL[ag.tool] : undefined;
        const agentName = (agents.find((a) => a.id === p.proposer_id)?.name as string) ?? (p.proposer_id as string);
        return (
        <form key={p.id as string} action={approveProposal} className="card" style={{ marginBottom: 12 }}>
          <input type="hidden" name="id" value={p.id as string} />
          <span className="small muted">{agentName.toUpperCase()} · {(p.created_at as Date).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Australia/Brisbane" })}</span>
          <strong>{tool ? tool.label : `${p.action as string} · from ${p.proposer_id as string}`}</strong>
          {tool?.editable
            ? <textarea name={`edit_${tool.editable}`} defaultValue={String(ag!.input[tool.editable] ?? "")} style={{ ...input, minHeight: 90 }} />
            : tool ? <span className="small">{tool.preview(ag!.input)}</span>
            : <pre className="small" style={{ whiteSpace: "pre-wrap", background: "var(--mint)", padding: 8, borderRadius: 6 }}>{JSON.stringify(p.payload, null, 2)}</pre>}
          <span className="small muted">Why: {p.rationale as string}</span>
          {ag?.input.quote_id ? <span className="small"><a href={`/ops/job/${ag.input.quote_id as string}`} target="_blank">Open the job</a></span> : null}
          <input name="note" placeholder="Note (optional)" style={input} />
          <div style={{ display: "flex", gap: 8 }}><button className="btn sm" type="submit">{tool?.editable ? "Approve and send" : "Approve and run"}</button><button className="btn ghost sm" formAction={rejectProposal}>Reject</button></div>
        </form>); })}
      <h3 style={{ marginTop: 24 }}>Agents</h3>
      <table className="lines"><tbody>{agents.map((a) => <tr key={a.id as string}><td>{a.name as string}</td><td>max tier {a.max_tier as string}</td><td>{a.enabled ? "on" : "off"}</td></tr>)}</tbody></table>
      <h3 style={{ marginTop: 24 }}>Recent decisions</h3>
      <table className="lines small"><tbody>{recent.map((r, i) => <tr key={i}><td>{r.action as string}</td><td>{r.proposer_id as string}</td><td>{r.status as string}</td><td>{r.name as string}</td></tr>)}</tbody></table>
    </AdminShell>
  );
}
