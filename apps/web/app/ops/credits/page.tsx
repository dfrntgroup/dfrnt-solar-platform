import { lifecycleLabel } from "@dfrnt/engine";
import { db } from "@dfrnt/db";
import { AdminShell, input } from "@/components/Admin";
import { requireStaff } from "@/lib/auth";
import { aud2 } from "@/lib/site";
import { newCredit } from "../actions";

export const dynamic = "force-dynamic";

export default async function Credits({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const me = await requireStaff();
  const { error } = await searchParams;
  const rows = await db()`select code, amount_inc::float8 a, reason, email, status, expires_on::text e from credits order by created_at desc limit 200`;
  return (
    <AdminShell who={me.name} area="ops">
      <h1 style={{ fontSize: 28 }}>Credits</h1>
      <p className="muted">A credit comes off the price before GST, like the $100 report credit. It lasts 90 days and is used once.</p>
      {error && <div className="note">{error}</div>}
      <form action={newCredit} className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8 }}>
          <input name="amount" placeholder="Amount inc GST" style={input} required /><input name="email" placeholder="Customer email (optional)" style={input} /><input name="reason" placeholder="Reason" style={input} required /></div>
        <button className="btn sm">Issue credit</button>
      </form>
      <table className="lines"><tbody>{rows.map((r) => <tr key={r.code as string}><td><strong>{r.code as string}</strong><br /><span className="small muted">{r.reason as string} · {r.email as string ?? ""}</span></td><td>{aud2(r.a as number)}</td><td>{lifecycleLabel("credits", r.status as string)}</td><td className="small">to {r.e as string}</td></tr>)}</tbody></table>
    </AdminShell>
  );
}
