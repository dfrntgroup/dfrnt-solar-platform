import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@dfrnt/db";
import { TRANSITIONS } from "@dfrnt/engine";
import { AdminShell, input } from "@/components/Admin";
import { requireStaff } from "@/lib/auth";
import { getQuoteById } from "@/lib/jobs";
import { photoUrl } from "@/lib/storage";
import { pricingData } from "@/lib/pricing-data";
import { aud2 } from "@/lib/site";
import { opsAdvance, opsCancel, opsMarkPaid, opsPrice, opsVariation, addStaffNote, techReview, draftPO, poAction, refund, refundSent } from "../../actions";
import { Step } from "@/components/Step";

export const dynamic = "force-dynamic";

export default async function Job({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const me = await requireStaff();
  const { id } = await params;
  const { error } = await searchParams;
  const q = await getQuoteById(id);
  if (!q) notFound();
  const p = q.snapshot ?? q.result;
  const { menu } = await pricingData();
  const photos = await db()`select kind, path from quote_photos where quote_id = ${id} order by created_at`;
  const urls = await Promise.all(photos.map(async (ph) => ({ kind: ph.kind as string, url: await photoUrl(ph.path as string) })));
  const audit = await db()`select at, actor_type, actor_id, action, rationale from audit_log where entity = 'quote' and entity_id = ${id} order by id desc limit 50`;
  const msgs = await db()`select template, status, subject, created_at from messages where quote_id = ${id} order by created_at desc`;
  const pays = await db()`select id, kind, method, amount::float8 amount, reference, status from payments where quote_id = ${id}`;
  const pos = await db()`select id, number, supplier, total_ex::float8 total, status from purchase_orders where quote_id = ${id} and status <> 'cancelled' order by number`;
  const received = pays.filter((x) => x.kind !== "refund" && x.status === "received").reduce((a, x) => a + (x.amount as number), 0) - pays.filter((x) => x.kind === "refund").reduce((a, x) => a + (x.amount as number), 0);
  const vars = await db()`select description, sell_inc::float8 sell_inc, status from variations where quote_id = ${id}`;
  const ledger = await db()`select description, amount_ex::float8 amount_ex, status from pay_ledger where quote_id = ${id}`;
  const next = TRANSITIONS[q.status].filter((t) => t !== "cancelled");
  const site = q.site;
  return (
    <AdminShell who={me.name} area="ops">
      <p className="small"><Link href="/ops">← Board</Link> · <Link href={`/quote/${q.token}`}>Customer record</Link></p>
      <h1 style={{ fontSize: 26 }}>{q.customer_name ?? "No name yet"} · {q.status}</h1>
      <p className="muted">{q.title} · {p.config.summary}</p>
      {error && <div className="note">{error}</div>}
      <div className="pdp">
        <div>
          <h3>Site</h3>
          {site ? <table className="lines"><tbody>
            <tr><td>Address</td><td className="r">{site.address.unit ? `${site.address.unit}/` : ""}{site.address.line1}, {site.address.suburb} {site.address.postcode}</td></tr>
            <tr><td>Contact</td><td className="r">{q.customer_email} · {q.customer_phone}</td></tr>
            <tr><td>Phases · roof · storeys</td><td className="r">{String(site.phases)} · {site.roofType} · {site.storeys}</td></tr>
            <tr><td>Battery location</td><td className="r">{site.batteryLocation}{site.againstHabitableRoom ? " (habitable wall)" : ""}{site.vehicleExposure ? " · vehicle exposure" : ""}</td></tr>
            <tr><td>Switchboard</td><td className="r">{site.switchboard}</td></tr>
            <tr><td>Prior battery claim on NMI</td><td className="r">{site.priorBatteryClaim ? "yes" : "no"}</td></tr>
          </tbody></table> : <p className="muted">Not submitted yet.</p>}
          {q.pricing_reasons?.length ? <div className="note" style={{ marginTop: 8 }}>Needs pricing: {q.pricing_reasons.join(" · ")}</div> : null}
          <h3 style={{ marginTop: 18 }}>Photos</h3>
          <div className="filters">{urls.length ? urls.map((u, i) => u.url ? <a key={i} className="chip" href={u.url} target="_blank">{u.kind}</a> : <span key={i} className="chip">{u.kind} (local)</span>) : <span className="muted small">None</span>}</div>
          <h3 style={{ marginTop: 18 }}>Price (frozen snapshot)</h3>
          <table className="lines"><tbody>
            {p.stack.lines.map((l) => <tr key={l.code}><td>{l.description} × {l.qty}</td><td className="r">{l.cost_ex_gst != null ? aud2(l.cost_ex_gst) : "–"} cost</td><td className="r">{l.sell_ex_gst != null ? aud2(l.sell_ex_gst) : "pending"}</td></tr>)}
            <tr><td>GST</td><td /><td className="r">{aud2(p.stack.gst)}</td></tr>
            <tr><td>Less STCs ({p.stack.stcs})</td><td /><td className="r">−{aud2(p.stack.less_stcs)}</td></tr>
            <tr className="total"><td>Customer pays</td><td /><td className="r">{aud2(p.stack.amount_payable)}</td></tr>
            <tr><td>Gross margin</td><td /><td className="r">{aud2(p.stack.gross_margin)} ({p.stack.gross_margin_pct}%)</td></tr>
            <tr><td>Installer pay</td><td /><td className="r">{aud2(p.stack.installer_pay_ex_gst)}</td></tr>
          </tbody></table>
          <h3 style={{ marginTop: 18 }}>Audit trail</h3>
          <table className="lines small"><tbody>{audit.map((a, i) => <tr key={i}><td>{new Date(a.at as string).toLocaleString("en-AU", { timeZone: "Australia/Brisbane" })}</td><td>{a.action as string}</td><td>{a.actor_type as string}</td><td>{(a.rationale as string) ?? ""}</td></tr>)}</tbody></table>
        </div>
        <aside>
          {(q.status === "payment_pending" || q.status === "payment_review") && <form action={opsMarkPaid} className="card" style={{ marginBottom: 12 }}>
            <input type="hidden" name="id" value={id} /><strong>Bank transfer {q.payment_reference}</strong><span className="small">Expecting {aud2(p.stack.amount_payable)}</span>
            <button className="btn" type="submit">Funds received — mark paid</button></form>}
          {q.status === "pricing_installer" && <form action={opsPrice} className="card" style={{ marginBottom: 12 }}>
            <input type="hidden" name="id" value={id} /><strong>Price this job (for the installer)</strong>
            <span className="small muted">Add named lines from the menu if the photos need them.</span>
            {menu.items.filter((i) => ["SVC-SWB-HALF", "SVC-SWB-FULL", "SVC-BAT-SLAB", "SVC-CABLE-1P", "SVC-CABLE-3P", "SVC-TRAVEL"].includes(i.code)).map((i) => <label key={i.code} className="small"><input type="checkbox" name="codes" value={i.code} /> {i.description}</label>)}
            <input name="note" placeholder="Note to customer (optional)" style={input} />
            <button className="btn" type="submit">Confirm price</button></form>}
          {q.status === "tech_review" && <form action={techReview} className="card" style={{ marginBottom: 12 }}>
            <input type="hidden" name="id" value={id} /><strong>Tech review (O5)</strong><span className="small muted">{q.pricing_reasons?.join(" · ")}</span>
            {menu.items.filter((i) => ["SVC-SWB-HALF", "SVC-SWB-FULL", "SVC-BAT-SLAB", "SVC-CABLE-1P", "SVC-TRAVEL"].includes(i.code)).map((i) => <label key={i.code} className="small"><input type="checkbox" name="codes" value={i.code} /> {i.description}</label>)}
            <select name="decision" style={input}><option value="price">Proceed — price it (with any surcharge ticked)</option><option value="installer">Send back to an installer</option><option value="decline">Decline the job</option></select>
            <input name="note" placeholder="Note" style={input} /><button className="btn" type="submit">Decide</button></form>}
          {(q.status === "awaiting_date" || q.status === "booked") && pos.length === 0 && <div className="card" style={{ marginBottom: 12 }}><strong>Purchase orders</strong><Step action={draftPO} fields={{ id }} label="Draft POs from the parts list" /></div>}
          {pos.length > 0 && <div className="card" style={{ marginBottom: 12 }}><strong>Purchase orders</strong>{pos.map((po) => <span key={po.id as string} className="small">PO {po.number as number} · {po.supplier as string} · {aud2(po.total as number)} · {po.status as string}
            {po.status === "draft" && <> <Step action={poAction} fields={{ po: po.id as string, to: "approved", back: `/ops/job/${id}` }} label="Approve" /></>}
            {po.status === "approved" && <> <Step action={poAction} fields={{ po: po.id as string, to: "sent", back: `/ops/job/${id}` }} label="Mark sent" /></>}
            {po.status === "sent" && <> <Step action={poAction} fields={{ po: po.id as string, to: "delivered", back: `/ops/job/${id}` }} label="Delivered" /></>}</span>)}</div>}
          {q.status === "cancelled" && received > 0.005 && <form action={refund} className="card" style={{ marginBottom: 12 }}>
            <input type="hidden" name="id" value={id} /><strong>Refund</strong><span className="small">Paid and not yet refunded: {aud2(received)}</span>
            <input name="amount" defaultValue={received.toFixed(2)} style={input} /><input name="note" placeholder="Reason / deductions" style={input} />
            <button className="btn" type="submit">Record refund</button></form>}
          {pays.filter((x) => x.kind === "refund" && x.status === "pending").map((x) => <div key={x.id as string} className="card" style={{ marginBottom: 12 }}><strong>Refund {aud2(x.amount as number)} to send</strong><Step action={refundSent} fields={{ id, payment: x.id as string }} label="Bank refund sent" /></div>)}
          {next.length > 0 && <form action={opsAdvance} className="card" style={{ marginBottom: 12 }}>
            <input type="hidden" name="id" value={id} /><strong>Change stage</strong>
            <select name="to" style={input}>{next.map((t) => <option key={t} value={t}>{t}</option>)}</select>
            <input name="reason" placeholder="Reason (required)" style={input} />
            <button className="btn" type="submit">Move</button></form>}
          {["booked", "gear_ordered", "delivered", "on_site"].includes(q.status) && <form action={opsVariation} className="card" style={{ marginBottom: 12 }}>
            <input type="hidden" name="id" value={id} /><strong>Raise a variation</strong>
            <select name="code" style={input}>{menu.items.map((i) => <option key={i.code} value={i.code}>{i.description}</option>)}<option value="VAR-CUSTOM">Custom (give installer cost)</option></select>
            <input name="description" placeholder="Description for the customer" style={input} />
            <input name="cost" placeholder="Installer cost ex GST (custom only)" style={input} />
            <button className="btn" type="submit">Send to customer to approve</button></form>}
          {TRANSITIONS[q.status].includes("cancelled") && <form action={opsCancel} className="card" style={{ marginBottom: 12 }}>
            <input type="hidden" name="id" value={id} /><strong>Cancel</strong><input name="reason" placeholder="Reason" style={input} />
            <button className="btn ghost" type="submit">Cancel job</button></form>}
          <div className="card" style={{ marginBottom: 12 }}><strong>Payments</strong>{pays.length ? pays.map((x, i) => <span key={i} className="small">{x.kind as string} · {x.method as string} · {aud2(x.amount as number)} · {x.reference as string} · {x.status as string}</span>) : <span className="small muted">None</span>}</div>
          <div className="card" style={{ marginBottom: 12 }}><strong>Variations</strong>{vars.length ? vars.map((x, i) => <span key={i} className="small">{x.description as string} · {aud2(x.sell_inc as number)} · {x.status as string}</span>) : <span className="small muted">None</span>}</div>
          <div className="card" style={{ marginBottom: 12 }}><strong>Installer pay</strong>{ledger.length ? ledger.map((x, i) => <span key={i} className="small">{x.description as string} · {aud2(x.amount_ex as number)} · {x.status as string}</span>) : <span className="small muted">None yet</span>}</div>
          <div className="card" style={{ marginBottom: 12 }}><strong>Messages</strong>{msgs.length ? msgs.map((m, i) => <span key={i} className="small">{m.template as string} · {m.subject as string} · {m.status as string}</span>) : <span className="small muted">None</span>}</div>
          <form action={addStaffNote} className="card"><input type="hidden" name="id" value={id} /><strong>Note</strong><input name="note" style={input} /><button className="btn ghost sm" type="submit">Add note</button></form>
        </aside>
      </div>
    </AdminShell>
  );
}
