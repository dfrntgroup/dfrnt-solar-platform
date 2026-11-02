import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@dfrnt/db";
import { AdminShell, input } from "@/components/Admin";
import { requireStaff } from "@/lib/auth";
import { LOCKED_RULES, toolsFor } from "@/lib/agent-tools";
import { anthropicReady, getAgent, monthSpend, permissionsOf, promotionStats } from "@/lib/agent-runtime";
import { promote, runTests, saveInstructions, saveLimits, setPermission, toggleAgent, undoAction } from "../actions";

export const dynamic = "force-dynamic";
const t = (d: Date) => d.toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Australia/Brisbane" });

/** G2: everything about one agent on one page. */
export default async function AgentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const me = await requireStaff();
  const { id } = await params; const sp = await searchParams;
  const a = await getAgent(id);
  const tools = toolsFor(id);
  if (!a || !tools.length) notFound();
  const owner = me.roles.includes("owner");
  const [perms, stats, spent] = await Promise.all([permissionsOf(id), promotionStats(id), monthSpend(id)]);
  const [test] = await db()`select passed, total, results, reason, ran_at from agent_test_runs where agent_id = ${id} order by ran_at desc limit 1`;
  const log = await db()`select x.id, x.tool, x.outcome, x.input, x.rationale, x.reason, x.created_at, x.undone_at from agent_actions x where x.agent_id = ${id} order by x.created_at desc limit 40`;
  const runs = await db()`select status, trigger, summary, cost_aud::float8 cost, started_at from agent_runs where agent_id = ${id} and not test order by started_at desc limit 8`;
  const locked = [...LOCKED_RULES.all!, ...(LOCKED_RULES[id] ?? [])];
  const label = Object.fromEntries(tools.map((x) => [x.name, x.label]));
  return (
    <AdminShell who={me.name} area="ops">
      <p className="small"><Link href="/ops/agents">← Agents</Link></p>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div><h1 style={{ fontSize: 28, margin: 0 }}>{a.name}</h1>
          <p className="small muted" style={{ margin: 0 }}>{a.description} · Owner: {(await db()`select owner_name from agents where id = ${id}`)[0]?.owner_name as string ?? "—"} · Model: {a.model} · Works {a.hours.start}:00–{a.hours.end}:00</p></div>
        <form action={toggleAgent}><input type="hidden" name="id" value={id} /><input type="hidden" name="back" value={`/ops/agents/${id}`} />
          <button className={a.enabled ? "btn" : "btn ghost"} type="submit" disabled={!a.enabled && !owner}>{a.enabled ? "● On — switch off" : "○ Off — switch on"}</button></form>
      </div>
      {!anthropicReady() && <div className="note" style={{ marginTop: 10 }}>Waiting for the Claude key (ANTHROPIC_API_KEY in Vercel). Settings save; nothing runs yet.</div>}
      {sp.error && <div className="note" style={{ marginTop: 10 }}>{sp.error}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12, marginTop: 14 }}>
        <div className="card"><strong>What it can do</strong>
          <span className="small muted">{owner ? "Tap to change. Act = runs straight away; Propose = goes to Approvals." : "Only the owner changes these."}</span>
          <table className="lines small"><tbody>{tools.map((x) => {
            const mode = perms[x.name] ?? "off";
            const st = stats.find((r) => r.tool === x.name); const decided = (st?.decided as number) ?? 0, clean = (st?.clean as number) ?? 0;
            const ready = mode === "propose" && decided >= 50 && clean / decided >= 0.98;
            return <tr key={x.name}><td>{x.label}{x.kind === "write" && mode === "propose" && decided > 0 && <><br /><span className="muted">{clean} of {decided} approved unedited{ready ? " · ready to promote" : decided < 50 ? ` · ${50 - decided} more to go` : ""}</span></>}</td>
              <td className="r" style={{ whiteSpace: "nowrap" }}>{(["off", "propose", "act"] as const).map((m) => (
                <form key={m} action={setPermission} style={{ display: "inline" }}><input type="hidden" name="id" value={id} /><input type="hidden" name="tool" value={x.name} /><input type="hidden" name="mode" value={m} />
                  <button type="submit" className={`chip${mode === m ? " on" : ""}`} disabled={!owner || mode === m || (m === "act" && x.kind === "write" && !ready && mode !== "act")} title={m === "act" && x.kind === "write" && !ready ? "Earned at 50+ proposals with 98 % approved unedited" : ""}>{m === "off" ? "Off" : m === "propose" ? "Propose" : "Act"}</button></form>))}
                {ready && owner && <form action={promote} style={{ display: "inline" }}><input type="hidden" name="id" value={id} /><input type="hidden" name="tool" value={x.name} /><button className="btn sm" type="submit">Promote</button></form>}</td></tr>;
          })}</tbody></table>
        </div>

        <form action={saveLimits} className="card"><input type="hidden" name="id" value={id} />
          <strong>Limits</strong>
          <table className="lines small"><tbody>
            <tr><td>Refunds · discounts · spending</td><td className="r"><strong>Never</strong> (no tool exists)</td></tr>
            <tr><td>Messages per person per day</td><td className="r"><input name="messages_per_customer_day" defaultValue={a.limits.messages_per_customer_day} style={{ ...input, width: 70 }} disabled={!owner} /></td></tr>
            <tr><td>Works from / until (hour)</td><td className="r"><input name="start" defaultValue={a.hours.start} style={{ ...input, width: 60 }} disabled={!owner} /> – <input name="end" defaultValue={a.hours.end} style={{ ...input, width: 60 }} disabled={!owner} /></td></tr>
            <tr><td>Monthly budget (AUD)</td><td className="r"><input name="cap" defaultValue={a.monthly_spend_cap_aud} style={{ ...input, width: 90 }} disabled={!owner} /></td></tr>
            <tr><td>Alert at (% of budget)</td><td className="r"><input name="alert_pct" defaultValue={a.alert_pct} style={{ ...input, width: 70 }} disabled={!owner} /></td></tr>
            <tr><td>Used this month (estimated)</td><td className="r"><strong>${spent.toFixed(2)}</strong></td></tr>
          </tbody></table>
          {owner && <button className="btn sm" type="submit">Save limits</button>}
        </form>

        <form action={saveInstructions} className="card"><input type="hidden" name="id" value={id} />
          <strong>Instructions</strong><span className="small muted">Plain English. Saving re-runs the tests.</span>
          <textarea name="instructions" defaultValue={a.instructions} style={{ ...input, minHeight: 160 }} />
          <button className="btn sm" type="submit">Save instructions</button>
        </form>

        <div className="card"><strong>Locked rules</strong><span className="small muted">Built into the platform. Can&apos;t be changed here.</span>
          <ul className="small muted" style={{ paddingLeft: 18, margin: "6px 0 0" }}>{locked.map((r) => <li key={r} style={{ marginBottom: 4 }}>🔒 {r}</li>)}</ul></div>

        <div className="card"><strong>Tests</strong>
          {test ? <span className="small"><strong style={{ color: (test.passed as number) === (test.total as number) ? "var(--teal)" : "#b3261e" }}>{test.passed as number} of {test.total as number} passed</strong> · {t(test.ran_at as Date)} · {test.reason as string}</span> : <span className="small muted">Not run yet.</span>}
          {test && <details><summary className="small">Each test</summary><table className="lines small"><tbody>{(test.results as { name: string; pass: boolean; why: string; calls: string[] }[]).map((r) =>
            <tr key={r.name}><td>{r.pass ? "✓" : "✗"} {r.name}</td><td className="muted">{r.pass ? r.calls.join(", ") : r.why}</td></tr>)}</tbody></table></details>}
          <form action={runTests}><input type="hidden" name="id" value={id} /><button className="btn ghost sm" type="submit" disabled={!anthropicReady()}>Run tests now</button></form>
        </div>

        <div className="card"><strong>Recent runs</strong>
          <table className="lines small"><tbody>{runs.map((r, i) => <tr key={i}><td>{t(r.started_at as Date)}</td><td>{r.trigger as string}</td><td>{r.status as string}{r.summary ? ` · ${String(r.summary).slice(0, 90)}` : ""}</td><td className="r">${(r.cost as number).toFixed(3)}</td></tr>)}
            {!runs.length && <tr><td className="muted">No runs yet.</td></tr>}</tbody></table></div>
      </div>

      <h2 style={{ marginTop: 20 }}>Log</h2>
      <table className="lines small"><tbody>{log.map((x) => <tr key={x.id as string}>
        <td style={{ whiteSpace: "nowrap" }}>{t(x.created_at as Date)}</td>
        <td><strong>{label[x.tool as string] ?? x.tool}</strong> · {x.outcome as string}{x.undone_at ? " · undone" : ""}<br />
          <span className="muted">{String((x.input as Record<string, unknown>)?.body ?? (x.input as Record<string, unknown>)?.note ?? (x.input as Record<string, unknown>)?.why ?? "").slice(0, 200)}</span>
          {x.reason ? <><br /><span className="muted">⚑ {x.reason as string}</span></> : null}
          {x.rationale ? <><br /><span className="muted">Why: {String(x.rationale).slice(0, 200)}</span></> : null}</td>
        <td className="r">{["acted", "approved"].includes(x.outcome as string) && !x.undone_at && tools.find((tt) => tt.name === x.tool)?.undo
          ? <form action={undoAction}><input type="hidden" name="id" value={id} /><input type="hidden" name="action" value={x.id as string} /><button className="btn ghost sm" type="submit">Undo</button></form> : null}</td>
      </tr>)}{!log.length && <tr><td className="muted">Nothing yet.</td></tr>}</tbody></table>
    </AdminShell>
  );
}
