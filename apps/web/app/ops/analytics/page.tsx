import { db } from "@dfrnt/db";
import { AdminShell } from "@/components/Admin";
import { requireStaff } from "@/lib/auth";
import { aud } from "@/lib/site";

export const dynamic = "force-dynamic";

export default async function Analytics() {
  const me = await requireStaff();
  const [v] = await db()`select count(*) filter (where name = 'page_view')::int views, count(distinct session) filter (where name = 'page_view')::int sessions,
    count(*) filter (where name = 'configure')::int configures from analytics_events where at > now() - interval '30 days'`;
  const [f] = await db()`select count(*)::int created, count(*) filter (where status <> 'saved')::int secured,
    count(*) filter (where priced_at is not null)::int priced, count(*) filter (where signed_at is not null)::int signed, count(*) filter (where paid_at is not null)::int paid,
    coalesce(sum(amount_payable) filter (where paid_at is not null), 0)::float8 revenue from quotes where created_at > now() - interval '30 days'`;
  const [c] = await db()`select count(*) filter (where status <> 'saved')::int secured, count(*) filter (where checkout_at is not null)::int contact,
      count(*) filter (where site_draft is not null or site is not null)::int home, count(*) filter (where site is not null)::int submitted,
      count(*) filter (where design_review)::int reviewed, count(*) filter (where design_review and signed_at is not null)::int reviewed_signed,
      count(*) filter (where site is not null and not design_review)::int instant, count(*) filter (where site is not null and not design_review and signed_at is not null)::int instant_signed
    from quotes where created_at > now() - interval '30 days'`;
  const [cb] = await db()`select count(*)::int n, count(*) filter (where status = 'done')::int done from callbacks where created_at > now() - interval '30 days'`;
  const pct = (a: number, b: number) => b ? `${Math.round((a / b) * 100)}%` : "–";
  const pages = await db()`select path, count(*)::int n from analytics_events where name = 'page_view' and at > now() - interval '30 days' group by 1 order by 2 desc limit 15`;
  const steps: [string, number][] = [["Sessions", v!.sessions as number], ["Quotes created", f!.created as number], ["Secured", f!.secured as number], ["Priced", f!.priced as number], ["Signed", f!.signed as number], ["Paid", f!.paid as number]];
  return (
    <AdminShell who={me.name} area="ops">
      <h1 style={{ fontSize: 28 }}>Last 30 days</h1>
      <p className="muted">{v!.views as number} page views · {v!.configures as number} configurator changes · {aud(f!.revenue as number)} paid</p>
      <table className="lines"><tbody>{steps.map(([k, n], i) => <tr key={k}><td>{k}</td><td className="r"><strong>{n}</strong></td><td className="r muted">{i > 0 && steps[i - 1]![1] ? `${Math.round((n / steps[i - 1]![1]) * 100)}%` : ""}</td></tr>)}</tbody></table>
      <h3 style={{ marginTop: 20 }}>Checkout</h3>
      <table className="lines"><tbody>
        {([["Secured a price", c!.secured], ["Step 1: gave details", c!.contact], ["Step 2: home details", c!.home], ["Step 3: photos sent", c!.submitted]] as [string, number][]).map(([k, n], i, a) => <tr key={k}><td>{k}</td><td className="r"><strong>{n}</strong></td><td className="r muted">{i > 0 ? pct(n, a[i - 1]![1]) : ""}</td></tr>)}
        <tr><td>Call-back requests</td><td className="r"><strong>{cb!.n as number}</strong></td><td className="r muted">{cb!.done as number} called</td></tr>
      </tbody></table>
      <h3 style={{ marginTop: 20 }}>Design checks (decides the $99 switch)</h3>
      <table className="lines"><tbody>
        <tr><td>Priced instantly (standard homes)</td><td className="r"><strong>{c!.instant as number}</strong></td><td className="r muted">{pct(c!.instant_signed as number, c!.instant as number)} signed</td></tr>
        <tr><td>Installer photo check</td><td className="r"><strong>{c!.reviewed as number}</strong></td><td className="r muted">{pct(c!.reviewed_signed as number, c!.reviewed as number)} signed</td></tr>
      </tbody></table>
      <p className="small muted">If photo-checked jobs rarely sign, switch the fee on in Ops → Settings.</p>
      <h3 style={{ marginTop: 20 }}>Top pages</h3>
      <table className="lines small"><tbody>{pages.map((p) => <tr key={p.path as string}><td>{p.path as string}</td><td className="r">{p.n as number}</td></tr>)}</tbody></table>
    </AdminShell>
  );
}
