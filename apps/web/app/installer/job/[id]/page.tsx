import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@dfrnt/db";
import { AdminShell, input } from "@/components/Admin";
import { requireInstaller } from "@/lib/auth";
import { getQuoteById } from "@/lib/jobs";
import { photoUrl } from "@/lib/storage";
import { pricingData } from "@/lib/pricing-data";
import { aud2, longDate } from "@/lib/site";
import { confirmPrice, installerStage, installerVariation, setTechnician } from "../../actions";

export const dynamic = "force-dynamic";

export default async function InstallerJob({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ as?: string; error?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const me = await requireInstaller(sp.as);
  const q = await getQuoteById(id);
  if (!q || q.installer_id !== me.id) notFound();
  const p = q.snapshot ?? q.result;
  const { menu } = await pricingData();
  const photos = await db()`select kind, path from quote_photos where quote_id = ${id}`;
  const urls = await Promise.all(photos.map(async (ph) => ({ kind: ph.kind as string, url: await photoUrl(ph.path as string) })));
  const site = q.site;
  const techs = await db()`select id, name, is_default from technicians where installer_id = ${me.id} and active order by is_default desc, name`;
  const [curTech] = await db()`select technician_id from quotes where id = ${id}`;
  const hid = <><input type="hidden" name="id" value={id} />{me.viaStaff && <input type="hidden" name="as" value={me.id} />}</>;
  const parts = p.config.bom.filter((b) => !b.included);
  return (
    <AdminShell who={me.business_name} area="installer">
      <p className="small"><Link href={`/installer${me.viaStaff ? `?as=${me.id}` : ""}`}>← My jobs</Link></p>
      <h1 style={{ fontSize: 26 }}>{q.customer_name} · {q.status}</h1>
      {sp.error && <div className="note">{sp.error}</div>}
      <p>{site ? `${site.address.unit ? site.address.unit + "/" : ""}${site.address.line1}, ${site.address.suburb} ${site.address.postcode}` : ""} · {q.customer_phone}</p>
      {q.install_date && <div className="ok">Install {longDate(q.install_date)}</div>}
      <div className="pdp" style={{ marginTop: 16 }}>
        <div>
          <h3>System</h3><p>{p.config.summary}</p>
          <table className="lines"><tbody>{parts.map((b) => <tr key={b.sku}><td>{b.description}</td><td className="r">× {b.qty}</td></tr>)}</tbody></table>
          {site && <><h3 style={{ marginTop: 16 }}>Site answers</h3><p className="small">{String(site.phases)}-phase · {site.roofType} roof · {site.storeys} storey · battery {site.batteryLocation.replace("_", " ")} · switchboard {site.switchboard}</p></>}
          <h3 style={{ marginTop: 16 }}>Photos</h3>
          <div className="filters">{urls.map((u, i) => u.url ? <a key={i} className="chip" href={u.url} target="_blank">{u.kind}</a> : <span key={i} className="chip">{u.kind}</span>)}</div>
          <h3 style={{ marginTop: 16 }}>Your pay</h3>
          <table className="lines"><tbody>{p.stack.lines.filter((l) => l.kind === "installation" || l.kind === "variation").map((l) => <tr key={l.code}><td>{l.description} × {l.qty}</td><td className="r">{l.cost_ex_gst != null ? aud2(l.cost_ex_gst) : "rate needed"}</td></tr>)}
            <tr className="total"><td>Total ex GST</td><td className="r">{aud2(p.stack.installer_pay_ex_gst)}</td></tr></tbody></table>
        </div>
        <aside>
          {q.status === "pricing_installer" && <form action={confirmPrice} className="card" style={{ marginBottom: 12 }}>{hid}
            <strong>Confirm the price</strong><span className="small muted">{q.pricing_reasons?.join(" · ")}</span>
            <span className="small">Add any work the photos show is needed:</span>
            {menu.items.filter((i) => ["SVC-SWB-HALF", "SVC-SWB-FULL", "SVC-BAT-SLAB", "SVC-TERRACOTTA", "SVC-INST-2STY"].includes(i.code)).map((i) => <label key={i.code} className="small"><input type="checkbox" name="codes" value={i.code} /> {i.description} ({aud2(i.installer_cost ?? i.menu_rate / 1.1)})</label>)}
            <input name="note" placeholder="Note for the customer" style={input} />
            <button className="btn">Confirm price</button></form>}
          {["booked", "gear_ordered", "delivered"].includes(q.status) && techs.length > 0 && <form action={setTechnician} className="card" style={{ marginBottom: 12 }}>{hid}
            <strong>Technician on this job</strong><select name="technician" defaultValue={(curTech?.technician_id as string) ?? (techs.find((t) => t.is_default)?.id as string)} style={input}>{techs.map((t) => <option key={t.id as string} value={t.id as string}>{t.name as string}</option>)}</select>
            <button className="btn ghost sm">Set technician</button></form>}
          {["booked", "gear_ordered"].includes(q.status) && <div className="ok" style={{ marginBottom: 12 }}>Gear is being ordered and delivered to site before install day.</div>}
          {q.status === "delivered" && <form action={installerStage} className="card" style={{ marginBottom: 12 }}>{hid}<input type="hidden" name="to" value="on_site" /><button className="btn">I&apos;m on site</button></form>}
          {q.status === "on_site" && <form action={installerStage} className="card" style={{ marginBottom: 12 }}>{hid}<input type="hidden" name="to" value="installed" /><strong>Commissioned and handed over?</strong><button className="btn">Mark installed</button></form>}
          {["booked", "gear_ordered", "delivered", "on_site"].includes(q.status) && <form action={installerVariation} className="card">{hid}
            <strong>Raise a variation</strong><span className="small muted">Work outside the agreed scope pauses until the customer approves.</span>
            <select name="code" style={input}><option value="VAR-CUSTOM">Custom</option>{menu.items.map((i) => <option key={i.code} value={i.code}>{i.description}</option>)}</select>
            <input name="description" placeholder="What and why" style={input} />
            <input name="cost" placeholder="Your cost ex GST (custom)" style={input} />
            <button className="btn ghost">Send to customer</button></form>}
        </aside>
      </div>
    </AdminShell>
  );
}
