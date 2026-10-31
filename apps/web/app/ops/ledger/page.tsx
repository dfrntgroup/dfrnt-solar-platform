import Link from "next/link";
import { db } from "@dfrnt/db";
import { AdminShell } from "@/components/Admin";
import { requireStaff } from "@/lib/auth";
import { aud2 } from "@/lib/site";
import { ledgerApprove } from "../actions";

export const dynamic = "force-dynamic";

export default async function Ledger({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const me = await requireStaff();
  const { error } = await searchParams;
  const rows = await db()`select l.id, l.description, l.amount_ex::float8 amount, l.status, l.created_at, i.business_name, q.id qid, q.customer_name
    from pay_ledger l join installers i on i.id = l.installer_id join quotes q on q.id = l.quote_id where l.status <> 'paid' or l.paid_at > now() - interval '30 days' order by l.status, l.created_at`;
  const group = (st: string) => rows.filter((r) => r.status === st);
  const Table = ({ st, to, label }: { st: string; to?: string; label?: string }) => (
    <form action={ledgerApprove} style={{ marginBottom: 24 }}>
      <h3>{st[0]!.toUpperCase() + st.slice(1)} · {aud2(group(st).reduce((a, r) => a + (r.amount as number), 0))}</h3>
      <table className="lines"><tbody>{group(st).map((r) => (
        <tr key={r.id as string}><td>{to && <input type="checkbox" name="ids" value={r.id as string} />}</td><td>{r.business_name as string}</td><td><Link href={`/ops/job/${r.qid}`}>{(r.customer_name as string) ?? "job"}</Link></td><td>{r.description as string}</td><td className="r">{aud2(r.amount as number)} ex GST</td></tr>))}</tbody></table>
      {to && group(st).length > 0 && <><input type="hidden" name="to" value={to} /><button className="btn sm" type="submit">{label}</button></>}
    </form>);
  return (
    <AdminShell who={me.name} area="ops">
      <h1 style={{ fontSize: 28 }}>Pay run</h1>
      <p className="muted">Installer pay is frozen at pricing. Lines become eligible when the job is installed. Approve, then mark paid once the bank payment is made.</p>
      {error && <div className="note">{error}</div>}
      <Table st="eligible" to="approved" label="Approve selected" />
      <Table st="approved" to="paid" label="Mark selected paid" />
      <Table st="accrued" />
      <Table st="paid" />
    </AdminShell>
  );
}
