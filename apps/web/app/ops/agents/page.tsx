import { db } from "@dfrnt/db";
import { AdminShell, input } from "@/components/Admin";
import { requireStaff } from "@/lib/auth";
import { issueKey, toggleAgent, revokeKey } from "./actions";

export const dynamic = "force-dynamic";

export default async function Agents({ searchParams }: { searchParams: Promise<{ key?: string; error?: string }> }) {
  const me = await requireStaff();
  const sp = await searchParams;
  const owner = me.roles.includes("owner");
  const agents = await db()`select id, name, max_tier, enabled, monthly_spend_cap_aud::float8 cap from agents order by id`;
  const keys = await db()`select k.id, k.label, k.agent_id, k.created_at, k.revoked_at from api_keys k order by k.created_at desc`;
  return (
    <AdminShell who={me.name} area="ops">
      <h1 style={{ fontSize: 28 }}>Agents</h1>
      <p className="muted">Each agent has its own key and a maximum tier. All are off until you switch them on. Connect an agent to <code>/api/mcp</code> with its key.</p>
      {sp.key && <div className="ok"><strong>New key — copy it now, it won&apos;t be shown again:</strong><br /><code style={{ wordBreak: "break-all" }}>{sp.key}</code></div>}
      {sp.error && <div className="note">{sp.error}</div>}
      <table className="lines" style={{ marginTop: 12 }}><tbody>{agents.map((a) => (
        <tr key={a.id as string}><td><strong>{a.name as string}</strong><br /><span className="small muted">{a.id as string} · max tier {a.max_tier as string}</span></td>
          <td>{a.enabled ? "On" : "Off"}</td>
          <td>{owner && <form action={toggleAgent}><input type="hidden" name="id" value={a.id as string} /><button className="btn ghost sm">{a.enabled ? "Switch off" : "Switch on"}</button></form>}</td>
          <td>{owner && <form action={issueKey} style={{ display: "flex", gap: 6 }}><input type="hidden" name="agent" value={a.id as string} /><input name="label" placeholder="Key label" style={{ ...input, width: 140 }} /><button className="btn sm">New key</button></form>}</td></tr>))}</tbody></table>
      <h3 style={{ marginTop: 24 }}>Keys</h3>
      <table className="lines small"><tbody>{keys.map((k) => <tr key={k.id as string}><td>{k.label as string}</td><td>{k.agent_id as string}</td><td>{k.revoked_at ? "revoked" : "active"}</td>
        <td>{owner && !k.revoked_at && <form action={revokeKey}><input type="hidden" name="id" value={k.id as string} /><button className="btn ghost sm">Revoke</button></form>}</td></tr>)}</tbody></table>
    </AdminShell>
  );
}
