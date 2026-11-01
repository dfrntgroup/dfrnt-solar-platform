import { db } from "@dfrnt/db";
import { DEFAULT_RULES } from "@dfrnt/engine";
import { AdminShell, input } from "@/components/Admin";
import { requireStaff } from "@/lib/auth";
import { opsProductDoc, opsRemoveProductDoc } from "../actions";

export const dynamic = "force-dynamic";

/** R0: datasheets, manuals and warranty terms per product; they appear on every System Record with that product. */
export default async function Products({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const me = await requireStaff();
  const sp = await searchParams;
  const r = DEFAULT_RULES as unknown as { panels: Record<string, { model?: string }>; inverters: Record<string, { model?: string }>; battery_families: Record<string, { module: { sku?: string; model?: string } }> };
  const items: [string, string][] = [
    ...Object.entries(r.panels).map(([k, v]) => [k, v.model ?? k] as [string, string]),
    ...Object.entries(r.inverters).map(([k, v]) => [k, v.model ?? k] as [string, string]),
    ...Object.values(r.battery_families).filter((b) => b.module.sku).map((b) => [b.module.sku!, b.module.model ?? b.module.sku!] as [string, string]),
  ];
  const docs = await db()`select id, sku, kind, title, url, path from product_docs order by sku, kind`;
  return (
    <AdminShell who={me.name} area="ops">
      <h1 style={{ fontSize: 28 }}>Product documents</h1>
      <p className="muted">Datasheets, manuals and warranty terms. Each one shows on the System Record of every customer with that product. Link to the manufacturer&apos;s own PDF, or upload it.</p>
      {sp.error && <div className="note">{sp.error}</div>}
      <table className="lines small"><tbody>
        {items.map(([sku, name]) => { const mine = docs.filter((d) => d.sku === sku); return (
          <tr key={sku}><td><strong>{name}</strong><br /><span className="muted">{sku}</span></td>
            <td>{mine.map((d) => <div key={d.id as string}><a href={`/docs/${d.id}`} target="_blank">{d.title as string}</a> <span className="muted">({d.kind as string})</span>
              <form action={opsRemoveProductDoc} style={{ display: "inline" }}><input type="hidden" name="id" value={d.id as string} /><button className="btn ghost sm">Remove</button></form></div>)}
              <details><summary className="muted">Add</summary>
                <form action={opsProductDoc} style={{ display: "grid", gap: 6, marginTop: 6 }}><input type="hidden" name="sku" value={sku} />
                  <select name="kind" style={input}><option value="datasheet">Datasheet</option><option value="manual">Manual</option><option value="warranty">Warranty terms</option></select>
                  <input name="title" placeholder="Title, e.g. Datasheet" style={input} />
                  <input name="url" placeholder="https:// link to the manufacturer's PDF" style={input} />
                  <input type="file" name="file" accept="application/pdf" />
                  <button className="btn sm">Add</button></form></details></td></tr>); })}
      </tbody></table>
    </AdminShell>
  );
}
