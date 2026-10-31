import Link from "next/link";
import { Header, Footer } from "@/components/Header";
import { SystemCard } from "@/components/SystemCard";
import { aud, priced, rebateDate, sitePostcode, windowEnd, longDate } from "@/lib/site";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const postcode = await sitePostcode(await searchParams);
  const all = priced(postcode, (s) => s.kind === "solar_battery");
  const top = all.filter(({ s }) => ["solax-10kw-15kwh", "goodwe-10kw-16kwh", "sungrow-10kw-20kwh"].includes(s.slug));
  const from = Math.min(...priced(postcode).map(({ q }) => q.stack.amount_payable));
  const end = windowEnd();
  return (
    <>
      <Header postcode={postcode} />
      <div className="hero"><div className="wrap">
        <p className="eyebrow">Solar + batteries · South East Queensland</p>
        <h1>The price you see is <span className="teal">the price you pay.</span></h1>
        <p className="lead">Fixed installed prices for solar and home batteries. One contract, one price, one payment, with the government rebates already taken off.</p>
        <p><Link className="btn" href="/systems">See every system and price</Link> &nbsp; <Link className="btn ghost" href="/batteries">Add a battery to my solar</Link></p>
        <p className="muted small">Systems from {aud(from)} installed, after rebates, for postcode {postcode}.</p>
      </div></div>
      <div className="trust"><div className="wrap"><span>✓ Licensed local electricians</span><span>✓ Tier-one panels, CEC-listed batteries</span><span>✓ Rebates assigned and taken off for you</span><span>✓ Price locked for 14 days</span></div></div>
      <section><div className="wrap">
        <h2>Most chosen systems</h2>
        <p className="muted">Prices for {postcode}, rebates as at {rebateDate()}.{end ? ` Battery rebates step down after ${longDate(end)}; a price you secure now is locked for installs on or before then.` : ""}</p>
        <div className="grid">{top.map(({ s, q }) => <SystemCard key={s.slug} s={s} q={q} />)}</div>
        <p style={{ marginTop: 18 }}><Link href="/systems">All {all.length} solar + battery systems →</Link></p>
      </div></section>
      <section className="shade"><div className="wrap">
        <h2>How it works</h2>
        <div className="grid">
          <div className="card"><h3>1. Pick a system</h3><p className="muted">Every system shows the price after rebates. No home visit to get a number.</p></div>
          <div className="card"><h3>2. Secure the price</h3><p className="muted">Lock today&apos;s price and rebate for 14 days. Send us a few photos of your home.</p></div>
          <div className="card"><h3>3. Sign, pay, book</h3><p className="muted">One contract and one payment. Your installer&apos;s real availability sets the date.</p></div>
        </div>
      </div></section>
      <Footer />
    </>
  );
}
