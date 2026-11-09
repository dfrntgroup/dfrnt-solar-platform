import { lifecycleLabel } from "@dfrnt/engine";
import { db } from "@dfrnt/db";
import { AdminShell, input } from "@/components/Admin";
import { requireStaff } from "@/lib/auth";
import { reviewDecide } from "../actions";

export const dynamic = "force-dynamic";

/** O17: every review from a real install, in order. Publish good and bad alike; hide only fakes or rule breaks. */
export default async function OpsReviews() {
  const me = await requireStaff();
  const rows = await db()`select r.id, r.rating, r.body, r.first_name, r.suburb, r.status, r.reply, r.created_at::date::text d, q.token, q.id qid, i.business_name
    from reviews r join quotes q on q.id = r.quote_id left join installers i on i.id = r.installer_id order by (r.status = 'pending') desc, r.created_at desc limit 300`;
  const pending = rows.filter((r) => r.status === "pending").length;
  return (
    <AdminShell who={me.name} area="ops">
      <h1 style={{ fontSize: 28 }}>Reviews</h1>
      <p className="muted">{pending} waiting. Publish every genuine review, good or bad. Hide only if it isn&apos;t from this install or breaks the rules (abuse, personal details). Reply to anything under 4 stars.</p>
      {rows.map((r) => (
        <div key={r.id as string} className="card" style={{ marginBottom: 12 }}>
          <p className="small muted">{r.d as string} · {r.first_name as string ?? ""}, {r.suburb as string ?? ""} · {r.business_name as string ?? "no installer"} · <a href={`/ops/job/${r.qid}`}>job</a> · <strong>{lifecycleLabel("reviews", r.status as string)}</strong></p>
          <p><span className="stars">{"★".repeat(r.rating as number)}{"☆".repeat(5 - (r.rating as number))}</span></p>
          <p>{r.body as string}</p>
          {r.reply && <p className="small muted">Our reply: {r.reply as string}</p>}
          <div className="filters">
            {r.status !== "published" && <form action={reviewDecide}><input type="hidden" name="id" value={r.id as string} /><input type="hidden" name="to" value="published" /><button className="btn sm">Publish</button></form>}
            {r.status !== "hidden" && <form action={reviewDecide}><input type="hidden" name="id" value={r.id as string} /><input type="hidden" name="to" value="hidden" /><button className="btn sm ghost">Hide</button></form>}
          </div>
          <form action={reviewDecide} style={{ display: "flex", gap: 8, marginTop: 8 }}><input type="hidden" name="id" value={r.id as string} /><input type="hidden" name="to" value="reply" /><input name="reply" defaultValue={r.reply as string ?? ""} placeholder="Public reply" style={input} /><button className="btn sm ghost">Save reply</button></form>
        </div>))}
      {rows.length === 0 && <p className="muted">No reviews yet. Customers are asked a few days after their install is lodged.</p>}
    </AdminShell>
  );
}
