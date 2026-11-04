import { db } from "@dfrnt/db";
import { AdminShell, input } from "@/components/Admin";
import { requireStaff } from "@/lib/auth";
import { addonPrice } from "@/lib/addons";
import { pricingData } from "@/lib/pricing-data";
import { aud } from "@/lib/site";
import { addonSave } from "../actions";

export const dynamic = "force-dynamic";

/** U1: the add-on list. Price = supplier cost at the hardware margin + installer labour at the installation margin + GST. */
export default async function Addons({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const me = await requireStaff();
  const sp = await searchParams;
  const rows = await db()`select code, name, description, supplier_cost_ex::float8 s, installer_labour_ex::float8 l, extra_days::float8 d, active, sort, requires_brand,
    (select count(*)::int from quote_addons q where q.code = addons.code and q.status <> 'removed') used from addons order by sort, name`;
  const { margins } = await pricingData();
  const Row = ({ r }: { r?: Record<string, unknown> }) => (
    <form action={addonSave} className="card" style={{ marginBottom: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8 }}>
        <label className="small">Code<input name="code" defaultValue={(r?.code as string) ?? ""} style={input} readOnly={!!r} /></label>
        <label className="small">Name<input name="name" defaultValue={(r?.name as string) ?? ""} style={input} /></label>
        <label className="small">Supplier cost ex GST<input name="supplier" defaultValue={(r?.s as number) ?? ""} style={input} /></label>
        <label className="small">Installer labour ex GST<input name="labour" defaultValue={(r?.l as number) ?? ""} style={input} /></label>
        <label className="small">Extra crew-days<input name="days" defaultValue={(r?.d as number) ?? 0} style={input} /></label>
        <label className="small">Order<input name="sort" defaultValue={(r?.sort as number) ?? 0} style={input} /></label>
        <label className="small">Only with brand<input name="brand" placeholder="blank = any" defaultValue={(r?.requires_brand as string) ?? ""} style={input} /></label>
      </div>
      <input name="description" placeholder="One line for the customer" defaultValue={(r?.description as string) ?? ""} style={input} />
      <span className="small">{r ? <>Customer pays <strong>{aud(addonPrice({ supplier_cost_ex: r.s as number, installer_labour_ex: r.l as number }, margins).sell_inc)}</strong> inc GST · used on {r.used as number} job(s)</> : "New add-on"}</span>
      <label className="small"><input type="checkbox" name="active" defaultChecked={r ? (r.active as boolean) : true} /> Offered to customers</label>
      <button className="btn sm">Save</button>
    </form>);
  return (
    <AdminShell who={me.name} area="ops">
      <h1 style={{ fontSize: 28 }}>Add-ons</h1>
      <p className="muted">Shown on the record before signing (in the one price) and after paying (one extra payment, same visit). Nothing shows until at least one is offered.</p>
      {sp.error && <div className="note">{sp.error}</div>}
      {rows.map((r) => <Row key={r.code as string} r={r} />)}
      <Row />
    </AdminShell>
  );
}
