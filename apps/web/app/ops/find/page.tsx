import Link from "next/link";
import { db } from "@dfrnt/db";
import { AdminShell, OPS_GROUPS } from "@/components/Admin";
import { requireStaff } from "@/lib/auth";
import { aud } from "@/lib/site";

export const dynamic = "force-dynamic";

/** Phone menu search: an Ops page by name, or a customer by name, email, phone, postcode or job title. */
export default async function Find({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const me = await requireStaff();
  const q = ((await searchParams).q ?? "").trim().slice(0, 80);
  const lq = q.toLowerCase();
  const pages = q ? OPS_GROUPS.flatMap(([, ls]) => ls).filter(([, t]) => t.toLowerCase().includes(lq)) : [];
  const like = `%${q}%`;
  const jobs = q.length >= 2 ? await db()`select id, customer_name, postcode, title, status, amount_payable::float8 amount from quotes
    where customer_name ilike ${like} or customer_email ilike ${like} or customer_phone ilike ${like} or postcode = ${q} or title ilike ${like}
    order by updated_at desc limit 30` : [];
  return (
    <AdminShell who={me.name} area="ops">
      <h1 style={{ fontSize: 24 }}>Find</h1>
      <form action="/ops/find" style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input name="q" defaultValue={q} placeholder="Page, customer name, email, phone or postcode" style={{ flex: 1, padding: 10, border: "1px solid var(--line)", borderRadius: 7, font: "inherit" }} />
        <button className="btn sm">Find</button></form>
      {pages.length > 0 && <><h3>Pages</h3><div className="card" style={{ padding: "2px 12px", marginBottom: 12 }}>{pages.map(([h, t]) => <Link key={h} href={h} style={{ padding: "10px 0", borderBottom: "1px solid var(--line)", display: "block" }}>{t}</Link>)}</div></>}
      {q && <><h3>Customers and jobs</h3>
        {jobs.length ? jobs.map((r) => <Link key={r.id as string} href={`/ops/job/${r.id}`} className="card" style={{ textDecoration: "none", marginBottom: 8, padding: 12, gap: 4 }}>
          <strong className="small">{(r.customer_name as string) ?? "No name yet"} · {r.postcode as string}</strong>
          <span className="small muted">{r.title as string} · {r.status as string}</span><span className="small">{aud(r.amount as number)}</span></Link>)
          : <p className="small muted">{q.length < 2 ? "Type at least two letters." : "No customers match."}</p>}</>}
    </AdminShell>
  );
}
