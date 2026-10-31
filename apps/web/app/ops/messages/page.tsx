import Link from "next/link";
import { db } from "@dfrnt/db";
import { AdminShell } from "@/components/Admin";
import { requireStaff } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Messages() {
  const me = await requireStaff();
  const rows = await db()`select m.template, m.channel, m.recipient, m.subject, m.body, m.status, m.created_at, q.id qid from messages m left join quotes q on q.id = m.quote_id order by m.created_at desc limit 200`;
  return (
    <AdminShell who={me.name} area="ops">
      <h1 style={{ fontSize: 28 }}>Messages</h1>
      <div className="note">Email and SMS are switched off until go-live. Every message is written here as &quot;held&quot; so the wording can be checked.</div>
      <table className="lines" style={{ marginTop: 12 }}><tbody>{rows.map((m, i) => (
        <tr key={i}><td className="small">{new Date(m.created_at as string).toLocaleString("en-AU", { timeZone: "Australia/Brisbane" })}</td><td>{m.template as string}</td><td>{m.recipient as string}</td>
          <td><strong>{m.subject as string}</strong><br /><span className="small muted">{m.body as string}</span></td><td>{m.status as string}</td><td>{m.qid ? <Link href={`/ops/job/${m.qid}`}>job</Link> : null}</td></tr>))}</tbody></table>
    </AdminShell>
  );
}
