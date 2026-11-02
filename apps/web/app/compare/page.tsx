import Link from "next/link";
import { Header, Footer } from "@/components/Header";
import { aud, priced, sitePostcode } from "@/lib/site";
import { BRANDS, PAIRS } from "@/lib/brands";

export const dynamic = "force-dynamic";
export const metadata = { title: "Compare systems", description: "Compare solar and battery systems side by side: size, battery, warranty and installed price." };

export default async function Compare({ searchParams }: { searchParams: Promise<Record<string, string | string[]>> }) {
  const sp = await searchParams;
  const postcode = await sitePostcode(sp as Record<string, string>);
  const picked = ([] as string[]).concat(sp.s ?? []).slice(0, 3);
  const rows = await priced(postcode, (s) => picked.includes(s.slug));
  const attr: [string, (r: (typeof rows)[number]) => string][] = [
    ["You pay, installed", (r) => aud(r.q.stack.amount_payable)],
    ["Before rebates", (r) => aud(r.q.stack.price_inc_gst)],
    ["Rebates", (r) => aud(r.q.stack.less_stcs)],
    ["Solar", (r) => r.q.config.panel_kw ? `${r.q.config.panel_kw} kW` : "—"],
    ["Battery (usable)", (r) => `${r.q.config.usable_kwh} kWh`],
    ["Inverter", (r) => r.q.config.inverter?.model ?? ""],
    ["Battery power", (r) => r.q.config.stacks?.power_kw ? `${r.q.config.stacks.power_kw} kW` : "—"],
    ["Price per usable kWh", (r) => r.q.config.usable_kwh ? aud(r.q.stack.amount_payable / r.q.config.usable_kwh) : "—"],
  ];
  return (
    <>
      <Header postcode={postcode} back="/compare" />
      <section><div className="wrap">
        <p className="eyebrow">Compare · {postcode}</p><h1>Side by side.</h1>
        {rows.length < 2 ? <div className="ok">Pick two or three systems on the <Link href="/systems">systems page</Link> to compare them.</div> : (
          <div style={{ overflowX: "auto" }}><table className="lines"><tbody>
            <tr><td /> {rows.map((r) => <td key={r.s.slug}><strong>{r.s.brand}</strong><br />{r.s.title}</td>)}</tr>
            {attr.map(([label, f]) => <tr key={label}><td className="muted">{label}</td>{rows.map((r) => <td key={r.s.slug}>{f(r)}</td>)}</tr>)}
            <tr><td />{rows.map((r) => <td key={r.s.slug}><Link className="btn sm" href={`/systems/${r.s.slug}`}>View</Link></td>)}</tr>
          </tbody></table></div>)}
        <p className="small" style={{ marginTop: 20 }}>Brand against brand: {PAIRS.map((p, i) => <span key={p}>{i ? " · " : ""}<Link href={`/compare/${p}`}>{p.split("-vs-").map((x) => BRANDS[x]!.name).join(" vs ")}</Link></span>)}</p>
      </div></section>
      <Footer />
    </>
  );
}
