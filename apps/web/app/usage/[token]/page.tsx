import Link from "next/link";
import { notFound } from "next/navigation";
import { yieldFor } from "@dfrnt/engine";
import { Header, Footer } from "@/components/Header";
import { UsageCharts } from "@/components/UsageCharts";
import { linkByToken, pullLink, energySettings, type SystemPick } from "@/lib/energy";
import { aud } from "@/lib/site";
import { db } from "@dfrnt/db";
import { disconnectUsage, refreshUsage, setRoof } from "../actions";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const metadata = { title: "Your power usage", robots: { index: false } };

const pct = (n: number) => `${Math.round(n * 100)}%`;
const k = (n: number) => Math.round(n).toLocaleString("en-AU");

function SystemBlock({ p, label, base }: { p: SystemPick; label: string; base?: SystemPick | null }) {
  const r = p.replay;
  return (
    <div className="card">
      <div className="tag"><span>{p.brand}</span>{base && <span className="badge">+{aud(p.price - base.price)}</span>}</div>
      <p className="eyebrow" style={{ margin: 0 }}>{label}</p>
      <h3 style={{ margin: "2px 0 8px" }}>{p.title}</h3>
      {r ? <table className="lines small"><tbody>
        <tr><td>Power bill, a year</td><td className="r">{aud(r.before.bill)} → <strong>{aud(r.bill)}</strong></td></tr>
        <tr><td>Saving, a year</td><td className="r"><strong>{aud(r.saving)}</strong></td></tr>
        <tr><td>Power from your own roof</td><td className="r">{pct(r.self_sufficiency)}</td></tr>
        <tr><td>Pays for itself in</td><td className="r">{p.payback_years ? `${p.payback_years} years` : "—"}</td></tr>
      </tbody></table> : <p className="small muted">Savings need half-hour data, which your meter doesn&apos;t send. The size is from your total use.</p>}
      <div className="pay"><small>You pay, installed after rebates</small>{aud(p.price)}</div>
      <Link className={base ? "btn ghost" : "btn"} href={p.url}>{base ? "See this size" : "See this system and price"}</Link>
    </div>
  );
}

export default async function Usage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string>> }) {
  const { token } = await params;
  const sp = await searchParams;
  let l = await linkByToken(token);
  if (!l) notFound();
  if (["consenting", "waiting", "new"].includes(l.status) && !sp.cancelled) l = (await pullLink(l.id)) ?? l;
  const set = await energySettings();
  const loc = yieldFor(l.postcode, set.yields);
  const quote = l.quote_id ? (await db()`select token from quotes where id = ${l.quote_id}`)[0] : null;
  const recordHref = quote ? `/quote/${quote.token}` : null;
  const estimateHref = `/estimate?postcode=${l.postcode ?? ""}&solar=${l.has_solar ? "yes" : "no"}&phase=${l.phases}`;
  const waiting = ["consenting", "waiting", "new"].includes(l.status) && !sp.cancelled;
  const s = l.sizing, p = l.profile;
  return (
    <>
      {waiting && <meta httpEquiv="refresh" content="5" />}
      <Header postcode={l.postcode ?? "4551"} back={`/usage/${token}`} />
      <section><div className="wrap" style={{ maxWidth: 900 }}>
        <p className="eyebrow">Your power usage{l.nmi ? ` · NMI ${l.nmi}` : ""}</p>

        {sp.disconnected || l.status === "disconnected" ? <>
          <h1>Disconnected.</h1>
          <p>We&apos;ve stopped reading your meter data and deleted what we held. You can still size from your power bill.</p>
          <Link className="btn" href={estimateHref}>Size from my bill</Link>
        </> : sp.cancelled && l.status !== "ready" ? <>
          <h1>No problem.</h1>
          <p>Nothing was shared. You can size from your power bill instead, or try again any time.</p>
          <Link className="btn" href={estimateHref}>Size from my bill</Link>
        </> : waiting ? <>
          <h1>Reading your last 12 months…</h1>
          <p>Your retailer is sending your meter data. This page fills itself in, usually in under a minute.</p>
          <p className="small muted">Leave it open, or come back to this link later. We&apos;ll keep it here.</p>
        </> : l.status === "fallback" || l.status === "failed" || !s ? <>
          <h1>We couldn&apos;t get your usage this time.</h1>
          <p>{/basic|Only/.test(l.fail_reason ?? "") ? "Your meter doesn't record half-hour data yet, so we size from your bill instead." : "Your retailer didn't send usage data. Some retailers aren't on the Consumer Data Right yet."} Sizing from your bill is rougher, but your installer still checks everything from your photos before you pay.</p>
          <Link className="btn" href={estimateHref}>Size from my bill</Link>
          <form action={refreshUsage} style={{ display: "inline-block", marginLeft: 8 }}><input type="hidden" name="token" value={token} /><button className="btn ghost" type="submit">Try again</button></form>
        </> : <>
          <h1>{p ? `Your home used ${k(p.annual_import_kwh + p.annual_controlled_kwh)} kWh last year, ${pct(p.evening_share)} of it after the sun went down.` : `Your home uses about ${s.targets.daily_kwh} kWh a day.`}</h1>
          {p && <p className="muted" style={{ marginTop: -4 }}>{p.days} days of meter data, {p.from} to {p.to}. About {p.daily_kwh} kWh a day; {p.night_kwh} kWh of it between sunset and sunrise.{p.has_export ? ` Your solar sends about ${p.daily_export_kwh} kWh a day back to the grid.` : ""}</p>}
          {p && <UsageCharts profile={p} panelKw={s.rec?.panel_kw ?? 0} loc={loc} />}

          <h2 style={{ marginTop: 26 }}>How we sized it</h2>
          <ol className="small" style={{ margin: "0 0 0 18px" }}>{s.targets.why.map((w) => <li key={w}>{w}</li>)}</ol>
          <p className="small muted">{loc.city} average: 1 kW of panels makes {loc.kwh_per_kw} kWh a day (Clean Energy Council). {s.tariff_source === "retailer" ? `Savings use your own tariff${s.tariff_name ? ` (${s.tariff_name})` : ""}.` : "Your retailer didn't publish your rates, so savings use a standard SEQ tariff."}</p>

          {s.rec ? <div className="grid" style={{ marginTop: 14 }}>
            <SystemBlock p={s.rec} label="We recommend" />
            {s.up && <SystemBlock p={s.up} label="Go bigger" base={s.rec} />}
          </div> : <div className="note">Nothing in our range fits yet. <Link href="/systems">See every system</Link>.</div>}

          {!l.has_solar && <form action={setRoof} style={{ marginTop: 18, display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "end", border: "1px solid var(--line)", borderRadius: 8, padding: 12 }}>
            <input type="hidden" name="token" value={token} />
            <label className="small"><strong>How much roof do you have?</strong>
              <select name="roof" defaultValue={l.roof_max_kw ? String(Number(l.roof_max_kw)) : ""} style={{ display: "block", width: "100%", padding: 10, marginTop: 4 }}>
                <option value="">Not sure (your installer checks)</option><option value="6.6">Small: room for about 14 panels</option>
                <option value="10">Medium: about 21 panels</option><option value="13.3">Large: about 28 panels</option><option value="20">Very large</option>
              </select></label>
            <button className="btn ghost" type="submit">Update</button>
          </form>}

          <p className="small muted" style={{ marginTop: 16 }}>Estimates from last year&apos;s usage and average weather. Your installer confirms the system from your photos before you pay, and the price only changes if you agree.</p>
          {recordHref && <p><Link href={recordHref}>← Back to your record</Link></p>}

          <details className="small" style={{ marginTop: 22 }}><summary style={{ cursor: "pointer" }}>Your data and how to stop sharing</summary>
            <p>Shared through Fiskil under the Consumer Data Right until {l.consent_until ? new Date(l.consent_until).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" }) : "12 months from today"}. We use it to size your system and, after install, to show your before-and-after. We keep the summary on this page; the half-hour readings are deleted after {set.raw_days} days.</p>
            <form action={disconnectUsage}><input type="hidden" name="token" value={token} /><input type="hidden" name="confirm" value="yes" />
              <button className="btn ghost sm" type="submit">Stop sharing and delete my data</button></form>
          </details>
        </>}
      </div></section>
      <Footer />
    </>
  );
}
