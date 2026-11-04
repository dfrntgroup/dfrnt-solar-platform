import Link from "next/link";
import { BANDS, BAND_ORDER, bandFor, type Band } from "@dfrnt/engine";
import { Header, Footer } from "@/components/Header";
import { SystemCard } from "@/components/SystemCard";
import { earliestFor } from "@/lib/capacity";
import { priced, rebateDate, sitePostcode } from "@/lib/site";

export const dynamic = "force-dynamic";
export const metadata = { title: "Solar + battery systems", description: "Every DFRNT Solar system with its fixed installed price for your postcode, rebate already taken off. Three sizes, four battery bands, SolaX, Sungrow and GoodWe." };

const BRANDS = ["SolaX", "GoodWe", "Sungrow"];
const sizeKey = (kw: number) => (kw < 8 ? "6.6" : kw < 12 ? "10" : kw < 14 ? "13.3" : "15");

/** The shelf: Size × Battery band × Brand. Grouped by band so like compares with like; brands side by side inside each band. */
export default async function Systems({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const postcode = await sitePostcode(sp);
  const earliest = await earliestFor(postcode);
  const phase = sp.phase === "3" ? 3 : 1;
  const all = await priced(postcode, (s) => s.kind === "solar_battery" && s.config.phases === phase);
  const rows = all.filter(({ s, q }) => (!sp.brand || s.brand.toLowerCase() === sp.brand) && (!sp.size || sizeKey(q.config.panel_kw) === sp.size) && (!sp.band || (s.band ?? bandFor(q.config.usable_kwh)) === sp.band));
  const link = (k: string, v?: string) => { const p = new URLSearchParams({ ...sp }); if (v === undefined || sp[k] === v) p.delete(k); else p.set(k, v); const s = p.toString(); return `/systems${s ? `?${s}` : ""}`; };
  const setP = (k: string, v: string | null) => { const p = new URLSearchParams({ ...sp }); if (v == null) p.delete(k); else p.set(k, v); const q = p.toString(); return `/systems${q ? `?${q}` : ""}`; };
  const chip = (k: string, v: string, label: string) => <Link key={k + v} href={link(k, v)} className={`chip${sp[k] === v ? " on" : ""}`}>{label}</Link>;
  const allChip = (k: string) => <Link key={k + "all"} href={link(k)} className={`chip${!sp[k] ? " on" : ""}`}>All</Link>;
  const sizes = [...new Set(all.map(({ q }) => sizeKey(q.config.panel_kw)))].sort((a, b) => Number(a) - Number(b));
  const bands = BAND_ORDER.filter((b) => rows.some(({ s, q }) => (s.band ?? bandFor(q.config.usable_kwh)) === b));
  const brandsShown = sp.brand ? BRANDS.filter((b) => b.toLowerCase() === sp.brand) : BRANDS;
  const startsAt = (brand: string) => { const first = BAND_ORDER.find((b) => all.some(({ s, q }) => s.brand === brand && (s.band ?? bandFor(q.config.usable_kwh)) === b)); return first ? BANDS[first].label : null; };
  return (
    <>
      <Header postcode={postcode} back="/systems" />
      <section style={{ paddingTop: 32 }}><div className="wrap">
        <h1>All systems</h1>
        <p className="lead">Complete solar and battery systems at one installed price. Pick a size, then a battery band, then a brand. Every system here is a starting point: open it and change the panels, battery and backup, and the price follows. We check your home from photos before you pay anything.</p>
        <div className="tiles">
          <Link href="/estimate"><strong>Find my system</strong><span>Your meter data or your bill</span></Link>
          <Link href="/systems" className="on"><strong>All systems</strong><span>Browse and filter</span></Link>
          <Link href="/batteries"><strong>Battery only</strong><span>Add to existing solar</span></Link>
          <Link href="/brands/solax"><strong>Shop by brand</strong><span>SolaX · Sungrow · GoodWe</span></Link>
        </div>
        <p className="small" style={{ marginTop: -6 }}>Know exactly what you want? <Link href={`/build?ph=${phase}`}><strong>Build your own →</strong></Link></p>
        <div className="panel" style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center", justifyContent: "space-between" }}>
          <span><strong>Prices for {postcode}</strong><br /><span className="small muted">Rebates as at {rebateDate()} · change postcode with 📍 at the top</span></span>
          <div className="seg"><Link href={setP("phase", null)} className={phase === 1 ? "on" : ""}>Single phase</Link><Link href={setP("phase", "3")} className={phase === 3 ? "on" : ""}>Three phase</Link></div>
        </div>
        <div style={{ margin: "14px 0 4px" }}>
          <div className="filterrow"><span className="filters lab" style={{ margin: 0 }}>Solar size</span>{allChip("size")}{sizes.map((k) => chip("size", k, `${k} kW`))}</div>
          <div className="filterrow"><span className="filters lab" style={{ margin: 0 }}>Battery</span>{allChip("band")}{BAND_ORDER.map((b) => chip("band", b, BANDS[b].label))}</div>
          <div className="filterrow"><span className="filters lab" style={{ margin: 0 }}>Brand</span>{allChip("brand")}{BRANDS.map((b) => chip("brand", b.toLowerCase(), b))}</div>
        </div>
        {earliest === null && <div className="note" style={{ marginTop: 12 }}>We don&apos;t install at {postcode} yet. Prices are shown so you can plan; <Link href={`/contact?kind=waitlist&postcode=${postcode}`}>join the waitlist</Link> and we&apos;ll tell you when an installer covers your area.</div>}
        <p className="muted small">{rows.length} systems · prices reviewed monthly</p>
        {rows.length ? <form action="/compare" method="get">
          {bands.map((b) => (
            <div className="bandrow" key={b}>
              <h2><span className={`band ${b}`}>{BANDS[b].label}</span> {BANDS[b].kwh}</h2>
              <p className="why">{BANDS[b].why}</p>
              <div className="grid">
                {brandsShown.map((brand) => {
                  const inBand = rows.filter(({ s, q }) => s.brand === brand && (s.band ?? bandFor(q.config.usable_kwh)) === b).sort((x, y) => x.q.stack.amount_payable - y.q.stack.amount_payable);
                  if (inBand.length) return inBand.map(({ s, q }) => <SystemCard key={s.slug} s={s} q={q} compare earliest={earliest} />);
                  if (sp.size || sp.band) return null;
                  const first = startsAt(brand);
                  return <div className="empty" key={brand + b}>{first && BAND_ORDER.indexOf(b) < BAND_ORDER.indexOf(BAND_ORDER.find((x) => BANDS[x].label === first)!) ? `${brand} starts in the ${first} band` : `${brand}: not offered in this band at launch`}</div>;
                })}
              </div>
            </div>))}
          <p style={{ marginTop: 18 }}><button className="btn ghost" type="submit">Compare selected →</button></p></form>
          : <div className="ok">No system matches those filters. <Link href="/systems">Clear filters</Link> or <Link href="/contact">talk to us</Link> and we&apos;ll size one for you.</div>}
      </div></section>
      <Footer />
    </>
  );
}
