import Link from "next/link";
import { db } from "@dfrnt/db";
import { AdminShell, input } from "@/components/Admin";
import { requireStaff } from "@/lib/auth";
import { getSetting } from "@/lib/settings";
import { fiskilReady } from "@/lib/fiskil";
import { energyRepull, energyRevoked, energySave } from "../actions";

export const dynamic = "force-dynamic";

/** S1–S7 in Ops: switch, yield table, standard tariff, every connection, which sizing path was used, after-install flags. */
export default async function Energy({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const me = await requireStaff();
  const sp = await searchParams;
  const e = await getSetting("energy");
  const links = await db()`select l.id, l.token, l.email, l.postcode, l.status, l.path, l.fail_reason, l.meter_type, l.revoke_status, l.created_at, l.sizing->'rec'->>'title' rec,
    l.quote_id, q.title qtitle from energy_links l left join quotes q on q.id = l.quote_id order by l.created_at desc limit 60`;
  const paths = await db()`select coalesce(path, status) p, count(*)::int n from energy_links where created_at > now() - interval '90 days' group by 1 order by 2 desc`;
  const alerts = await db()`select id, title, customer_name, energy_alert from quotes where energy_alert is not null order by (energy_alert->>'raised_at') desc limit 10`;
  const manual = links.filter((l) => l.status === "disconnected" && l.revoke_status === "manual");
  return (
    <AdminShell who={me.name} area="ops">
      <h1 style={{ fontSize: 28 }}>Real usage</h1>
      {sp.error && <div className="note">{sp.error}</div>}
      {!fiskilReady() && <div className="note">Fiskil keys missing in Vercel (FISKIL_CLIENT_ID, FISKIL_CLIENT_SECRET).</div>}
      <p className="small muted">Last 90 days by sizing path: {paths.length ? paths.map((p) => `${p.p} ${p.n}`).join(" · ") : "none yet"}. Interval = real half-hour data; totals = basic meter; bill = fell back to the bill estimate.</p>
      {manual.length > 0 && <div className="note"><strong>Revoke in the Fiskil console:</strong> {manual.map((m) => <span key={m.id as string}> {m.email as string} <form action={energyRevoked} style={{ display: "inline" }}><input type="hidden" name="id" value={m.id as string} /><button className="btn ghost sm">Done</button></form></span>)}</div>}
      {alerts.length > 0 && <div className="note"><strong>After-install flags:</strong> {alerts.map((a) => { const x = a.energy_alert as { ym: string; expected: number; actual: number }; return <span key={a.id as string}> <Link href={`/ops/job/${a.id}`}>{(a.customer_name as string) ?? a.title}</Link> {x.ym}: {x.actual} kWh vs {x.expected} expected ·</span>; })}</div>}
      <form action={energySave} className="card" style={{ marginBottom: 12 }}>
        <strong>Settings</strong>
        <label className="small">Who sees “Use my real usage”
          <select name="mode" defaultValue={e.mode} style={input}><option value="off">Nobody</option><option value="preview">Preview only (add ?usage=1 to the page address)</option><option value="all">Everyone (needs Fiskil live access)</option></select></label>
        <span className="small muted">Average daily output per kW of panels (Clean Energy Council). Postcodes map to the nearest city; edit if an area runs higher or lower.</span>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8 }}>
          {Object.entries(e.yields).map(([k, y]) => <label key={k} className="small">{y.city}<input name={`y_${k}`} defaultValue={y.kwh_per_kw} inputMode="decimal" style={input} /></label>)}
        </div>
        <span className="small muted">Standard tariff (used when a retailer plan has no published rates), cents inc GST.</span>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8 }}>
          <label className="small">Usage c/kWh<input name="usage_c" defaultValue={e.standard.usage_c} style={input} /></label>
          <label className="small">Supply c/day<input name="supply_c_day" defaultValue={e.standard.supply_c_day} style={input} /></label>
          <label className="small">Feed-in c/kWh<input name="fit_c" defaultValue={e.standard.fit_c} style={input} /></label>
          <label className="small">Controlled load c/kWh<input name="controlled_c" defaultValue={e.standard.controlled_c} style={input} /></label>
        </div>
        <button className="btn sm">Save</button>
      </form>
      <h3>Connections</h3>
      <table className="lines small"><tbody>
        {links.length ? links.map((l) => <tr key={l.id as string}>
          <td>{new Date(l.created_at as string).toLocaleDateString("en-AU")}</td><td>{l.email as string}<br /><span className="muted">{l.postcode as string} · {l.meter_type as string ?? ""}</span></td>
          <td>{l.status as string}{l.path ? ` · ${l.path}` : ""}{l.fail_reason ? <><br /><span className="muted">{String(l.fail_reason).slice(0, 80)}</span></> : null}</td>
          <td>{(l.rec as string) ?? "—"}</td>
          <td>{l.quote_id ? <Link href={`/ops/job/${l.quote_id}`}>{(l.qtitle as string) ?? "Job"}</Link> : "Estimate"}</td>
          <td><Link href={`/usage/${l.token}`}>Open</Link> <form action={energyRepull} style={{ display: "inline" }}><input type="hidden" name="id" value={l.id as string} /><button className="btn ghost sm">Re-pull</button></form></td>
        </tr>) : <tr><td className="muted">No connections yet.</td></tr>}
      </tbody></table>
    </AdminShell>
  );
}
