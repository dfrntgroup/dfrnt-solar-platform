import Link from "next/link";
import { db } from "@dfrnt/db";
import { AdminShell } from "@/components/Admin";
import { requireStaff } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Content() {
  const me = await requireStaff();
  const items = await db()`select id, slug, title, status, tags, updated_at from content_items order by updated_at desc`;
  return (
    <AdminShell who={me.name} area="ops">
      <h1 style={{ fontSize: 28 }}>Content</h1>
      <p><Link className="btn sm" href="/ops/content/new">New article</Link></p>
      <table className="lines"><tbody>{items.map((i) => <tr key={i.id as string}><td><Link href={`/ops/content/${i.id}`}>{i.title as string}</Link><br /><span className="small muted">/learn/{i.slug as string} · {(i.tags as string[]).join(", ")}</span></td><td>{i.status as string}</td></tr>)}</tbody></table>
    </AdminShell>
  );
}
