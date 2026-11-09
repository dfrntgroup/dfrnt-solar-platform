import { lifecycleLabel } from "@dfrnt/engine";
import Link from "next/link";
import { db } from "@dfrnt/db";
import { AdminShell } from "@/components/Admin";
import { requireStaff } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Support() {
  const me = await requireStaff();
  const rows = await db()`select id, kind, name, subject, status, created_at, extract(epoch from now() - created_at)/3600 as hours from tickets order by status = 'closed', created_at limit 200`;
  return (
    <AdminShell who={me.name} area="ops">
      <h1 style={{ fontSize: 28 }}>Support</h1>
      <p className="muted">Reply within 24 hours. Replies go to the customer by email (held until email is switched on).</p>
      <table className="lines"><tbody>{rows.map((t) => <tr key={t.id as string}><td><Link href={`/ops/support/${t.id}`}>{t.subject as string}</Link><br /><span className="small muted">{t.kind as string} · {t.name as string ?? ""}</span></td>
        <td>{lifecycleLabel("tickets", t.status as string)}</td><td className="small" style={{ color: t.status !== "closed" && (t.hours as number) > 20 ? "var(--warn)" : undefined }}>{Math.round(t.hours as number)} h</td></tr>)}</tbody></table>
    </AdminShell>
  );
}
