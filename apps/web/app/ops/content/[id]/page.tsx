import { db } from "@dfrnt/db";
import { DEFAULT_CATALOGUE } from "@dfrnt/engine";
import { AdminShell, input } from "@/components/Admin";
import { requireStaff } from "@/lib/auth";
import { saveContent } from "../../actions";

export const dynamic = "force-dynamic";

export default async function Edit({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const me = await requireStaff();
  const { id } = await params;
  const { error } = await searchParams;
  const [c] = id === "new" ? [{ id: "new", slug: "", title: "", summary: "", body: "", system_slug: "", tags: [] as string[], status: "draft" }]
    : await db()`select id, slug, title, summary, body, system_slug, tags, status from content_items where id = ${id}`;
  if (!c) return null;
  return (
    <AdminShell who={me.name} area="ops">
      <h1 style={{ fontSize: 28 }}>{id === "new" ? "New article" : c.title as string}</h1>
      {error && <div className="note">{error}</div>}
      <form action={saveContent} className="card">
        <input type="hidden" name="id" value={c.id as string} />
        <label className="small">Title<input name="title" defaultValue={c.title as string} style={input} required /></label>
        <label className="small">URL slug<input name="slug" defaultValue={c.slug as string} style={input} required pattern="[a-z0-9-]+" /></label>
        <label className="small">Summary<input name="summary" defaultValue={(c.summary as string) ?? ""} style={input} /></label>
        <label className="small">Body (## headings, - lists, **bold**)<textarea name="body" defaultValue={c.body as string} style={{ ...input, minHeight: 320 }} /></label>
        <label className="small">Live price module<select name="system_slug" defaultValue={(c.system_slug as string) ?? ""} style={input}><option value="">None</option>{DEFAULT_CATALOGUE.systems.map((s) => <option key={s.slug} value={s.slug}>{s.brand} · {s.title}</option>)}</select></label>
        <label className="small">Rule tags (comma separated: rebate, battery, gst…)<input name="tags" defaultValue={(c.tags as string[]).join(", ")} style={input} /></label>
        <label className="small">Status<select name="status" defaultValue={c.status as string} style={input}><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></label>
        <button className="btn" type="submit">Save</button>
      </form>
    </AdminShell>
  );
}
