import Link from "next/link";
import { db } from "@dfrnt/db";
import { AdminShell, input } from "@/components/Admin";
import { requireInstaller } from "@/lib/auth";
import { aud2, longDate } from "@/lib/site";
import { saveAvailability, saveScope } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Installer", robots: { index: false } };
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function InstallerHome({ searchParams }: { searchParams: Promise<{ as?: string; error?: string }> }) {
  const sp = await searchParams;
  const me = await requireInstaller(sp.as);
  const q = (id: string) => `/installer/job/${id}${me.viaStaff ? `?as=${me.id}` : ""}`;
  const toPrice = await db()`select id, title, customer_name, postcode, pricing_reasons, updated_at from quotes where installer_id = ${me.id} and status = 'pricing_installer' order by updated_at`;
  const jobs = await db()`select id, title, customer_name, postcode, status, install_date::text d from quotes where installer_id = ${me.id} and status in ('booked','gear_ordered','delivered','on_site','variation_pending') order by install_date`;
  const earn = await db()`select status, sum(amount_ex)::float8 total, count(*)::int n from pay_ledger where installer_id = ${me.id} group by 1`;
  const [inst] = await db()`select capacity, scope from installers where id = ${me.id}`;
  const cap = inst!.capacity as { jobsPerDay: number; leadDays: number; workingDays: number[]; blackouts: string[] };
  const scope = inst!.scope as { version: number; maxStoreys: number; roofTypes: string[]; batteryLocations: string[]; maxCableRunM: number; phases: number[] };
  const as = me.viaStaff ? <input type="hidden" name="as" value={me.id} /> : null;
  return (
    <AdminShell who={me.business_name + (me.viaStaff ? " (viewing as staff)" : "")} area="installer">
      {sp.error && <div className="note">{sp.error}</div>}
      <h1 style={{ fontSize: 28 }}>To price · {toPrice.length}</h1>
      <p className="muted small">Confirm by 5 pm or the job goes to the next installer.</p>
      {toPrice.map((r) => <Link key={r.id as string} href={q(r.id as string)} className="card" style={{ textDecoration: "none", marginBottom: 8 }}>
        <strong>{r.customer_name as string} · {r.postcode as string}</strong><span className="small">{r.title as string}</span><span className="small muted">{(r.pricing_reasons as string[] | null)?.join(" · ")}</span></Link>)}
      <h2 style={{ marginTop: 28 }}>Upcoming jobs · {jobs.length}</h2>
      {jobs.map((r) => <Link key={r.id as string} href={q(r.id as string)} className="card" style={{ textDecoration: "none", marginBottom: 8 }}>
        <strong>{r.d ? longDate(r.d as string) : "date tbc"} · {r.customer_name as string} · {r.postcode as string}</strong><span className="small">{r.title as string} · {r.status as string}</span></Link>)}
      <h2 style={{ marginTop: 28 }}>Earnings</h2>
      <table className="lines"><tbody>{earn.map((e) => <tr key={e.status as string}><td>{e.status as string} ({e.n as number})</td><td className="r">{aud2(e.total as number)} ex GST</td></tr>)}</tbody></table>
      <div className="grid" style={{ marginTop: 28 }}>
        <form action={saveAvailability} className="card">{as}
          <h3>Availability</h3>
          <label className="small">Jobs per day<input name="jobsPerDay" defaultValue={cap.jobsPerDay} style={input} /></label>
          <label className="small">Lead days<input name="leadDays" defaultValue={cap.leadDays} style={input} /></label>
          <div className="small">{DAYS.map((d, i) => <label key={d} style={{ marginRight: 6 }}><input type="checkbox" name="workingDays" value={i} defaultChecked={cap.workingDays.includes(i)} />{d}</label>)}</div>
          <label className="small">Days off (yyyy-mm-dd)<input name="blackouts" defaultValue={cap.blackouts.join(", ")} style={input} /></label>
          <button className="btn sm">Save availability</button>
        </form>
        <form action={saveScope} className="card">{as}
          <h3>Standard scope (v{scope.version})</h3>
          <span className="small muted">Homes inside this scope get an instant price. Changes apply to new quotes only.</span>
          <label className="small">Max storeys<input name="maxStoreys" defaultValue={scope.maxStoreys} style={input} /></label>
          <div className="small">Roofs: {["tin", "tile", "kliplok"].map((r) => <label key={r} style={{ marginRight: 6 }}><input type="checkbox" name="roofTypes" value={r} defaultChecked={scope.roofTypes.includes(r)} />{r}</label>)}</div>
          <div className="small">Battery spots: {["garage", "outdoor_wall", "other"].map((r) => <label key={r} style={{ marginRight: 6 }}><input type="checkbox" name="batteryLocations" value={r} defaultChecked={scope.batteryLocations.includes(r)} />{r.replace("_", " ")}</label>)}</div>
          <div className="small">Phases: {[1, 3].map((p) => <label key={p} style={{ marginRight: 6 }}><input type="checkbox" name="phases" value={p} defaultChecked={scope.phases.includes(p)} />{p}-phase</label>)}</div>
          <label className="small">Max cable run (m)<input name="maxCableRunM" defaultValue={scope.maxCableRunM} style={input} /></label>
          <button className="btn sm">Save scope</button>
        </form>
      </div>
    </AdminShell>
  );
}
