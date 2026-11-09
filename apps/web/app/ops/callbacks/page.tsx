import Link from "next/link";
import { db } from "@dfrnt/db";
import { AdminShell } from "@/components/Admin";
import { requireStaff } from "@/lib/auth";
import { aud } from "@/lib/site";
import { callbackDone } from "../actions";
import { checkoutLabel } from "@/lib/checkout-step";
import { JOB_LABELS, type JobState } from "@dfrnt/engine";

export const dynamic = "force-dynamic";

const STEP = (r: Record<string, unknown>) => r.status !== "secured" ? JOB_LABELS[r.status as JobState] ?? String(r.status ?? "") : checkoutLabel(r as never);

/** C5: call-back requests, plus everyone partway through checkout. */
export default async function Callbacks() {
  const me = await requireStaff();
  const calls = await db()`select c.id, c.created_at, c.name, c.phone, c.page, c.note, c.status, c.done_by, q.id quote_id, q.title, q.status qstatus, q.amount_payable::float8 amount
    from callbacks c left join quotes q on q.id = c.quote_id order by (c.status = 'new') desc, c.created_at desc limit 100`;
  const partway = await db()`select id, title, customer_name, customer_phone, customer_email, status, design_fee_status, checkout_at, site_draft, amount_payable::float8 amount, reminders,
      (select count(distinct kind)::int from quote_photos p where p.quote_id = quotes.id and p.superseded_at is null) photos
    from quotes where status = 'secured' and created_at > now() - interval '30 days' order by coalesce(checkout_at, created_at) desc limit 100`;
  const t = (d: unknown) => new Date(d as string).toLocaleString("en-AU", { timeZone: "Australia/Brisbane", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  return (
    <AdminShell who={me.name} area="ops">
      <h1 style={{ fontSize: 28 }}>Call-backs</h1>
      <p className="muted">Requests come to the call-back email in Ops → Settings as they arrive. Aim: call within the hour in business hours.</p>
      <table className="lines small"><tbody>
        {calls.length ? calls.map((c) => (
          <tr key={c.id as string} style={{ opacity: c.status === "done" ? 0.55 : 1 }}>
            <td>{t(c.created_at)}</td><td><strong>{c.name as string}</strong><br /><a href={`tel:${c.phone}`}>{c.phone as string}</a></td>
            <td>{c.quote_id ? <Link href={`/ops/job/${c.quote_id}`}>{c.title as string}</Link> : c.page as string}{c.qstatus ? <><br /><span className="muted">{c.qstatus as string} · {aud(c.amount as number)}</span></> : null}</td>
            <td className="r">{c.status === "new" ? <form action={callbackDone}><input type="hidden" name="id" value={c.id as string} /><button className="btn sm">Called</button></form> : `done · ${c.done_by ?? ""}`}</td>
          </tr>)) : <tr><td className="muted">No call-backs yet.</td></tr>}
      </tbody></table>
      <h2 style={{ marginTop: 28 }}>Partway through checkout</h2>
      <p className="muted small">Secured a price but haven&apos;t sent their photos. They get an email the same day and two days later; a call often closes it.</p>
      <table className="lines small"><tbody>
        {partway.map((q) => (
          <tr key={q.id as string}>
            <td><Link href={`/ops/job/${q.id}`}>{(q.customer_name as string) ?? "No name yet"}</Link><br /><span className="muted">{q.customer_phone ? <a href={`tel:${q.customer_phone}`}>{q.customer_phone as string}</a> : q.customer_email as string ?? ""}</span></td>
            <td>{q.title as string}<br /><span className="muted">{aud(q.amount as number)}</span></td>
            <td>{STEP(q)}{q.has_home ? ` · ${q.photos}/4 photos` : ""}<br /><span className="muted">{q.checkout_at ? `last step ${t(q.checkout_at)}` : "no details yet"}{Object.keys((q.reminders ?? {}) as object).some((k) => k.startsWith("co_")) ? " · followed up" : ""}</span></td>
          </tr>))}
      </tbody></table>
    </AdminShell>
  );
}
