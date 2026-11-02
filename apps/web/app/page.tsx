import Link from "next/link";
import { publishedReviews } from "@/lib/reviews";
import { Header, Footer } from "@/components/Header";
import { SystemCard } from "@/components/SystemCard";
import { earliestFor } from "@/lib/capacity";
import { aud, priced, rebateDate, sitePostcode, windowEnd, longDate } from "@/lib/site";

export const dynamic = "force-dynamic";
export const metadata = { description: "Solar and home batteries for South East Queensland at one fixed installed price, rebate already taken off. Price it, send photos, pay online and pick your install day.", alternates: { canonical: "/" } };

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const postcode = await sitePostcode(await searchParams);
  const earliest = await earliestFor(postcode);
  const reviews = await publishedReviews(3);
  const all = await priced(postcode);
  const top = all.filter(({ s }) => ["solax-10kw-15kwh", "goodwe-10kw-16kwh", "sungrow-10kw-20kwh"].includes(s.slug));
  const from = Math.min(...all.map(({ q }) => q.stack.amount_payable));
  const end = await windowEnd();
  return (
    <>
      <Header postcode={postcode} />
      <div className="hero"><div className="wrap split">
        <div>
          <p className="eyebrow">DFRNT Solar · Solar and home batteries</p>
          <h1>Keep more of your money.<span className="teal">Make more of your own power.</span></h1>
          <p className="lead">Every system priced for your postcode, installed, with the rebate already taken off. One contract, one price, one payment.</p>
          <form action="/estimate" method="get" className="finder">
            <strong style={{ display: "block", marginBottom: 10 }}>Find my system in 30 seconds</strong>
            <div className="row">
              <label>Postcode<input name="postcode" defaultValue={postcode} inputMode="numeric" pattern="\d{4}" maxLength={4} className="field" /></label>
              <label>Last quarterly bill ($)<input name="bill" inputMode="numeric" placeholder="e.g. 750" className="field" required /></label>
            </div>
            <label className="small" style={{ display: "block", marginTop: 10 }}>Already have solar panels?<select name="solar" className="field" defaultValue="no"><option value="no">No, I need panels and a battery</option><option value="yes">Yes, I just want a battery</option></select></label>
            <button className="btn block" style={{ marginTop: 12 }} type="submit">Find my system →</button>
            <p className="small muted" style={{ margin: "8px 0 0" }}>Systems from {aud(from)} installed, after rebates.</p>
          </form>
        </div>
        <div className="hero-img"><img src="/img/hero-home.webp" alt="A Queensland home with rooftop solar" /><span className="cap">Concept image. Not a DFRNT Solar installation.</span></div>
      </div></div>

      <div className="checks"><div className="wrap"><ul>
        <li>Price shown is the price you pay, installed</li><li>Rebates taken off for you, line by line</li><li>Your home checked from photos before you pay</li><li>One contract and one payment</li>
      </ul></div></div>

      <section><div className="wrap">
        <p className="eyebrow">Where to start</p>
        <h2>Pick the path that fits your home.</h2>
        <div className="grid" style={{ marginTop: 20 }}>
          <div className="card"><span className="num">01</span><h3>Add a battery to existing solar</h3><p className="muted">Store your daytime solar for the evening. Each battery comes with its own hybrid inverter.</p><Link className="link" href="/batteries">Explore batteries</Link></div>
          <div className="card mint"><span className="num">02</span><h3>New solar and battery</h3><p className="muted">A complete system with named panels, inverter and battery, priced together with installation.</p><Link className="link" href="/systems">Explore complete systems</Link></div>
          <div className="card"><span className="num">03</span><h3>Help me choose</h3><p className="muted">Tell us your bill and when you&apos;re home. We&apos;ll show the three systems that fit best.</p><Link className="link" href="/estimate">Find my system</Link></div>
        </div>
      </div></section>

      <section className="shade"><div className="wrap">
        <p className="eyebrow">Most chosen · {postcode} · rebates as at {rebateDate()}</p>
        <h2>Pick a system. See what you pay.</h2>
        {end && <p className="muted">Battery rebates step down after {longDate(end)}. Secure a price now and every install date we offer is on or before then.</p>}
        <div className="grid" style={{ marginTop: 20 }}>{top.map(({ s, q }) => <SystemCard key={s.slug} s={s} q={q} earliest={earliest} />)}</div>
        <p style={{ marginTop: 22 }}><Link className="btn ghost" href="/systems">See all {all.length} systems →</Link></p>
      </div></section>

      <section><div className="wrap">
        <p className="eyebrow">Four ways to find your system</p>
        <h2>However you like to shop.</h2>
        <div className="grid g4" style={{ marginTop: 20 }}>
          <div className="card ink"><h3>Find my system</h3><p style={{ opacity: .85 }}>Your bill and when you&apos;re home. Three complete systems with prices.</p><Link className="link" href="/estimate">Start</Link></div>
          <div className="card"><h3>All systems</h3><p className="muted">Browse everything and filter by brand, battery size and solar size.</p><Link className="link" href="/systems">Browse</Link></div>
          <div className="card"><h3>Battery only</h3><p className="muted">Already have solar? Add a battery with the Cheaper Home Batteries discount taken off.</p><Link className="link" href="/batteries">See batteries</Link></div>
          <div className="card"><h3>Compare</h3><p className="muted">Put up to three systems side by side: price, battery, inverter, cost per kWh.</p><Link className="link" href="/systems">Pick systems</Link></div>
        </div>
        <div className="grid" style={{ marginTop: 18 }}>
          <Link href="/brands/solax" className="card mint" style={{ textDecoration: "none" }}><h3>SolaX</h3><span className="muted small">X1-VAST and X3-Hybrid inverters · T-BAT HS51 battery</span></Link>
          <Link href="/brands/sungrow" className="card mint" style={{ textDecoration: "none" }}><h3>Sungrow</h3><span className="muted small">SH-RS hybrid inverter · SBH battery</span></Link>
          <Link href="/brands/goodwe" className="card mint" style={{ textDecoration: "none" }}><h3>GoodWe</h3><span className="muted small">ESA hybrid inverter · Lynx D battery</span></Link>
        </div>
      </div></section>

      {reviews.count >= 3 && <section className="shade"><div className="wrap">
        <p className="eyebrow">Reviews{reviews.average != null ? ` · ${reviews.average} / 5 from ${reviews.count}` : ""}</p>
        <h2>From people we&apos;ve installed for.</h2>
        <div className="grid" style={{ marginTop: 16 }}>{reviews.rows.slice(0, 3).map((r) => <div key={r.id} className="card"><p className="stars">{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</p><p>{r.body.length > 220 ? `${r.body.slice(0, 220)}…` : r.body}</p><p className="small muted">{[r.first_name, r.suburb].filter(Boolean).join(", ")}</p></div>)}</div>
        <p style={{ marginTop: 14 }}><Link className="link" href="/reviews">Read every review</Link></p>
      </div></section>}
      <section className="dark"><div className="wrap">
        <p className="eyebrow" style={{ color: "var(--teal-soft)" }}>How it works</p>
        <h2>From price to power in five steps.</h2>
        <div className="grid" style={{ marginTop: 20 }}>
          {[["Pick and configure", "Change the panels and battery and watch the price."], ["Secure the price", "Locked for 14 days, rebate included."], ["Send four photos", "Your installer confirms the price, often instantly."], ["Sign and pay once", "Bank transfer saves about 1%."], ["Pick your date", "From your installer's real free days."]].map(([t, d], i) => (
            <div key={t} style={{ borderTop: "1px solid rgba(255,255,255,.2)", paddingTop: 14 }}><span className="num" style={{ color: "var(--teal-soft)" }}>0{i + 1}</span><h3 style={{ marginTop: 6 }}>{t}</h3><p style={{ opacity: .8, margin: 0 }}>{d}</p></div>))}
        </div>
        <p style={{ marginTop: 26 }}><Link className="btn" href="/how-it-works">How it works →</Link></p>
      </div></section>
      <Footer />
    </>
  );
}
