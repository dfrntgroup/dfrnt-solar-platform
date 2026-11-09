import { lifecycleLabel } from "@dfrnt/engine";
import { db } from "@dfrnt/db";
import { AdminShell, input } from "@/components/Admin";
import { requireStaff } from "@/lib/auth";
import { aud2 } from "@/lib/site";
import { addCreatorCode, markPayoutPaid } from "../actions";

export const dynamic = "force-dynamic";

export default async function Growth({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const me = await requireStaff();
  const { error } = await searchParams;
  const codes = await db()`select c.code, c.kind, c.creator_name, c.discount_inc::float8 d, c.reward::float8 r, c.active,
    (select count(*)::int from quotes q where q.discount_code = c.code) uses from codes c order by c.created_at desc limit 200`;
  const payouts = await db()`select p.id, p.code, p.amount::float8 amount, p.status, q.customer_name from payouts p join quotes q on q.id = p.quote_id order by p.created_at desc`;
  return (
    <AdminShell who={me.name} area="ops">
      <h1 style={{ fontSize: 28 }}>Referrals and creators</h1>
      {error && <div className="note">{error}</div>}
      <form action={addCreatorCode} className="card" style={{ marginBottom: 20 }}>
        <strong>New creator code</strong><span className="small muted">Paid per installed job only, after install. Every post must carry the paid-partnership disclosure.</span>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8 }}>
          <input name="code" placeholder="CODE" style={input} required /><input name="name" placeholder="Creator name" style={input} required />
          <input name="email" placeholder="Email" style={input} /><input name="reward" placeholder="Commission per install (300)" style={input} /></div>
        <button className="btn sm">Create code</button>
      </form>
      <h3>Codes</h3>
      <table className="lines"><tbody>{codes.map((c) => <tr key={c.code as string}><td><strong>{c.code as string}</strong> · {c.kind as string}{c.creator_name ? ` · ${c.creator_name}` : ""}</td><td>{aud2(c.d as number)} off</td><td>{aud2(c.r as number)} reward</td><td>{c.uses as number} uses</td></tr>)}</tbody></table>
      <h3 style={{ marginTop: 20 }}>Payouts</h3>
      <table className="lines"><tbody>{payouts.map((p) => <tr key={p.id as string}><td>{p.code as string}</td><td>for {p.customer_name as string}</td><td>{aud2(p.amount as number)}</td><td>{lifecycleLabel("payouts", p.status as string)}</td>
        <td>{p.status === "eligible" && <form action={markPayoutPaid}><input type="hidden" name="id" value={p.id as string} /><button className="btn ghost sm">Mark paid</button></form>}</td></tr>)}</tbody></table>
    </AdminShell>
  );
}
