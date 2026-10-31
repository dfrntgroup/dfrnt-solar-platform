import Link from "next/link";
import { db } from "@dfrnt/db";
import { BOARD } from "@dfrnt/engine";
import { AdminShell } from "@/components/Admin";
import { requireStaff } from "@/lib/auth";
import { runTimersNow } from "./actions";
import { aud } from "@/lib/site";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ops board", robots: { index: false } };

const COLUMNS = ["Pricing", "Tech review", "Quoted", "Pending payment", "Payment review", "Awaiting date", "Booked", "Gear ordered", "Delivered", "On site", "On hold", "Installed", "Lodged", "Settled", "Complete"];

export default async function Board() {
  const me = await requireStaff();
  const rows = await db()`select id, token, status, title, customer_name, postcode, amount_payable::float8 as amount, install_date::text as install_date, updated_at
    from quotes where status not in ('saved','expired','lapsed','declined','cancelled') order by updated_at desc limit 300`;
  const counts = await db()`select status, count(*)::int n from quotes group by 1`;
  const alerts = await db()`select id, title, status, customer_name from quotes
    where (status = 'pricing_installer' and updated_at < now() - interval '4 hours') or status = 'payment_review'
       or (status = 'payment_pending' and updated_at < now() - interval '3 days') order by updated_at limit 20`;
  const by = (col: string) => rows.filter((r) => BOARD[r.status as keyof typeof BOARD] === col);
  return (
    <AdminShell who={me.name} area="ops">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><h1 style={{ fontSize: 28 }}>Board</h1>
        <form action={runTimersNow} style={{ display: "flex", gap: 6 }}><button className="btn ghost sm" name="which" value="daily">Run daily timers</button><button className="btn ghost sm" formAction={async (f: FormData) => { "use server"; f.set("which", "cutoff"); await runTimersNow(f); }}>Run 5 pm cut-off</button></form></div>
      <p className="small muted">{counts.map((c) => `${c.status} ${c.n}`).join(" · ")}</p>
      {alerts.length > 0 && <div className="note" style={{ margin: "12px 0" }}><strong>Needs attention:</strong> {alerts.map((a, i) => <span key={a.id as string}>{i ? " · " : " "}<Link href={`/ops/job/${a.id}`}>{(a.customer_name as string) ?? a.title} ({a.status as string})</Link></span>)}</div>}
      <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 12 }}>
        {COLUMNS.map((c) => (
          <div key={c} style={{ minWidth: 220, flex: "0 0 220px" }}>
            <h3 style={{ fontSize: 14 }}>{c} <span className="muted">{by(c).length}</span></h3>
            {by(c).map((r) => (
              <Link key={r.id as string} href={`/ops/job/${r.id}`} className="card" style={{ textDecoration: "none", marginBottom: 8, padding: 12, gap: 4 }}>
                <strong className="small">{(r.customer_name as string) ?? "No name yet"} · {r.postcode as string}</strong>
                <span className="small muted">{r.title as string}</span>
                <span className="small">{aud(r.amount as number)}{r.install_date ? ` · ${r.install_date}` : ""}</span>
              </Link>))}
          </div>))}
      </div>
    </AdminShell>
  );
}
