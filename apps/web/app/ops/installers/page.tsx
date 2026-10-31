import { db } from "@dfrnt/db";
import { AdminShell, input } from "@/components/Admin";
import { requireStaff } from "@/lib/auth";
import { saveInstaller, createInstallerFromApplication } from "../actions";
import { Step } from "@/components/Step";

export const dynamic = "force-dynamic";
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function Installers({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const me = await requireStaff();
  const { error } = await searchParams;
  const rows = await db()`select id, business_name, contact_name, email, active, is_test, capacity, scope,
    array_to_string(array(select (lower(r)::text || '-' || (upper(r)-1)::text) from unnest(postcode_ranges) r), ', ') ranges from installers order by created_at`;
  const apps = await db()`select id, business_name, contact_name, email, postcodes, licence_no from installer_applications where status = 'new' order by created_at`;
  return (
    <AdminShell who={me.name} area="ops">
      <h1 style={{ fontSize: 28 }}>Installers</h1>
      {error && <div className="note">{error}</div>}
      {apps.length > 0 && <><h3>Applications</h3>{apps.map((a) => <div key={a.id as string} className="card" style={{ marginBottom: 8 }}><strong>{a.business_name as string}</strong><span className="small">{a.contact_name as string} · {a.email as string} · {a.postcodes as string ?? ""} · licence {a.licence_no as string ?? "—"}</span>
        <Step action={createInstallerFromApplication} fields={{ id: a.id as string }} label="Create installer (inactive until profile complete)" /></div>)}</>}
      {rows.map((r) => { const c = r.capacity as { jobsPerDay: number; leadDays: number; workingDays: number[]; blackouts: string[] }; return (
        <form key={r.id as string} action={saveInstaller} className="card" style={{ marginBottom: 16 }}>
          <input type="hidden" name="id" value={r.id as string} />
          <strong>{r.business_name as string}{r.is_test ? " (test)" : ""}</strong><span className="small muted">{r.contact_name as string} · {r.email as string}</span>
          <label className="small"><input type="checkbox" name="active" defaultChecked={r.active as boolean} /> Active (takes new jobs)</label>
          <label className="small">Postcode ranges<input name="ranges" defaultValue={r.ranges as string} style={input} /></label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <label className="small">Jobs per day<input name="jobsPerDay" defaultValue={c.jobsPerDay} style={input} /></label>
            <label className="small">Lead days<input name="leadDays" defaultValue={c.leadDays} style={input} /></label>
          </div>
          <div className="small">{DAYS.map((d, i) => <label key={d} style={{ marginRight: 8 }}><input type="checkbox" name="workingDays" value={i} defaultChecked={c.workingDays.includes(i)} /> {d}</label>)}</div>
          <label className="small">Blackout dates (yyyy-mm-dd, comma separated)<input name="blackouts" defaultValue={c.blackouts.join(", ")} style={input} /></label>
          <span className="small muted">Standard scope v{(r.scope as { version: number }).version}: instant price when the home fits it.</span>
          <button className="btn sm" type="submit">Save</button>
        </form>); })}
    </AdminShell>
  );
}
