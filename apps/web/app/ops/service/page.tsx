import Link from "next/link";
import { db } from "@dfrnt/db";
import { AdminShell } from "@/components/Admin";
import { requireStaff } from "@/lib/auth";
import { getSetting } from "@/lib/settings";
import { aud, longDate } from "@/lib/site";
import { memberAction } from "../actions";

export const dynamic = "force-dynamic";

/** R1: service plan members, payments, renewals and visits. */
export default async function Service() {
  const me = await requireStaff();
  const plan = await getSetting("service_plan");
  const rows = await db()`select m.id, m.status, m.price::float8 price, m.reference, m.started_on::text started_on, m.renews_on::text renews_on, m.last_visit_on::text last_visit_on,
      q.id qid, q.customer_name, q.postcode, q.status qs from memberships m join quotes q on q.id = m.quote_id order by (m.status = 'pending') desc, m.renews_on nulls first`;
  const due = rows.filter((r) => r.status === "active" && (!r.last_visit_on || (r.last_visit_on as string) < new Date(Date.now() - 300 * 86400_000).toISOString().slice(0, 10)));
  const Btn = ({ id, what, label }: { id: string; what: string; label: string }) => <form action={memberAction} style={{ display: "inline" }}><input type="hidden" name="id" value={id} /><input type="hidden" name="what" value={what} /><button className="btn ghost sm">{label}</button></form>;
  return (
    <AdminShell who={me.name} area="ops">
      <h1 style={{ fontSize: 28 }}>Service plan</h1>
      <p className="muted">{plan.on ? `On at ${aud(plan.price)} a year.` : "Off (switch on in Ops → Settings)."} {rows.filter((r) => r.status === "active").length} active members · {due.length} visits due. Book visits through the Booking desk or the installer&apos;s offered days.</p>
      <table className="lines small"><tbody>
        {rows.map((r) => <tr key={r.id as string}><td><Link href={`/ops/job/${r.qid}`}>{(r.customer_name as string) ?? "Customer"}</Link><br /><span className="muted">{r.postcode as string} · job {r.qs as string}</span></td>
          <td>{r.status as string} · {aud(r.price as number)} · ref {r.reference as string}<br /><span className="muted">{r.renews_on ? `renews ${longDate(r.renews_on as string)}` : "not started"}{r.last_visit_on ? ` · visited ${longDate(r.last_visit_on as string)}` : ""}</span></td>
          <td className="r">{r.status !== "active" && r.status !== "cancelled" && <Btn id={r.id as string} what="paid" label="Payment received" />}
            {r.status === "active" && <><Btn id={r.id as string} what="paid" label="Renewal paid" /> <Btn id={r.id as string} what="visit" label="Visit done" /></>}
            {r.status !== "cancelled" && <Btn id={r.id as string} what="cancel" label="Cancel" />}</td></tr>)}
        {!rows.length && <tr><td className="muted">No members yet.</td></tr>}
      </tbody></table>
    </AdminShell>
  );
}
