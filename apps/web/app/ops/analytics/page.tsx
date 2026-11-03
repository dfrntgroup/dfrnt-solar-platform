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
  const heard = await db()`select coalesce(heard_from, 'not asked yet') h, count(*)::int n, coalesce(sum(amount_payable), 0)::float8 rev from quotes where paid_at > now() - interval '90 days' group by 1 order by 3 desc`;
  const tracked = await db()`select case when attribution ? 'gclid' then 'Google Ads click' when attribution ? 'fbclid' or attribution ? 'fbc' then 'Meta ad click' when attribution ? 'utm_source' then 'utm: ' || (attribution->>'utm_source') when coalesce(attribution->>'ref', '') <> '' then 'Referred by ' || split_part(split_part(attribution->>'ref', '//', 2), '/', 1) else 'Direct / unknown' end src,
      count(*)::int n, count(*) filter (where paid_at is not null)::int paid, coalesce(sum(amount_payable) filter (where paid_at is not null), 0)::float8 rev
    from quotes where created_at > now() - interval '90 days' and status <> 'saved' group by 1 order by 4 desc, 2 desc limit 12`;
  const conv = await db()`select e.name, e.platform, e.status, e.http, e.created_at, q.customer_name from conversion_events e join quotes q on q.id = e.quote_id order by e.created_at desc limit 15`;
  const { googleFeedKey, metaReady } = await import("@/lib/conversions");
  const { siteUrl } = await import("@/lib/messages");
  const label: Record<string, string> = { facebook: "Facebook or Instagram", google: "Google", youtube: "YouTube", friend: "A friend or family", saw_install: "Saw an install", other: "Something else" };
  const pct = (a: number, b: number) => b ? `${Math.round((a / b) * 100)}%` : "–";
  const pages = await db()`select path, count(*)::int n from analytics_events where name = 'page_view' and at > now() - interval '30 days' group by 1 order by 2 desc limit 15`;
  // Build your own: which combinations people build, so the best sellers can become catalogue systems.
  const [bs] = await db()`select count(distinct session)::int started from analytics_events where name = 'build_step' and at > now() - interval '30 days'`;
  const builds = await db()`select title, count(*)::int n, count(*) filter (where paid_at is not null)::int paid, coalesce(sum(amount_payable) filter (where paid_at is not null), 0)::float8 rev
    from quotes where title like 'Custom ·%' and status <> 'saved' and created_at > now() - interval '90 days' group by 1 order by 2 desc, 3 desc limit 15`;
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
      <h3 style={{ marginTop: 20 }}>What sold (last 90 days)</h3>
      <div className="pdp">
        <div><p className="small muted">Customers said (paid jobs)</p>
          <table className="lines small"><tbody>{heard.map((h) => <tr key={h.h as string}><td>{label[h.h as string] ?? h.h}</td><td className="r">{h.n as number}</td><td className="r">{aud(h.rev as number)}</td></tr>)}</tbody></table></div>
        <div><p className="small muted">Tracking said (secured prices → paid)</p>
          <table className="lines small"><tbody>{tracked.map((t) => <tr key={t.src as string}><td>{t.src as string}</td><td className="r">{t.n as number} → {t.paid as number}</td><td className="r">{aud(t.rev as number)}</td></tr>)}</tbody></table></div>
      </div>
      <h3 style={{ marginTop: 20 }}>Custom builds</h3>
      <p className="small muted">{bs!.started as number} people used Build your own in the last 30 days. Secured builds by combination (90 days):</p>
      <table className="lines small"><tbody>{builds.length ? builds.map((b) => <tr key={b.title as string}><td>{(b.title as string).replace(/^Custom · /, "")}</td><td className="r">{b.n as number} secured → {b.paid as number} paid</td><td className="r">{aud(b.rev as number)}</td></tr>) : <tr><td className="muted">No custom builds secured yet.</td></tr>}</tbody></table>
      <h3 style={{ marginTop: 20 }}>Ad platforms</h3>
      <p className="small">Meta Conversions API: {metaReady() ? <strong>on</strong> : "off (add META_PIXEL_ID and META_CAPI_TOKEN in Vercel)"}. Meta pixel: {process.env.NEXT_PUBLIC_META_PIXEL_ID ? "on" : "off"}. Google tag: {process.env.NEXT_PUBLIC_GOOGLE_ADS_ID ? "on" : "off"}. Clarity: {process.env.NEXT_PUBLIC_CLARITY_ID ? "on" : "off"}.</p>
      <p className="small">Google Ads scheduled upload URL (Goals → Conversions → Uploads → Schedules → HTTPS, every 24 hours; conversion actions named DFRNT Lead, DFRNT Checkout complete, DFRNT Signed, DFRNT Paid): <code style={{ wordBreak: "break-all" }}>{siteUrl()}/api/v1/conversions/google?key={googleFeedKey()}</code></p>
      <table className="lines small"><tbody>{conv.length ? conv.map((c, i) => <tr key={i}><td>{new Date(c.created_at as string).toLocaleString("en-AU", { timeZone: "Australia/Brisbane" })}</td><td>{c.name as string}</td><td>{c.platform as string}</td><td>{c.status as string}{c.http ? ` (${c.http})` : ""}</td><td>{(c.customer_name as string) ?? ""}</td></tr>) : <tr><td className="muted">No conversion events yet.</td></tr>}</tbody></table>
      <h3 style={{ marginTop: 20 }}>Top pages</h3>
      <table className="lines small"><tbody>{pages.map((p) => <tr key={p.path as string}><td>{p.path as string}</td><td className="r">{p.n as number}</td></tr>)}</tbody></table>
    </AdminShell>
  );
}
