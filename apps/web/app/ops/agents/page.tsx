import Link from "next/link";
import { db } from "@dfrnt/db";
import { AdminShell, input } from "@/components/Admin";
import { requireStaff } from "@/lib/auth";
import { anthropicReady } from "@/lib/agent-runtime";
import { issueKey, toggleAgent, revokeKey } from "./actions";

export const dynamic = "force-dynamic";
const aud = (n: number) => `$${n.toLocaleString("en-AU", { maximumFractionDigits: 0 })}`;

/** G2: the control room. One row per agent; tap for everything about it. */
export default async function Agents({ searchParams }: { searchParams: Promise<{ key?: string; error?: string }> }) {
  const me = await requireStaff();
  const sp = await searchParams;
  const owner = me.roles.includes("owner");
  const agents = await db()`select a.id, a.name, a.description, a.owner_name, a.enabled, a.monthly_spend_cap_aud::float8 cap,
      (select coalesce(sum(cost_aud), 0)::float8 from agent_runs r where r.agent_id = a.id and not r.test and r.started_at >= date_trunc('month', now())) spent,
      (select count(*)::int from agent_actions x where x.agent_id = a.id and x.created_at >= date_trunc('month', now()) and x.outcome <> 'blocked') actions,
      (select count(*)::int from agent_actions x where x.agent_id = a.id and x.outcome in ('approved','rejected') and x.created_at >= date_trunc('month', now())) decided,
      (select count(*)::int from agent_actions x where x.agent_id = a.id and x.outcome = 'approved' and not x.edited and x.created_at >= date_trunc('month', now())) clean,
      (select count(*)::int from agent_permissions p where p.agent_id = a.id and p.mode = 'act') acting,
      (select count(*)::int from agent_permissions p where p.agent_id = a.id) tools,
      (select passed || ' of ' || total from agent_test_runs t where t.agent_id = a.id order by ran_at desc limit 1) tests
    from agents a order by (select count(*) from agent_permissions p where p.agent_id = a.id) desc, a.id`;
  const keys = await db()`select k.id, k.label, k.agent_id, k.created_at, k.revoked_at from api_keys k order by k.created_at desc`;
  const tot = agents.reduce((t, a) => ({ actions: t.actions + (a.actions as number), spent: t.spent + (a.spent as number), cap: t.cap + ((a.tools as number) ? (a.cap as number) : 0), decided: t.decided + (a.decided as number), clean: t.clean + (a.clean as number) }), { actions: 0, spent: 0, cap: 0, decided: 0, clean: 0 });
  return (
    <AdminShell who={me.name} area="ops">
      <h1 style={{ fontSize: 28 }}>Agents</h1>
      <p className="muted small">This month: {tot.actions} actions{tot.decided ? ` · ${Math.round((tot.clean / tot.decided) * 100)} % approved unedited` : ""} · {aud(tot.spent)} of {aud(tot.cap)} budget (estimated).</p>
      {!anthropicReady() && <div className="note">Waiting for the Claude key: add ANTHROPIC_API_KEY in Vercel. Until then agents can be set up but don&apos;t run.</div>}
      {sp.error && <div className="note">{sp.error}</div>}
      {agents.map((a) => {
        const built = (a.tools as number) > 0;
        const pct = (a.cap as number) > 0 ? Math.min(100, Math.round(((a.spent as number) / (a.cap as number)) * 100)) : 0;
        return (
          <div key={a.id as string} className="card" style={{ marginBottom: 10, opacity: built ? 1 : 0.55, display: "grid", gridTemplateColumns: "minmax(200px,2fr) repeat(auto-fit,minmax(110px,1fr))", gap: 10, alignItems: "center" }}>
            <div>{built ? <Link href={`/ops/agents/${a.id}`}><strong>{a.name as string}</strong></Link> : <strong>{a.name as string}</strong>}
              <br /><span className="small muted">{(a.description as string) ?? "Not built yet"}{a.owner_name ? ` · ${a.owner_name}` : ""}</span></div>
            <div>{built ? <form action={toggleAgent}><input type="hidden" name="id" value={a.id as string} />
              <button className={a.enabled ? "btn sm" : "btn ghost sm"} type="submit" disabled={!a.enabled && !owner}>{a.enabled ? "● On" : "○ Off"}</button></form> : <span className="small muted">Not built yet</span>}</div>
            <div className="small">{built ? <>{(a.acting as number) ? `${a.acting} acting · ` : ""}rest proposing</> : "—"}</div>
            <div className="small">{built ? <>{a.actions as number} actions{(a.decided as number) ? <><br />{Math.round(((a.clean as number) / (a.decided as number)) * 100)} % approved</> : null}</> : "—"}</div>
            <div className="small">{built ? <>{aud(a.spent as number)} / {aud(a.cap as number)}<div style={{ height: 6, background: "var(--line)", borderRadius: 3, marginTop: 4 }}><div style={{ width: `${pct}%`, height: 6, background: "var(--teal)", borderRadius: 3 }} /></div></> : "—"}</div>
            <div className="small muted">{built ? (a.tests ? `Tests ${a.tests}` : "Tests not run") : ""}</div>
          </div>);
      })}
      <details style={{ marginTop: 24 }}><summary className="small muted">Developer keys (outside agents connecting over MCP)</summary>
        {sp.key && <div className="ok"><strong>New key — copy it now, it won&apos;t be shown again:</strong><br /><code style={{ wordBreak: "break-all" }}>{sp.key}</code></div>}
        {owner && <form action={issueKey} style={{ display: "flex", gap: 6, margin: "8px 0" }}>
          <select name="agent" style={{ ...input, width: 160 }}>{agents.map((a) => <option key={a.id as string} value={a.id as string}>{a.name as string}</option>)}</select>
          <input name="label" placeholder="Key label" style={{ ...input, width: 160 }} /><button className="btn ghost sm">Issue key</button></form>}
        <table className="lines small"><tbody>{keys.map((k) => <tr key={k.id as string}><td>{k.label as string}</td><td>{k.agent_id as string}</td><td>{k.revoked_at ? "revoked" : "active"}</td>
          <td>{owner && !k.revoked_at && <form action={revokeKey}><input type="hidden" name="id" value={k.id as string} /><button className="btn ghost sm">Revoke</button></form>}</td></tr>)}</tbody></table>
      </details>
    </AdminShell>
  );
}
