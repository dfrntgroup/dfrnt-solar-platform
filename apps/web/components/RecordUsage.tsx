// S1/S3/S6 on the customer's record: connect button, then a short usage summary, then (after install) before and after.
import Link from "next/link";
import { db } from "@dfrnt/db";
import { UsageConnect } from "./UsageConnect";
import { connectFromRecord } from "@/app/usage/actions";
import { energyVisible, linkForQuote } from "@/lib/energy";
import { aud } from "@/lib/site";

const AFTER = ["installed", "lodged", "settled", "complete"];
const BEFORE = ["saved", "secured", "lapsed", "pricing_instant", "pricing_installer", "tech_review", "priced"];

export async function RecordUsage({ q, sp }: { q: { id: string; token: string; status: string; customer_email: string | null; result: { config: { panel_kw: number; usable_kwh: number } } }; sp: Record<string, string | undefined> }) {
  const l = await linkForQuote(q.id);
  if (!l) {
    if (!BEFORE.includes(q.status) || !(await energyVisible(sp))) return null;
    return <UsageConnect action={connectFromRecord} hidden={{ token: q.token }} askEmail={!q.customer_email} error={sp.usage_error} compact />;
  }
  const href = `/usage/${l.token}`;
  if (AFTER.includes(q.status)) {
    const [j] = await db()`select commissioned_on::text c from quotes where id = ${q.id}`;
    const c = (j?.c as string | null) ?? null;
    if (!c || l.status !== "ready") return null;
    const rows = await db()`select ym, import_kwh::float8 imp from energy_monthly where link_id = ${l.id} order by ym`;
    const after = rows.filter((r) => String(r.ym) > c.slice(0, 7));
    if (!after.length) return <div className="card" style={{ marginTop: 16 }}><strong>Before and after</strong><span className="small muted">Your first full month with the new system shows here, compared with the same month last year.</span></div>;
    const est = new Map((l.sizing?.monthly_after ?? []).map((m) => [m.month, m.imp_after]));
    const lastYear = new Map(rows.map((r) => [String(r.ym), Number(r.imp)]));
    return (
      <div className="card" style={{ marginTop: 16 }}>
        <strong>Before and after: power from the grid</strong>
        <table className="lines small"><tbody>
          <tr><td className="muted">Month</td><td className="r muted">Last year</td><td className="r muted">With your system</td><td className="r muted">We estimated</td></tr>
          {after.slice(-6).map((r) => {
            const ym = String(r.ym), prev = `${Number(ym.slice(0, 4)) - 1}${ym.slice(4)}`, m = Number(ym.slice(5, 7)) - 1;
            return <tr key={ym}><td>{new Date(`${ym}-01T00:00:00Z`).toLocaleDateString("en-AU", { month: "long", year: "numeric", timeZone: "UTC" })}</td>
              <td className="r">{lastYear.has(prev) ? `${Math.round(lastYear.get(prev)!)} kWh` : "—"}</td><td className="r"><strong>{Math.round(Number(r.imp))} kWh</strong></td><td className="r">{est.has(m) ? `${est.get(m)} kWh` : "—"}</td></tr>;
          })}
        </tbody></table>
      </div>);
  }
  if (!BEFORE.includes(q.status)) return null;
  if (l.status !== "ready" || !l.sizing) return (
    <div className="card" style={{ marginTop: 12 }}><strong>Your meter data</strong>
      <span className="small">{["consenting", "waiting", "new"].includes(l.status) ? "Reading your last 12 months…" : "We couldn't get your usage, so we're sizing from your answers."} <Link href={href}>Open</Link></span></div>);
  const s = l.sizing, cfg = q.result.config, rec = s.rec;
  const differs = rec && (Math.abs(rec.usable_kwh - cfg.usable_kwh) >= 3 || Math.abs(rec.panel_kw - cfg.panel_kw) >= 2);
  return (
    <div className="card" style={{ marginTop: 12 }}>
      <strong>Sized from your meter data</strong>
      <span className="small">{l.profile ? `About ${l.profile.daily_kwh} kWh a day, ${l.profile.night_kwh} kWh of it after dark.` : `About ${s.targets.daily_kwh} kWh a day.`}
        {rec?.replay ? ` The recommended ${rec.title} saves about ${aud(rec.replay.saving)} a year.` : ""}</span>
      {differs && <span className="small note">Your usage points to {rec!.title} (you&apos;ve chosen {Math.round(cfg.panel_kw * 10) / 10} kW + {Math.round(cfg.usable_kwh * 10) / 10} kWh). <Link href={rec!.url}>Compare</Link></span>}
      <Link className="small" href={href}>See your usage and how we sized it →</Link>
    </div>);
}
