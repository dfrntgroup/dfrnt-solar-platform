import { db } from "@dfrnt/db";
import { AdminShell, input } from "@/components/Admin";
import { requireStaff } from "@/lib/auth";
import { AUDIENCES, campaignResults, REBATE_TEMPLATE, rebateDate, recipients, render } from "@/lib/campaigns";
import { emailSettings } from "@/lib/email";
import { campaignSave, campaignSend, campaignTest } from "../actions";

export const dynamic = "force-dynamic";

/** G5: email campaigns to people who gave us their email for a price (or joined the waitlist). Test first, then send. */
export default async function Campaigns({ searchParams }: { searchParams: Promise<{ error?: string; edit?: string }> }) {
  const me = await requireStaff();
  const sp = await searchParams;
  const rows = await db()`select id, name, audience, subject, body, status, created_at, sent_at from campaigns order by created_at desc limit 30`;
  const until = await rebateDate();
  const { mode } = await emailSettings();
  const sizes = Object.fromEntries(await Promise.all(Object.keys(AUDIENCES).map(async (a) => [a, (await recipients(a)).length])));
  const results = Object.fromEntries(await Promise.all(rows.filter((r) => r.status !== "draft").map(async (r) => [r.id as string, await campaignResults(r.id as string)])));
  const edit = rows.find((r) => r.id === sp.edit && r.status === "draft");
  return (
    <AdminShell who={me.name} area="ops">
      <h1 style={{ fontSize: 28 }}>Campaigns</h1>
      <p className="muted">Email mode is <strong>{mode}</strong>{mode !== "live" ? " — sends go to the test address only" : ""}. Everyone gets an unsubscribe link; people who unsubscribe or have already bought are left out automatically. Tokens: {"{name} {system} {price} {until} {link}"}. Rebate step-down date: {until}.</p>
      {sp.error && <div className="note">{sp.error}</div>}
      <form action={campaignSave} className="card" style={{ marginBottom: 16 }}>
        {edit && <input type="hidden" name="id" value={edit.id as string} />}
        <strong>{edit ? "Edit draft" : "New campaign"}</strong>
        <input name="name" placeholder="Name (for you)" defaultValue={(edit?.name as string) ?? "Rebate deadline"} style={input} />
        <select name="audience" defaultValue={(edit?.audience as string) ?? "saved"} style={input}>{Object.entries(AUDIENCES).map(([k, v]) => <option key={k} value={k}>{v} ({sizes[k]} people)</option>)}</select>
        <input name="subject" defaultValue={(edit?.subject as string) ?? REBATE_TEMPLATE.subject} style={input} />
        <textarea name="body" defaultValue={(edit?.body as string) ?? REBATE_TEMPLATE.body} style={{ ...input, minHeight: 180 }} />
        <button className="btn sm">{edit ? "Save draft" : "Create draft"}</button>
      </form>
      {rows.map((c) => { const r = results[c.id as string]; return (
        <div key={c.id as string} className="card" style={{ marginBottom: 10 }}>
          <strong>{c.name as string} · {c.status as string}</strong>
          <span className="small">{AUDIENCES[c.audience as string]} · {sizes[c.audience as string]} people now</span>
          <details><summary className="small">Preview</summary><pre style={{ whiteSpace: "pre-wrap", fontSize: 13 }}>{render(c.subject as string, { email: "", name: "Sam", quoteId: null, ticketId: null, system: "SolaX 10 kW solar + 15.3 kWh battery", price: "$12,346", link: "" }, until, "[their link]")}{"\n\n"}{render(c.body as string, { email: "", name: "Sam", quoteId: null, ticketId: null, system: "SolaX 10 kW solar + 15.3 kWh battery", price: "$12,346", link: "" }, until, "[their link]")}</pre></details>
          {r && <span className="small">Sent {r.sent} · came back {r.clicked} · secured after {r.secured} · paid after {r.paid}</span>}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
            {c.status === "draft" && <a className="btn ghost sm" href={`/ops/campaigns?edit=${c.id}`}>Edit</a>}
            <form action={campaignTest}><input type="hidden" name="id" value={c.id as string} /><button className="btn ghost sm">Send me a test</button></form>
            {c.status !== "sent" && <form action={campaignSend} style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="hidden" name="id" value={c.id as string} />
              <label className="small"><input type="checkbox" name="confirm" /> I&apos;ve checked the test</label><button className="btn sm">{c.status === "sending" ? "Send next 200" : "Send"}</button></form>}
          </div>
        </div>); })}
    </AdminShell>
  );
}
