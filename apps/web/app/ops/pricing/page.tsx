import { db } from "@dfrnt/db";
import { installerRate, priceSystem } from "@dfrnt/engine";
import { AdminShell, input } from "@/components/Admin";
import { requireStaff } from "@/lib/auth";
import { todayAEST } from "@/lib/api";
import { pricingData } from "@/lib/pricing-data";
import { aud, aud2 } from "@/lib/site";
import { restoreVersion, saveCatalogue, saveCosts, saveMargins, saveMenu, saveRebates } from "./actions";

export const dynamic = "force-dynamic";

export default async function Pricing({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const me = await requireStaff();
  const sp = await searchParams;
  const d = await pricingData();
  const history = await db()`select id, kind, note, created_by, created_at from config_versions order by id desc limit 30`;
  const list = d.catalogue.systems.map((s) => ({ s, q: priceSystem(s, { postcode: "4551", asOf: todayAEST() }, d) }));
  // P7: is a home pattern safe to price on sight? Jobs the installer confirmed unchanged say yes; jobs they added lines to say no.
  const readiness = await db()`select i.business_name, q.scope_result->>'pattern' pattern, bool_and((q.scope_result->>'in_scope')::boolean) in_scope,
      count(*)::int priced, count(*) filter (where q.priced_by in ('installer','ops') and not coalesce(q.price_changed, false))::int unchanged,
      count(*) filter (where coalesce(q.price_changed, false))::int changed, count(*) filter (where q.priced_by = 'instant')::int instant
    from quotes q join installers i on i.id = q.installer_id
    where q.priced_by is not null and q.scope_result is not null and not i.is_test
    group by i.business_name, q.scope_result->>'pattern' order by i.business_name, priced desc`;
  const pm = await (await import("@/lib/settings")).getSetting("pricing_mode");
  const note = <input name="note" placeholder="What changed and why (required)" style={input} required />;
  const sm = { ...input, width: 110 };
  return (
    <AdminShell who={me.name} area="ops">
      <h1 style={{ fontSize: 28 }}>Pricing</h1>
      <p className="muted">Every change is a new version and applies to new quotes only; secured quotes keep the version they were priced on. A change is refused if any system would stop pricing.</p>
      {sp.error && <div className="note">{sp.error}</div>}
      {sp.saved && <div className="ok">Saved. New quotes use it now.</div>}
      <p className="small muted">Live versions: {Object.entries(d.versions).map(([k, v]) => `${k} ${v}`).join(" · ")}</p>

      <h2 style={{ marginTop: 20 }}>Instant-price readiness</h2>
      <p className="muted small">Pricing mode is <strong>{pm.installer_confirms_all ? "installer confirms every job" : "instant for homes inside the installer's scope"}</strong> (Ops → Settings). Each row is one installer and one home pattern. &ldquo;Unchanged&rdquo; means the installer confirmed the standard price from the photos without adding anything. When a pattern that the scope rules call in-scope sits at 90 %+ unchanged over 20+ jobs, it&apos;s safe to price on sight.</p>
      {readiness.length === 0 ? <p className="small muted">No priced jobs yet. This fills as installers confirm prices.</p> : (
        <table className="lines small"><thead><tr><th>Installer</th><th>Home pattern</th><th>Scope</th><th className="r">Priced</th><th className="r">Unchanged</th><th className="r">Changed</th><th className="r">Instant</th><th className="r">Unchanged %</th></tr></thead><tbody>
          {readiness.map((r, i) => { const human = (r.unchanged as number) + (r.changed as number); const pct = human ? Math.round(((r.unchanged as number) / human) * 100) : null;
            return <tr key={i}><td>{r.business_name as string}</td><td>{(r.pattern as string) ?? "—"}</td><td>{r.in_scope ? "in scope" : "exception"}</td><td className="r">{r.priced as number}</td><td className="r">{r.unchanged as number}</td><td className="r">{r.changed as number}</td><td className="r">{r.instant as number}</td>
              <td className="r">{pct === null ? "—" : <strong style={{ color: pct >= 90 && human >= 20 ? "var(--teal)" : undefined }}>{pct} %</strong>}</td></tr>; })}
        </tbody></table>)}

      <h2 style={{ marginTop: 20 }}>Effect: every system at 4551</h2>
      <table className="lines small"><tbody>{list.map(({ s, q }) => <tr key={s.slug}><td>{s.brand} · {s.title}</td><td className="r">{aud(q.stack.price_inc_gst)}</td><td className="r"><strong>{aud(q.stack.amount_payable)}</strong></td><td className="r">{q.stack.gross_margin_pct}% GM</td></tr>)}</tbody></table>

      <form action={saveMargins} className="card" style={{ marginTop: 20 }}>
        <h3>Margins (on sell)</h3>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <label className="small">Hardware %<input name="hardware" defaultValue={(d.margins.hardware * 100).toFixed(1)} style={sm} /></label>
          <label className="small">Parts / BOS %<input name="bos" defaultValue={(d.margins.bos * 100).toFixed(1)} style={sm} /></label>
          <label className="small">Installation + variations %<input name="installation" defaultValue={(d.margins.installation * 100).toFixed(1)} style={sm} /></label>
        </div>{note}<button className="btn sm">Publish margins</button>
      </form>

      <form action={saveRebates} className="card" style={{ marginTop: 16 }}>
        <h3>Rebates</h3>
        <div style={{ display: "flex", gap: 12 }}>
          <label className="small">Fixed STC rate ($)<input name="stc_rate" defaultValue={d.rebates.stc_rate} style={sm} /></label>
          <label className="small">Price lock (days)<input name="lock_days" defaultValue={d.rebates.lock_days} style={sm} /></label>
        </div>
        <label className="small">Solar deeming schedule<textarea name="solar_deeming" defaultValue={JSON.stringify(d.rebates.solar_deeming)} style={{ ...input, minHeight: 70, fontFamily: "monospace" }} /></label>
        <label className="small">Battery factor schedule<textarea name="battery_factor" defaultValue={JSON.stringify(d.rebates.battery_factor)} style={{ ...input, minHeight: 90, fontFamily: "monospace" }} /></label>
        {note}<button className="btn sm">Publish rebates</button>
      </form>

      <form action={saveCosts} className="card" style={{ marginTop: 16 }}>
        <h3>Component costs (ex GST, what we pay)</h3>
        <table className="lines small"><tbody>{Object.entries(d.costs.items).map(([sku, it]) => (
          <tr key={sku}><td>{sku}<br /><span className="muted">{it.margin_class}</span></td>
            <td><input name={`cost_${sku}`} defaultValue={it.cost_ex_gst ?? ""} style={sm} /></td>
            <td><input name={`src_${sku}`} defaultValue={it.source} style={sm} /></td>
            <td className="r muted">{it.cost_ex_gst != null ? `sells ${aud2(it.cost_ex_gst / (1 - (it.margin_class === "bos" ? d.margins.bos : d.margins.hardware)))}` : "price pending"}</td></tr>))}</tbody></table>
        <div style={{ display: "flex", gap: 8 }}><input name="new_sku" placeholder="Add SKU" style={sm} /><input name="new_cost" placeholder="Cost" style={sm} /><select name="new_class" style={sm}><option value="hardware">hardware</option><option value="bos">bos</option></select></div>
        {note}<button className="btn sm">Publish costs</button>
      </form>

      <form action={saveMenu} className="card" style={{ marginTop: 16 }}>
        <h3>Labour menu (menu rate; installer is paid menu ÷ 1.1)</h3>
        <table className="lines small"><tbody>{d.menu.items.map((i) => (
          <tr key={i.code}><td>{i.code}<br /><span className="muted">{i.description}</span></td><td><input name={`rate_${i.code}`} defaultValue={i.menu_rate} style={sm} /></td>
            <td className="r muted">installer {aud2(installerRate(i))} · sells {aud2(installerRate(i) / (1 - d.margins.installation))}</td></tr>))}</tbody></table>
        {note}<button className="btn sm">Publish labour menu</button>
      </form>

      <form action={saveCatalogue} className="card" style={{ marginTop: 16 }}>
        <h3>Catalogue (systems on the site)</h3>
        <span className="small muted">Each system is a saved configuration. Edit, add or remove, then publish. Every system is test-priced before it goes live.</span>
        <textarea name="catalogue" defaultValue={JSON.stringify(d.catalogue, null, 1)} style={{ ...input, minHeight: 360, fontFamily: "monospace", fontSize: 12 }} />
        {note}<button className="btn sm">Publish catalogue</button>
      </form>

      <h2 style={{ marginTop: 24 }}>History</h2>
      <table className="lines small"><tbody>{history.map((h) => <tr key={h.id as number}><td>#{h.id as number} {h.kind as string}</td><td>{h.note as string}</td><td>{h.created_by as string}</td>
        <td><form action={restoreVersion}><input type="hidden" name="id" value={h.id as number} /><button className="btn ghost sm">Restore</button></form></td></tr>)}</tbody></table>
    </AdminShell>
  );
}
