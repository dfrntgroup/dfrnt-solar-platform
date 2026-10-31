import { db } from "@dfrnt/db";
import { AdminShell, input } from "@/components/Admin";
import { Step } from "@/components/Step";
import { requireInstaller } from "@/lib/auth";
import { addTechnician, saveProfile, uploadDoc, setDefaultTech } from "../actions";

export const dynamic = "force-dynamic";

export default async function Profile({ searchParams }: { searchParams: Promise<{ as?: string; error?: string }> }) {
  const sp = await searchParams;
  const me = await requireInstaller(sp.as);
  const [i] = await db()`select business_name, abn, contact_name, phone, address, licence_no, insurance_expiry::text ins, saa_accreditation, active from installers where id = ${me.id}`;
  const techs = await db()`select id, name, saa_number, formbay_id, is_default from technicians where installer_id = ${me.id} and active order by name`;
  const docs = await db()`select kind, expires_on::text e, created_at from installer_documents where installer_id = ${me.id} order by created_at desc`;
  const as = me.viaStaff ? <input type="hidden" name="as" value={me.id} /> : null;
  const missing = [!i!.abn && "ABN", !i!.licence_no && "electrical licence", !(i!.ins && i!.ins >= new Date().toISOString().slice(0, 10)) && "current insurance", !docs.some((d) => d.kind === "insurance") && "insurance certificate"].filter(Boolean);
  return (
    <AdminShell who={me.business_name} area="installer">
      <h1 style={{ fontSize: 28 }}>Profile</h1>
      {sp.error && <div className="note">{sp.error}</div>}
      {missing.length ? <div className="note">Before you can take jobs we need: {missing.join(", ")}.</div> : <div className="ok">Profile complete{i!.active ? " · active" : " · waiting for approval"}.</div>}
      <form action={saveProfile} className="card" style={{ marginTop: 12 }}>{as}
        {([["business_name", "Business name"], ["abn", "ABN"], ["contact_name", "Contact"], ["phone", "Phone"], ["address", "Business address"], ["licence_no", "Electrical contractor licence"], ["saa_accreditation", "SAA accreditation"]] as const).map(([k, l]) =>
          <label key={k} className="small">{l}<input name={k} defaultValue={(i![k] as string) ?? ""} style={input} /></label>)}
        <label className="small">Public liability insurance expiry<input name="insurance_expiry" type="date" defaultValue={(i!.ins as string) ?? ""} style={input} /></label>
        <button className="btn sm">Save</button>
      </form>
      <h2 style={{ marginTop: 24 }}>Technicians</h2>
      <table className="lines"><tbody>{techs.map((t) => <tr key={t.id as string}><td>{t.name as string}{t.is_default ? " (default)" : ""}</td><td className="small">SAA {t.saa_number as string ?? "—"} · Formbay {t.formbay_id as string ?? "—"}</td>
        <td>{!t.is_default && <Step action={setDefaultTech} fields={{ id: t.id as string, ...(me.viaStaff ? { as: me.id } : {}) }} label="Make default" ghost />}</td></tr>)}</tbody></table>
      <form action={addTechnician} className="card" style={{ marginTop: 8 }}>{as}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}><input name="name" placeholder="Name" style={input} required /><input name="saa_number" placeholder="SAA number" style={input} /><input name="formbay_id" placeholder="Formbay installer id" style={input} /><input name="phone" placeholder="Phone" style={input} /></div>
        <button className="btn sm">Add technician</button></form>
      <h2 style={{ marginTop: 24 }}>Documents</h2>
      <table className="lines small"><tbody>{docs.map((d, k) => <tr key={k}><td>{d.kind as string}</td><td>{d.e ? `expires ${d.e}` : ""}</td></tr>)}</tbody></table>
      <form action={uploadDoc} className="card" style={{ marginTop: 8 }}>{as}
        <select name="kind" style={input}><option value="licence">Electrical licence</option><option value="insurance">Insurance certificate</option><option value="saa">SAA accreditation</option><option value="abn">ABN registration</option><option value="other">Other</option></select>
        <input type="file" name="file" required /><label className="small">Expiry (if any)<input type="date" name="expires_on" style={input} /></label>
        <button className="btn sm">Upload</button></form>
    </AdminShell>
  );
}
