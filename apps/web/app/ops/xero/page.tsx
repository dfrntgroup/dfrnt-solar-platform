import { db } from "@dfrnt/db";
import { AdminShell, input } from "@/components/Admin";
import { requireStaff } from "@/lib/auth";
import { getSetting } from "@/lib/settings";
import { xeroAccounts, xeroReady } from "@/lib/xero";
import { xeroCodes, xeroDisconnect, xeroSyncNow } from "../actions";

export const dynamic = "force-dynamic";

/** B1: Xero connection, account codes and the sync log. */
export default async function Xero({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const me = await requireStaff();
  const sp = await searchParams;
  const x = await getSetting("xero");
  const connected = !!x.refresh_token_enc;
  const accounts = connected ? await xeroAccounts().catch(() => []) : [];
  const log = await db()`select kind, ref_id, status, error, synced_at, created_at from xero_sync order by created_at desc limit 30`;
  const pick = (name: string, label: string, value?: string) => (
    <label className="small">{label}{accounts.length
      ? <select name={name} defaultValue={value ?? ""} style={input}><option value="">Choose…</option>{accounts.map((a) => <option key={a.Code} value={a.Code}>{a.Code} · {a.Name}</option>)}</select>
      : <input name={name} defaultValue={value ?? ""} style={input} placeholder="Account code" />}</label>);
  const tax = (name: string, label: string, value: string | undefined, dflt: string) => <label className="small">{label}<input name={name} defaultValue={value || dflt} style={input} /></label>;
  return (
    <AdminShell who={me.name} area="ops">
      <h1 style={{ fontSize: 28 }}>Xero</h1>
      {sp.error && <div className="note">{sp.error}</div>}{sp.ok && <div className="ok">Connected to Xero.</div>}
      <div className="card" style={{ marginBottom: 12 }}>
        <strong>{connected ? `Connected: ${x.tenant_name}` : "Not connected"}</strong>
        <span className="small muted">Sends each tax invoice and its payment, each installer pay-run bill, and each STC sale, once, with the job reference. Refunds and credit notes stay manual for now.</span>
        {!xeroReady() ? <span className="small note">Needs a Xero app: add XERO_CLIENT_ID and XERO_CLIENT_SECRET in Vercel, with redirect URI …/api/v1/xero/callback.</span>
          : connected ? <form action={xeroDisconnect}><button className="btn ghost sm">Disconnect</button></form> : <a className="btn sm" href="/api/v1/xero/connect">Connect Xero (you sign in)</a>}
      </div>
      <form action={xeroCodes} className="card" style={{ marginBottom: 12 }}>
        <strong>Account codes and tax types</strong>
        <span className="small muted">Your bookkeeper&apos;s choice. Nothing is sent until the four account codes are set. Tax types use Xero&apos;s codes (OUTPUT = GST on income, INPUT = GST on expenses, BASEXCLUDED = not reported).</span>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 8 }}>
          {pick("sales", "System sales", x.codes.sales)}{pick("stc", "STC assignment (rebate line on invoices)", x.codes.stc)}
          {pick("stc_sale", "STC sales income (blank = same as above)", x.codes.stc_sale)}{pick("installer", "Installer costs", x.codes.installer)}{pick("bank", "Bank account payments land in", x.codes.bank)}
          {tax("sales_tax", "Sales tax type", x.codes.sales_tax, "OUTPUT")}{tax("stc_tax", "STC line tax type", x.codes.stc_tax, "BASEXCLUDED")}
          {tax("stc_sale_tax", "STC sale tax type", x.codes.stc_sale_tax, "OUTPUT")}{tax("installer_tax", "Installer bill tax type", x.codes.installer_tax, "INPUT")}
        </div>
        <button className="btn sm">Save</button>
      </form>
      <form action={xeroSyncNow}><button className="btn ghost sm">Sync now</button></form>
      <h3 style={{ marginTop: 16 }}>Sync log</h3>
      <table className="lines small"><tbody>{log.length ? log.map((l, i) => <tr key={i}><td>{l.kind as string}</td><td>{String(l.ref_id).slice(0, 8)}</td><td>{l.status as string}</td><td className="muted">{(l.error as string) ?? ""}</td></tr>) : <tr><td className="muted">Nothing sent yet.</td></tr>}</tbody></table>
    </AdminShell>
  );
}
