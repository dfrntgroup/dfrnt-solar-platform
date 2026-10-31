import Link from "next/link";
import { db } from "@dfrnt/db";
import { AdminShell, input } from "@/components/Admin";
import { Step } from "@/components/Step";
import { requireStaff } from "@/lib/auth";
import { aud2 } from "@/lib/site";
import { stcAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function Stc({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const me = await requireStaff();
  const { error } = await searchParams;
  const rows = await db()`select r.id, r.solar_stcs, r.battery_stcs, r.expected_value::float8 ev, r.realised_value::float8 rv, r.status, r.formbay_ref, q.id qid, q.customer_name
    from stc_receivables r join quotes q on q.id = r.quote_id order by r.status, r.updated_at`;
  const sum = (st: string, f: "ev" | "rv") => rows.filter((r) => r.status === st).reduce((a, r) => a + ((r[f] as number) ?? 0), 0);
  return (
    <AdminShell who={me.name} area="ops">
      <h1 style={{ fontSize: 28 }}>STC receivables</h1>
      <p className="muted">Expected at our fixed rate (what the customer was credited). Realised is what Formbay sells them for — reporting only, it never changes a customer price.</p>
      <p className="small">Expected outstanding: {aud2(sum("expected", "ev") + sum("lodged", "ev") + sum("sold", "ev"))} · paid this view: {aud2(sum("paid", "rv"))}</p>
      {error && <div className="note">{error}</div>}
      <table className="lines"><tbody>{rows.map((r) => (
        <tr key={r.id as string}><td><Link href={`/ops/job/${r.qid}`}>{r.customer_name as string}</Link><br /><span className="small muted">{r.solar_stcs as number} solar + {r.battery_stcs as number} battery · {r.formbay_ref as string ?? ""}</span></td>
          <td className="r">{aud2(r.ev as number)}</td><td className="r">{r.rv != null ? aud2(r.rv as number) : "—"}</td><td>{r.status as string}</td>
          <td>{r.status === "expected" && <form action={stcAction} style={{ display: "flex", gap: 4 }}><input type="hidden" name="id" value={r.id as string} /><input type="hidden" name="to" value="lodged" /><input name="ref" placeholder="Formbay ref" style={{ ...input, width: 110 }} /><button className="btn sm">Lodged</button></form>}
            {r.status === "lodged" && <form action={stcAction} style={{ display: "flex", gap: 4 }}><input type="hidden" name="id" value={r.id as string} /><input type="hidden" name="to" value="sold" /><input name="realised" placeholder="Sold for $" style={{ ...input, width: 100 }} /><button className="btn sm">Sold</button></form>}
            {r.status === "sold" && <Step action={stcAction} fields={{ id: r.id as string, to: "paid" }} label="Cash received" />}</td></tr>))}</tbody></table>
    </AdminShell>
  );
}
