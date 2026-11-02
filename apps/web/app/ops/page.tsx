import Link from "next/link";
import { db } from "@dfrnt/db";
import { BOARD, earliestDate, type Capacity } from "@dfrnt/engine";
import { todayAEST } from "@/lib/api";
import { longDate } from "@/lib/site";
import { AdminShell } from "@/components/Admin";
import { requireStaff } from "@/lib/auth";
import { runTimersNow } from "./actions";
import { aud } from "@/lib/site";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ops board", robots: { index: false } };

const COLUMNS = ["Pricing", "Tech review", "Quoted", "Pending payment", "Payment review", "Awaiting date", "Booked", "Gear ordered", "Delivered", "On site", "On hold", "Installed", "Lodged", "Settled", "Complete"];

export default async function Board({ searchParams }: { searchParams: Promise<{ stage?: string }> }) {
  const stage = (await searchParams).stage;
  const me = await requireStaff();
  const rows = await db()`select id, token, status, title, customer_name, postcode, amount_payable::float8 as amount, install_date::text as install_date, updated_at
    from quotes where status not in ('saved','expired','lapsed','declined','cancelled') order by updated_at desc limit 300`;
  const counts = await db()`select status, count(*)::int n from quotes group by 1`;
  const alerts = await db()`select id, title, status, customer_name from quotes
    where (status = 'pricing_installer' and updated_at < now() - interval '4 hours') or status = 'payment_review'
       or (status = 'payment_pending' and updated_at < now() - interval '3 days') order by updated_at limit 20`;
  const insts = await db()`select business_name, capacity, (select json_object_agg(d, n) from (select install_date::text d, count(*)::int n from quotes q where q.installer_id = i.id and install_date is not null and status in ('booked','gear_ordered','delivered','on_site','variation_pending') group by 1) x) booked from installers i where active`;
  const earliest = insts.map((i) => ({ name: i.business_name as string, d: earliestDate(todayAEST(), { ...(i.capacity as Omit<Capacity, "booked">), booked: (i.booked ?? {}) as Record<string, number> }) }));
  const failures = await db()`select where_, message, count(*)::int n, max(created_at) last from failures where created_at > now() - interval '7 days' group by 1, 2 order by last desc limit 8`.catch(() => []);
  const days = (d: string | null) => d ? Math.round((Date.parse(d) - Date.parse(todayAEST())) / 86400000) : 999;
  const throttle = earliest.length > 0 && earliest.every((e) => days(e.d) > 21);
  const by = (col: string) => rows.filter((r) => BOARD[r.status as keyof typeof BOARD] === col);
  return (
    <AdminShell who={me.name} area="ops">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><h1 style={{ fontSize: 28 }}>Board</h1>
        <form action={runTimersNow} style={{ display: "flex", gap: 6 }}><button className="btn ghost sm" name="which" value="daily">Run daily timers</button><button className="btn ghost sm" formAction={async (f: FormData) => { "use server"; f.set("which", "cutoff"); await runTimersNow(f); }}>Run 5 pm cut-off</button></form></div>
      <p className="small muted">{counts.map((c) => `${c.status} ${c.n}`).join(" · ")}</p>
      <p className="small">Earliest install: {earliest.map((e) => `${e.name} ${e.d ? longDate(e.d) : "none"}`).join(" · ")}</p>
      {throttle && <div className="note" style={{ margin: "12px 0" }}><strong>Throttle:</strong> every installer&apos;s earliest date is more than 21 days out. Pause creator and paid spend until capacity frees up (O18).</div>}
      {failures.length > 0 && <div className="note" style={{ margin: "12px 0" }}><strong>Something failed in the last 7 days:</strong>
        <ul className="small" style={{ margin: "6px 0 0", paddingLeft: 18 }}>{failures.map((f, i) => <li key={i}><code>{f.where_ as string}</code> ×{f.n as number}: {f.message as string}</li>)}</ul></div>}
      {alerts.length > 0 && <div className="note" style={{ margin: "12px 0" }}><strong>Needs attention:</strong> {alerts.map((a, i) => <span key={a.id as string}>{i ? " · " : " "}<Link href={`/ops/job/${a.id}`}>{(a.customer_name as string) ?? a.title} ({a.status as string})</Link></span>)}</div>}
      <div className="mob-only">
        {stage && COLUMNS.includes(stage) ? <>
          <p className="small"><Link href="/ops">← All stages</Link></p>
          <h3>{stage} <span className="muted">{by(stage).length}</span></h3>
          {by(stage).length ? by(stage).map((r: (typeof rows)[number]) => (
              <Link key={r.id as string} href={`/ops/job/${r.id}`} className="card" style={{ textDecoration: "none", marginBottom: 8, padding: 12, gap: 4 }}>
                <strong className="small">{(r.customer_name as string) ?? "No name yet"} · {r.postcode as string}</strong>
                <span className="small muted">{r.title as string}</span>
                <span className="small">{aud(r.amount as number)}{r.install_date ? ` · ${r.install_date}` : ""}</span>
              </Link>)) : <p className="small muted">Nothing here.</p>}
        </> : <>
          <h3 style={{ fontSize: 13, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--muted)" }}>Stages</h3>
          <div className="card" style={{ padding: "2px 12px" }}>
            {COLUMNS.filter((c) => by(c).length > 0).map((c) => <Link key={c} href={`/ops?stage=${encodeURIComponent(c)}`} style={{ display: "flex", justifyContent: "space-between", padding: "11px 0", borderBottom: "1px solid var(--line)", textDecoration: "none", color: "var(--ink)" }}><span>{c}</span><span className="badge">{by(c).length}</span></Link>)}
            {COLUMNS.every((c) => by(c).length === 0) && <p className="small muted">No active jobs.</p>}
          </div>
          <details className="small" style={{ marginTop: 8 }}><summary>Empty stages</summary>{COLUMNS.filter((c) => by(c).length === 0).join(" · ")}</details>
        </>}
      </div>
      <div className="desk-only" style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 12 }}>
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
