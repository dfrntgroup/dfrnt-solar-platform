import { lifecycleLabel } from "@dfrnt/engine";
import { Step } from "@/components/Step";
import Link from "next/link";
import { db } from "@dfrnt/db";
import { AdminShell, input } from "@/components/Admin";
import { requireStaff } from "@/lib/auth";
import { getSetting } from "@/lib/settings";
import { dashboardUrl, publishableKey, stripeReady, stripeTestMode } from "@/lib/stripe";
import { aud2 } from "@/lib/site";
import { bankSave, financeSave, stripeReconcile, stripeRegister, extraPaymentReceived } from "../actions";

export const dynamic = "force-dynamic";

/** S1–S5 in Ops: Stripe status, webhook, finance lenders, every online payment with its fee. */
export default async function Payments({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const me = await requireStaff();
  const sp = await searchParams;
  const st = await getSetting("stripe");
  const fin = await getSetting("finance");
  const bank = await getSetting("bank");
  const pays = await db()`select p.id, p.kind, p.method, p.amount::float8 amount, p.fee::float8 fee, p.status, p.provider_ref, p.provider_status, p.created_at, q.id qid, q.customer_name, q.title
    from payments p left join quotes q on q.id = p.quote_id where p.method in ('card','payto') or p.method like 'finance:%' order by p.created_at desc limit 80`;
  const extras = await db()`select p.id, p.kind, p.amount::float8 amount, p.reference, q.id qid, q.customer_name, q.title from payments p join quotes q on q.id = p.quote_id
    where p.kind = 'variation' and p.method = 'bank' and p.status = 'pending' order by p.created_at`;
  const [sum] = await db()`select coalesce(sum(amount) filter (where status = 'received' and kind <> 'refund'), 0)::float8 taken, coalesce(sum(fee), 0)::float8 fees,
    count(*) filter (where status = 'received' and kind <> 'refund')::int n from payments where method in ('card','payto') and created_at > now() - interval '30 days'`;
  const errs = await db()`select id, type, error, received_at from stripe_events where error is not null and handled_at is null order by received_at desc limit 10`;
  const disputes = await db()`select id, subject, status from tickets where kind = 'dispute' and status <> 'closed' order by created_at desc limit 10`;
  const keys = stripeReady() && !!publishableKey();
  return (
    <AdminShell who={me.name} area="ops">
      <h1 style={{ fontSize: 28 }}>Payments</h1>
      {sp.error && <div className="note">{sp.error}</div>}
      <div className="card" style={{ marginBottom: 12 }}>
        <strong>Stripe {keys ? (stripeTestMode() ? "· sandbox (test money only)" : "· LIVE") : "· not connected"}</strong>
        {!keys && <span className="small">Add STRIPE_SECRET_KEY and NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY in Vercel. Until then customers see bank transfer only.</span>}
        {keys && <span className="small">Webhook: {st.webhook_id ? <>registered {st.registered_at?.slice(0, 10)} → {st.webhook_url} {st.livemode === false && stripeTestMode() ? "(sandbox)" : st.livemode ? "(live)" : ""}</> : <strong>not registered: payments won&apos;t mark themselves paid</strong>}</span>}
        {keys && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <form action={stripeRegister}><button className="btn sm" type="submit">{st.webhook_id ? "Re-register webhook" : "Register webhook"}</button></form>
          <form action={stripeReconcile}><button className="btn ghost sm" type="submit">Check open payments now</button></form></div>}
        <span className="small muted">Last 30 days online: {sum!.n as number} payments · {aud2(sum!.taken as number)} taken · {aud2(sum!.fees as number)} in Stripe fees.</span>
      </div>
      {disputes.length > 0 && <div className="note"><strong>Open disputes:</strong> {disputes.map((d) => <span key={d.id as string}> <Link href={`/ops/support`}>{d.subject as string}</Link> ·</span>)}</div>}
      {errs.length > 0 && <div className="note"><strong>Webhook events that failed (Stripe will retry):</strong> {errs.map((e) => <span key={e.id as string}> {e.type as string}: {e.error as string} ·</span>)}</div>}

      <form action={bankSave} className="card" style={{ marginBottom: 12 }}>
        <strong>Bank transfers</strong>
        <span className="small muted">What customers see on the pay screen. Until this is filled in, bank transfer isn&apos;t offered. Changes are logged. Owner only.</span>
        <input name="account_name" defaultValue={bank.account_name} placeholder="Account name (e.g. DFRNT Group Pty Ltd)" style={input} />
        <input name="bank" defaultValue={bank.bank} placeholder="Bank (e.g. CBA)" style={input} />
        <div style={{ display: "flex", gap: 8 }}><input name="bsb" defaultValue={bank.bsb} placeholder="BSB" style={{ ...input, width: 120 }} /><input name="account_number" defaultValue={bank.account_number} placeholder="Account number" style={input} /></div>
        <button className="btn sm" type="submit">Save bank details</button>
      </form>
      <form action={financeSave} className="card" style={{ marginBottom: 12 }}>
        <strong>Finance at checkout</strong>
        <span className="small muted">The customer is sent to the lender&apos;s application. Put {"{ref}"} and {"{amount}"} in the link and they&apos;re filled in. Mark paid on the job when the lender pays you.</span>
        {fin.providers.map((p) => (
          <div key={p.id} style={{ display: "grid", gap: 6, padding: "8px 0", borderTop: "1px solid var(--line)" }}>
            <label className="small"><input type="checkbox" name={`on_${p.id}`} defaultChecked={p.on} /> Show {p.name}</label>
            <input name={`url_${p.id}`} defaultValue={p.url} placeholder={`${p.name} application link (https://…)`} style={input} />
            <input name={`blurb_${p.id}`} defaultValue={p.blurb} placeholder="One line shown on the button" style={input} />
          </div>))}
        <button className="btn sm" type="submit">Save</button>
      </form>

      {extras.length > 0 && <><h2>Bank transfers for changes and add-ons</h2>
      <table className="lines"><tbody>{extras.map((p) => <tr key={p.id as string}>
        <td><Link href={`/ops/job/${p.qid}`}>{(p.customer_name as string) ?? (p.title as string)}</Link></td><td>{p.kind === "variation" ? "Change to the install" : "Add-on"} · ref {p.reference as string}</td>
        <td className="r">{aud2(p.amount as number)}</td><td><Step action={extraPaymentReceived} fields={{ payment: p.id as string, id: p.qid as string }} label="Funds received" /></td></tr>)}</tbody></table></>}
      <h2>Online payments</h2>
      <table className="lines"><tbody>
        {pays.map((p) => <tr key={p.id as string}>
          <td>{(p.created_at as Date).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "Australia/Brisbane" })}</td>
          <td>{p.qid ? <Link href={`/ops/job/${p.qid}`}>{(p.customer_name as string) ?? (p.title as string)}</Link> : "—"}</td>
          <td>{p.kind as string} · {String(p.method).replace("finance:", "finance ")}</td>
          <td className="r">{aud2(p.amount as number)}{p.fee != null ? <span className="small muted"> fee {aud2(p.fee as number)}</span> : null}</td>
          <td>{lifecycleLabel("payments", p.status as string)}{p.provider_ref ? <> · <a href={dashboardUrl(p.provider_ref as string)} target="_blank" rel="noreferrer">Stripe</a></> : null}</td>
        </tr>)}
        {!pays.length && <tr><td className="muted">No online payments yet.</td></tr>}
      </tbody></table>
    </AdminShell>
  );
}
