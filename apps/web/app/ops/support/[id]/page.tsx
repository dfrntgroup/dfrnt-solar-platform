import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@dfrnt/db";
import { AdminShell, input } from "@/components/Admin";
import { requireStaff } from "@/lib/auth";
import { ticketReply } from "../../actions";

export const dynamic = "force-dynamic";

export default async function Ticket({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const me = await requireStaff();
  const { id } = await params;
  const { error } = await searchParams;
  const [t] = await db()`select * from tickets where id = ${id}`;
  if (!t) notFound();
  const replies = await db()`select author, body, internal, created_at from ticket_replies where ticket_id = ${id} order by id`;
  return (
    <AdminShell who={me.name} area="ops">
      <p className="small"><Link href="/ops/support">← Support</Link>{t.quote_id ? <> · <Link href={`/ops/job/${t.quote_id}`}>Job</Link></> : null}</p>
      <h1 style={{ fontSize: 26 }}>{t.subject as string}</h1>
      <p className="small muted">{t.kind as string} · {t.name as string ?? ""} · {t.email as string ?? ""} · {t.phone as string ?? ""} · {t.status as string}</p>
      {error && <div className="note">{error}</div>}
      <div className="card" style={{ marginBottom: 10 }}>{t.body as string}</div>
      {replies.map((r, i) => <div key={i} className="card" style={{ marginBottom: 10, background: r.internal ? "var(--warn-bg)" : undefined }}><span className="small muted">{r.author as string}{r.internal ? " · internal note" : ""}</span>{r.body as string}</div>)}
      <form action={ticketReply} className="card"><input type="hidden" name="id" value={id} />
        <textarea name="body" style={{ ...input, minHeight: 120 }} />
        <label className="small"><input type="checkbox" name="internal" /> Internal note (not sent)</label>
        <label className="small"><input type="checkbox" name="close" /> Close ticket</label>
        <button className="btn sm">Send</button></form>
    </AdminShell>
  );
}
