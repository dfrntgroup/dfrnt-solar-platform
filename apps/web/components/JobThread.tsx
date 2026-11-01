// Scheduling S5: one message thread per booked job, between customer, installer and us. Kept on the job record.
import { db } from "@dfrnt/db";

export async function JobThread({ quoteId, action, hidden, me, title = "Messages about your install" }: {
  quoteId: string; action: (f: FormData) => Promise<void>; hidden: React.ReactNode; me: "customer" | "installer" | "ops"; title?: string;
}) {
  const rows = await db()`select author, author_name, body, created_at from job_messages where quote_id = ${quoteId} order by created_at`;
  const who = (a: string, n: string | null) => a === me ? "You" : a === "installer" ? (n ?? "Your installer") : a === "customer" ? (n ?? "Customer") : "DFRNT Solar";
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <strong>{title}</strong>
      {rows.length ? rows.map((m, i) => (
        <div key={i} style={{ borderTop: "1px solid var(--line)", padding: "8px 0" }}>
          <span className="small muted">{who(m.author as string, m.author_name as string | null)} · {new Date(m.created_at as string).toLocaleString("en-AU", { timeZone: "Australia/Brisbane", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span>
          <div style={{ whiteSpace: "pre-wrap" }}>{m.body as string}</div>
        </div>)) : <span className="small muted">Nothing yet. Gate codes, pets, where to park: ask or tell here.</span>}
      <form action={action} style={{ display: "grid", gap: 8, marginTop: 8 }}>
        {hidden}
        <textarea name="body" required maxLength={2000} placeholder="Write a message" style={{ minHeight: 70, padding: 10, border: "1px solid var(--line)", borderRadius: 6, font: "inherit" }} />
        <button className="btn ghost sm" type="submit">Send</button>
      </form>
    </div>
  );
}
