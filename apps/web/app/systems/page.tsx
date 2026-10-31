import Link from "next/link";
import { Header, Footer } from "@/components/Header";
import { SystemCard } from "@/components/SystemCard";
import { earliestFor } from "@/lib/capacity";
import { priced, rebateDate, sitePostcode } from "@/lib/site";

export const dynamic = "force-dynamic";
export const metadata = { title: "Solar + battery systems" };

const bands: Record<string, [number, number]> = { "10-15": [0, 15.5], "15-25": [15.5, 25], "25+": [25, 999] };

export default async function Systems({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const postcode = await sitePostcode(sp);
  const earliest = await earliestFor(postcode);
  const phase = sp.phase === "3" ? 3 : 1;
  let rows = await priced(postcode, (s) => s.kind === "solar_battery" && s.config.phases === phase && (!sp.brand || s.brand.toLowerCase() === sp.brand));
  const band = sp.kwh ? bands[sp.kwh] : undefined; if (band) { const [lo, hi] = band; rows = rows.filter(({ q }) => q.config.usable_kwh >= lo && q.config.usable_kwh < hi); }
  rows.sort((a, b) => sp.sort === "battery" ? b.q.config.usable_kwh - a.q.config.usable_kwh : a.q.stack.amount_payable - b.q.stack.amount_payable);
  const link = (k: string, v?: string) => { const p = new URLSearchParams({ ...sp }); if (v === undefined || sp[k] === v) p.delete(k); else p.set(k, v); const s = p.toString(); return `/systems${s ? `?${s}` : ""}`; };
  const setP = (k: string, v: string | null) => { const p = new URLSearchParams({ ...sp }); if (v == null) p.delete(k); else p.set(k, v); const q = p.toString(); return `/systems${q ? `?${q}` : ""}`; };
  const chip = (k: string, v: string, label: string) => <Link key={k + v} href={link(k, v)} className={`chip${sp[k] === v ? " on" : ""}`}>{label}</Link>;
  return (
    <>
      <Header postcode={postcode} back="/systems" />
      <section style={{ paddingTop: 32 }}><div className="wrap">
        <h1>All systems</h1>
        <p className="lead">Complete solar and battery systems at fixed installed prices. Every price below is what you pay after rebates, including GST and installation. We check your home from photos before you pay anything.</p>
        <div className="tiles">
          <Link href="/estimate"><strong>Find my system</strong><span>Your bill, three picks</span></Link>
          <Link href="/systems" className="on"><strong>All systems</strong><span>Browse and filter</span></Link>
          <Link href="/batteries"><strong>Battery only</strong><span>Add to existing solar</span></Link>
          <Link href="/brands/solax"><strong>Shop by brand</strong><span>SolaX · Sungrow · GoodWe</span></Link>
        </div>
        <div className="panel" style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center", justifyContent: "space-between" }}>
          <span><strong>Prices for {postcode}</strong><br /><span className="small muted">Rebates as at {rebateDate()} · change postcode with 📍 at the top</span></span>
          <div className="seg"><Link href={setP("phase", null)} className={phase === 1 ? "on" : ""}>Single phase</Link><Link href={setP("phase", "3")} className={phase === 3 ? "on" : ""}>Three phase</Link></div>
        </div>
        <div className="filters">
          {chip("kwh", "10-15", "10–15 kWh")}{chip("kwh", "15-25", "15–25 kWh")}{chip("kwh", "25+", "25 kWh+")}
          {chip("brand", "solax", "SolaX")}{chip("brand", "sungrow", "Sungrow")}{chip("brand", "goodwe", "GoodWe")}
          {chip("sort", "battery", "Biggest battery first")}
        </div>
        {earliest === null && <div className="note" style={{ marginTop: 12 }}>We don&apos;t install at {postcode} yet. Prices are shown so you can plan; <Link href={`/contact?kind=waitlist`}>join the waitlist</Link> and we&apos;ll tell you when an installer covers your area.</div>}
        <p className="muted small">{rows.length} systems · prices reviewed monthly</p>
        {rows.length ? <form action="/compare" method="get"><div className="grid">{rows.map(({ s, q }) => <SystemCard key={s.slug} s={s} q={q} compare earliest={earliest} />)}</div>
          <p style={{ marginTop: 18 }}><button className="btn ghost" type="submit">Compare selected →</button></p></form>
          : <div className="ok">No system matches those filters. <Link href="/systems">Clear filters</Link> or <Link href="/contact">talk to us</Link> and we&apos;ll size one for you.</div>}
      </div></section>
      <Footer />
    </>
  );
}
