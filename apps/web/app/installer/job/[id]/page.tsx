import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@dfrnt/db";
import { AdminShell, input } from "@/components/Admin";
import { requireInstaller } from "@/lib/auth";
import { getQuoteById } from "@/lib/jobs";
import { photoUrl } from "@/lib/storage";
import { pricingData } from "@/lib/pricing-data";
import { aud2, longDate } from "@/lib/site";
import { confirmPrice, installerRevise, installerStage, installerVariation, setTechnician, cantDoDay, moveDay, offerDays, setJobDays, installerMessage } from "../../actions";
import { JobThread } from "@/components/JobThread";
import { dayLabel } from "@/components/DayPicker";
import { needsOf, profileOf } from "@/lib/schedule";
import { jobDays } from "@dfrnt/engine";
import { ReviseForm } from "@/components/ReviseForm";

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
  const [instRow] = await db()`select profile, capacity from installers where id = ${me.id}`;
  const estDays = q.job_days ?? jobDays(profileOf(instRow as never), needsOf(q));
  const bookedish = ["booked", "gear_ordered", "delivered", "on_site", "variation_pending", "installed"].includes(q.status);
  const [offer] = await db()`select status, dates::text[] dates from date_offers where quote_id = ${id} and kind = 'installer' and status in ('requested','open') order by created_at desc limit 1`;
  const canDecline = !!q.decline_until && new Date(q.decline_until) > new Date() && !!q.install_date;
  return (
    <AdminShell who={me.business_name} area="installer">
      <p className="small"><Link href={`/installer${me.viaStaff ? `?as=${me.id}` : ""}`}>← My jobs</Link></p>
      <h1 style={{ fontSize: 26 }}>{q.customer_name} · {q.status}</h1>
      {sp.error && <div className="note">{sp.error}</div>}
      <p>{site ? `${site.address.unit ? site.address.unit + "/" : ""}${site.address.line1}, ${site.address.suburb} ${site.address.postcode}` : ""}{bookedish && q.customer_phone ? <> · <a href={`tel:${q.customer_phone}`}>{q.customer_phone}</a></> : null}</p>
      {q.install_date && !q.rebook && <div className="ok">Install {dayLabel([q.install_date], q.install_part)} · {estDays} crew-day{estDays === 1 ? "" : "s"}{q.booked_via ? ` · booked by ${q.booked_via === "customer" ? "the customer" : q.booked_via === "desk" ? "DFRNT" : q.booked_via === "earlier_offer" ? "the customer (earlier day)" : "the customer from your offered days"}` : ""}</div>}
      {q.rebook && <div className="note">The customer is picking a new day.</div>}
      {q.access_notes && <div className="card" style={{ marginTop: 8 }}><strong>Access on the day</strong><span style={{ whiteSpace: "pre-wrap" }}>{q.access_notes}</span></div>}
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
          {canDecline && <form action={cantDoDay} className="card" style={{ marginBottom: 12 }}>{hid}
            <strong>Can&apos;t do {longDate(q.install_date!)}?</strong><span className="small muted">Until {new Date(q.decline_until!).toLocaleString("en-AU", { timeZone: "Australia/Brisbane", weekday: "short", hour: "numeric", minute: "2-digit" })}. The customer picks another of your free days straight away.</span>
            <button className="btn ghost sm">Can&apos;t do this day</button></form>}
          {["booked", "gear_ordered", "delivered"].includes(q.status) && q.install_date && !q.rebook && !canDecline && <form action={moveDay} className="card" style={{ marginBottom: 12 }}>{hid}
            <strong>Move this install</strong><span className="small muted">The customer picks a new day from your free days, inside their rebate deadline.</span>
            <select name="reason" style={input} required defaultValue=""><option value="" disabled>Why?</option><option value="rain">Rain</option><option value="sick">Sick</option><option value="parts">Parts won&apos;t arrive</option></select>
            <button className="btn ghost sm">Move it</button></form>}
          {offer && (q.status === "awaiting_date" || q.rebook) && <form action={offerDays} className="card" style={{ marginBottom: 12 }}>{hid}
            <strong>{offer.status === "open" ? "Days you offered" : "Offer up to 3 install days"}</strong>
            {offer.status === "open" ? <span className="small">{(offer.dates as string[]).map((d) => longDate(d)).join(", ")}. Waiting for the customer to pick. Change them below if needed.</span>
              : <span className="small muted">The customer has paid. Pick days that suit you; they choose one.</span>}
            {[0, 1, 2].map((n) => <input key={n} type="date" name="date" style={input} required={n === 0} />)}
            <button className="btn sm">Send days to the customer</button>
            <span className="small muted">Connect your Google Calendar and customers book your free days themselves: <Link href={`/installer/calendar${me.viaStaff ? `?as=${me.id}` : ""}`}>Calendar</Link></span></form>}
          {["pricing_installer", "priced", "signed", "payment_pending", "awaiting_date"].includes(q.status) && <form action={setJobDays} className="card" style={{ marginBottom: 12 }}>{hid}
            <strong>How long will this job take?</strong><span className="small muted">From the photos. Currently {estDays} crew-day{estDays === 1 ? "" : "s"}{q.job_days ? " (set by you)" : " (from your profile)"}. Customers only see days with this much free time.</span>
            <select name="days" defaultValue={String(estDays)} style={input}>{[0.5, 1, 1.5, 2, 2.5, 3].map((d) => <option key={d} value={d}>{d === 0.5 ? "Half a day" : `${d} day${d === 1 ? "" : "s"}`}</option>)}</select>
            <button className="btn ghost sm">Save</button></form>}
          {q.status === "pricing_installer" && <ReviseForm q={q} action={installerRevise} hidden={hid} />}
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
      {bookedish && <JobThread quoteId={q.id} action={installerMessage} hidden={hid} me="installer" title="Messages with the customer" />}
    </AdminShell>
  );
}
