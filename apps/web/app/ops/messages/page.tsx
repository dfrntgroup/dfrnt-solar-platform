import Link from "next/link";
import { db } from "@dfrnt/db";
import { AdminShell, input } from "@/components/Admin";
import { requireStaff } from "@/lib/auth";
import { EMAIL_FROM, emailReady, emailSettings } from "@/lib/email";
import { resendMessage, sendTemplateTests, setEmailMode } from "../actions";

export const dynamic = "force-dynamic";

const MODE_TEXT = {
  held: "Held: nothing is sent. Every message is written here so the wording can be checked.",
  test: "Test: every message goes to the test address only, with the real recipient in the subject.",
  live: "Live: customers receive their messages.",
};

export default async function Messages({ searchParams }: { searchParams: Promise<{ sent?: string; error?: string }> }) {
  const me = await requireStaff();
  const sp = await searchParams;
  const { mode, test_to } = await emailSettings();
  const ready = emailReady();
  const rows = await db()`select m.id, m.template, m.recipient, m.subject, m.body, m.status, m.sent_to, m.error, m.created_at, q.id qid
    from messages m left join quotes q on q.id = m.quote_id order by m.created_at desc limit 200`;
  return (
    <AdminShell who={me.name} area="ops">
      <h1 style={{ fontSize: 28 }}>Messages</h1>
      {!ready && <div className="note">Email isn&apos;t connected yet: RESEND_API_KEY is not set in Vercel. Everything stays held.</div>}
      {sp.error && <div className="note">{sp.error}</div>}
      {sp.sent && <div className="ok small">{sp.sent}</div>}
      <div className="card" style={{ margin: "12px 0" }}>
        <p className="small muted">Sending from {EMAIL_FROM}. {MODE_TEXT[mode]}</p>
        <form action={setEmailMode} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <select name="mode" defaultValue={mode} aria-label="Email mode" style={{ ...input, width: 180 }}><option value="held">Held</option><option value="test">Test (to me only)</option><option value="live">Live (customers)</option></select>
          <input name="test_to" defaultValue={test_to} placeholder="Test address" aria-label="Test address" style={{ ...input, width: 260 }} />
          <button className="btn sm">Save</button>
        </form>
        <form action={sendTemplateTests} style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <input name="to" defaultValue={test_to} aria-label="Send every template to" style={{ ...input, width: 260 }} />
          <button className="btn sm ghost" disabled={!ready}>Send me one of every message</button>
        </form>
      </div>
      <table className="lines"><tbody>{rows.map((m) => (
        <tr key={m.id as string}><td className="small">{new Date(m.created_at as string).toLocaleString("en-AU", { timeZone: "Australia/Brisbane" })}</td><td>{m.template as string}</td>
          <td>{m.recipient as string}{m.sent_to && m.sent_to !== m.recipient ? <span className="small muted"><br />sent to {m.sent_to as string}</span> : null}</td>
          <td><strong>{m.subject as string}</strong><br /><span className="small muted">{m.body as string}</span>{m.error ? <span className="small" style={{ color: "#b42318" }}><br />{m.error as string}</span> : null}</td>
          <td>{m.status as string}{["failed", "held"].includes(m.status as string) && mode !== "held" && ready ? <form action={resendMessage}><input type="hidden" name="id" value={m.id as string} /><button className="btn sm ghost">Send</button></form> : null}</td>
          <td>{m.qid ? <Link href={`/ops/job/${m.qid}`}>job</Link> : null}</td></tr>))}</tbody></table>
    </AdminShell>
  );
}
