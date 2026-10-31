import Link from "next/link";
import { notFound } from "next/navigation";
import { Header, Footer } from "@/components/Header";
import { BRANDS, PAIRS } from "@/lib/brands";
import { friendlyInverter } from "@/lib/images";
import { aud, priced, sitePostcode } from "@/lib/site";

export const dynamic = "force-dynamic";

const names = (pair: string) => pair.split("-vs-").map((b) => BRANDS[b]?.name ?? b);
export async function generateMetadata({ params }: { params: Promise<{ pair: string }> }) {
  const { pair } = await params;
  const [a, b] = names(pair);
  return { title: `${a} vs ${b}: installed prices compared`, description: `${a} and ${b} solar and battery systems side by side, with installed prices after rebates for your postcode.` };
}

type Row = Awaited<ReturnType<typeof priced>>[number];
/** Closest system to a target size, scored on battery then solar. */
const closest = (rows: Row[], kwh: number, kw: number) => [...rows].sort((x, y) =>
  Math.abs(x.q.config.usable_kwh - kwh) + Math.abs((x.q.config.panel_kw ?? 0) - kw) - (Math.abs(y.q.config.usable_kwh - kwh) + Math.abs((y.q.config.panel_kw ?? 0) - kw)))[0];

/** A23: brand-vs-brand pages built only from our own catalogue and live prices. No claims we can't back. */
export default async function Pair({ params, searchParams }: { params: Promise<{ pair: string }>; searchParams: Promise<Record<string, string>> }) {
  const { pair } = await params;
  if (!PAIRS.includes(pair)) notFound();
  const [ka, kb] = pair.split("-vs-") as [string, string];
  const postcode = await sitePostcode(await searchParams);
  const all = await priced(postcode, (s) => [ka, kb].includes(s.brand.toLowerCase()));
  const of = (k: string) => all.filter((r) => r.s.brand.toLowerCase() === k);
  const complete = [ka, kb].map((k) => closest(of(k).filter((r) => (r.q.config.panel_kw ?? 0) > 0), 15, 10));
  const battery = [ka, kb].map((k) => closest(of(k).filter((r) => !(r.q.config.panel_kw ?? 0)), 15, 0));
  const attr: [string, (r: Row) => string][] = [
    ["You pay, installed", (r) => aud(r.q.stack.amount_payable)],
    ["Rebates taken off", (r) => aud(r.q.stack.less_stcs)],
    ["Solar", (r) => r.q.config.panel_kw ? `${r.q.config.panel_kw} kW` : "—"],
    ["Battery, usable", (r) => `${r.q.config.usable_kwh} kWh`],
    ["Inverter", (r) => friendlyInverter(r.q.config.inverter?.model, r.q.config.inverter?.ac_w)],
    ["Battery power", (r) => r.q.config.stacks?.power_kw ? `${r.q.config.stacks.power_kw} kW` : "—"],
    ["Price per usable kWh", (r) => r.q.config.usable_kwh ? aud(r.q.stack.amount_payable / r.q.config.usable_kwh) : "—"],
  ];
  const Table = ({ rows, heading }: { rows: (Row | undefined)[]; heading: string }) => rows.every(Boolean) ? (
    <div style={{ marginTop: 28 }}>
      <h2>{heading}</h2>
      <div style={{ overflowX: "auto" }}><table className="lines"><tbody>
        <tr><td />{rows.map((r) => <td key={r!.s.slug} style={{ width: "38%" }}><strong>{r!.s.brand}</strong><br />{r!.s.title}</td>)}</tr>
        {attr.map(([label, f]) => <tr key={label}><td className="muted">{label}</td>{rows.map((r) => <td key={r!.s.slug}>{f(r!)}</td>)}</tr>)}
        <tr><td />{rows.map((r) => <td key={r!.s.slug}><Link className="btn sm" href={`/systems/${r!.s.slug}`}>View system</Link></td>)}</tr>
      </tbody></table></div>
    </div>) : null;
  const [na, nb] = names(pair);
  return (
    <>
      <Header postcode={postcode} back={`/compare/${pair}`} />
      <section><div className="wrap">
        <p className="eyebrow">Compare · {postcode}</p>
        <h1>{na} vs {nb}.</h1>
        <p className="lead">Both installed by the same licensed local electricians, on the same terms. The difference is the hardware and the price, so here are both at today&apos;s rebate for {postcode}.</p>
        <div className="grid" style={{ marginTop: 16 }}>{[ka, kb].map((k) => <div key={k} className="card mint"><h3>{BRANDS[k]!.name}</h3><p className="muted">{BRANDS[k]!.line}</p><Link className="link" href={`/brands/${k}`}>All {BRANDS[k]!.name} systems</Link></div>)}</div>
        <Table rows={complete} heading="Solar and battery, closest to 10 kW + 15 kWh" />
        <Table rows={battery} heading="Battery only, closest to 15 kWh" />
        <p className="small muted" style={{ marginTop: 20 }}>Prices are installed, including GST, with Small-scale Technology Certificates and the Cheaper Home Batteries rebate taken off at our fixed rate. Standard single-storey install on a tin roof; anything else is priced from your photos before you pay.</p>
        <p className="small">Other comparisons: {PAIRS.filter((p) => p !== pair).map((p, i) => <span key={p}>{i ? " · " : ""}<Link href={`/compare/${p}`}>{names(p).join(" vs ")}</Link></span>)}</p>
      </div></section>
      <Footer />
    </>
  );
}
