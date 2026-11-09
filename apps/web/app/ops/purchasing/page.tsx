import Link from "next/link";
import { db } from "@dfrnt/db";
import { AdminShell } from "@/components/Admin";
import { Step } from "@/components/Step";
import { requireStaff } from "@/lib/auth";
import { aud2 } from "@/lib/site";
import { poAction } from "../actions";
import { PO_ORDER } from "@/lib/ops";

export const dynamic = "force-dynamic";

export default async function Purchasing({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const me = await requireStaff();
  const { error } = await searchParams;
  const pos = await db()`select p.id, p.number, p.supplier, p.lines, p.total_ex::float8 total, p.status, p.eta::text eta, q.id qid, q.customer_name, q.install_date::text d
    from purchase_orders p join quotes q on q.id = p.quote_id where p.status <> 'cancelled' order by p.status = 'delivered', q.install_date nulls last`;
  return (
    <AdminShell who={me.name} area="ops">
      <h1 style={{ fontSize: 28 }}>Purchase orders</h1>
      <p className="muted">Drafted from the job&apos;s frozen parts list at our cost. Sending moves the job to gear ordered; when every PO is delivered the job moves to delivered. Supplier cost changes never change the customer&apos;s price.</p>
      {error && <div className="note">{error}</div>}
      {pos.map((p) => { const to = PO_ORDER.next(p.status as string); return (
        <div key={p.id as string} className="card" style={{ marginBottom: 10 }}>
          <strong>PO {p.number as number} · {p.supplier as string} · {aud2(p.total as number)} ex GST · {PO_ORDER.labels[p.status as string] ?? p.status}</strong>
          <span className="small"><Link href={`/ops/job/${p.qid}`}>{(p.customer_name as string) ?? "job"}</Link> · install {(p.d as string) ?? "tbc"}{p.eta ? ` · ETA ${p.eta}` : ""}</span>
          <span className="small muted">{(p.lines as { sku: string; qty: number }[]).map((l) => `${l.qty} × ${l.sku}`).join(" · ")}</span>
          <div style={{ display: "flex", gap: 6 }}>{to && <Step action={poAction} fields={{ po: p.id as string, to }} label={PO_ORDER.label(to)} />}{PO_ORDER.canCancel(p.status as string) && <Step action={poAction} fields={{ po: p.id as string, to: "cancelled" }} label="Cancel" ghost />}</div>
        </div>); })}
    </AdminShell>
  );
}
