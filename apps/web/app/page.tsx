import Link from "next/link";
import { publishedReviews } from "@/lib/reviews";
import { Header, Footer } from "@/components/Header";
import { SystemCard } from "@/components/SystemCard";
import { earliestFor } from "@/lib/capacity";
import { getSetting } from "@/lib/settings";
import { aud, priced, rebateDate, sitePostcode, windowEnd, longDate } from "@/lib/site";
import { energyVisible } from "@/lib/energy";

export const dynamic = "force-dynamic";
export const metadata = { description: "Solar and home batteries for South East Queensland at one fixed installed price, rebate already taken off. Price it, send photos, pay online and pick your install day.", alternates: { canonical: "/" } };

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const postcode = await sitePostcode(await searchParams);
  const earliest = await earliestFor(postcode);
  const reviews = await publishedReviews(3);
  const all = await priced(postcode);
  // The homepage ladder: one brand (the core range), three sizes. Brand is the second decision.
  const ladder = ["solax-6kw-10kwh", "solax-10kw-15kwh", "solax-13kw-20kwh"].map((slug) => all.find(({ s }) => s.slug === slug)).filter(Boolean) as typeof all;
  const family = (brand: string) => all.find(({ s }) => s.brand === brand && s.kind === "solar_battery" && s.config.phases === 1 && s.size === "Family");
  const batteryFrom = Math.min(...all.filter(({ s }) => s.kind === "battery_only").map(({ q }) => q.stack.amount_payable));
  const meter = await energyVisible(await searchParams);
  const end = await windowEnd();
  const t = await getSetting("trust");
  const { rebateFromFor } = await import("@/lib/rebate-from");
  const forward = await rebateFromFor(postcode);
  const anchor = all.find(({ s }) => s.slug === "solax-10kw-15kwh") ?? ladder[1] ?? ladder[0];
  return (
    <>
      <Header postcode={postcode} />
      <div className="hero"><div className="wrap split">
        <div>
          <p className="eyebrow hide-sm">DFRNT Solar · Solar and home batteries</p>
          <h1 className="hero-h1">Keep more of your money.<span className="teal hide-sm">Make more of your own power.</span></h1>
          <p className="lead hide-sm">Every system priced for your postcode, installed, with the rebate already taken off. One contract, one price, one payment.</p>
          <p className="lead show-sm" style={{ margin: "-8px 0 0" }}>Installed price, rebate off, for your postcode.</p>
          <form action="/estimate" method="get" className="finder">
            {meter ? <>
              <strong style={{ display: "block", marginBottom: 4 }}>Don&apos;t guess your size. Use your own meter data.</strong>
              <p className="small muted" style={{ margin: "0 0 10px" }}>Connect your electricity meter and we size your system on a year of your real half-hour usage. Two minutes, nothing to upload.</p>
              <Link className="btn block" href={`/estimate?postcode=${postcode}#usage`}>Connect my meter →</Link>
              <p className="small muted" style={{ margin: "12px 0 6px" }}>No meter handy? Start from your bill instead.</p>
            </> : <strong style={{ display: "block", marginBottom: 10 }}>Find my system in 30 seconds</strong>}
            <div className="row">
              <label>Postcode<input name="postcode" defaultValue={postcode} inputMode="numeric" pattern="\d{4}" maxLength={4} className="field" /></label>
              <label>Last quarterly bill ($)<input name="bill" inputMode="numeric" placeholder="e.g. 750" className="field" required /></label>
            </div>
            <div className="pills" role="radiogroup" aria-label="What do you need?" style={{ paddingTop: 10 }}>
              <label><input type="radio" name="solar" value="no" defaultChecked style={{ position: "absolute", opacity: 0 }} /><span className="pill-r">Panels + battery</span></label>
              <label><input type="radio" name="solar" value="yes" style={{ position: "absolute", opacity: 0 }} /><span className="pill-r">Battery only (I have solar)</span></label>
            </div>
            <button className={`btn block${meter ? " ghost" : ""}`} style={{ marginTop: 12 }} type="submit">{meter ? "Estimate from my bill" : "Find my system →"}</button>
            {anchor && <p className="small muted" style={{ margin: "8px 0 0" }}>Family-home system <strong>{aud(anchor.q.stack.amount_payable)}</strong> installed, rebate off. Battery only from {aud(batteryFrom)}.</p>}
          </form>
        </div>
        <div className="hero-img"><img src="/img/hero-home.webp" alt="A Queensland home with rooftop solar" /><span className="cap">Concept image. Not a DFRNT Solar installation.</span></div>
      </div></div>

      <div className="checks"><div className="wrap"><ul>
        <li>Licensed electricians, SAA-accredited</li><li>10 business days to change your mind, full refund</li><li>One price, nothing added later without your OK</li><li>Sunshine Coast family business</li>
      </ul></div></div>

      <section className="shade"><div className="wrap">
        <p className="eyebrow">Our pick · {postcode} · rebates as at {rebateDate()}</p>
        <h2>Three sizes. One price each.</h2>
        <p className="muted">Pick the size that matches your home. Every price is installed, inc GST, with the rebate already off.{forward ? ` Installs up to ${longDate(end!)} are fully booked in ${postcode}; prices now include the rebate for installs from ${longDate(forward)}.` : end ? ` Battery rebates step down after ${longDate(end)}.` : ""}</p>
        <p style={{ fontWeight: 700, margin: "6px 0 0" }}>These are starting points, not fixed packages. Open any one and change the panels, the battery and the backup. The price updates as you go.</p>
        <div className="grid" style={{ marginTop: 20 }}>{ladder.map(({ s, q }) => <SystemCard key={s.slug} s={s} q={q} earliest={earliest} />)}</div>
        <p className="small muted" style={{ marginTop: 12 }}>Shown in our core range, SolaX. Same three sizes in GoodWe and Sungrow below.</p>
        <p style={{ marginTop: 14 }}><Link className="btn ghost" href="/systems">See all {all.filter(({ s }) => s.kind === "solar_battery" && s.config.phases === 1).length} systems for single-phase homes →</Link> <Link className="link" href="/systems?phase=3" style={{ marginLeft: 10 }}>Three-phase</Link></p>
      </div></section>

      <section className="dark"><div className="wrap">
        <p className="eyebrow" style={{ color: "var(--teal-soft)" }}>Sized on your data, not a guess</p>
        <h2>Your meter already knows what size you need.</h2>
        <div className="steps3">
          <div><span className="num">01</span><h3 style={{ marginTop: 6 }}>Connect your meter</h3><p style={{ opacity: .85, margin: 0 }}>Two minutes, through the government&apos;s Consumer Data Right. We only see your usage, never your bank or your bills.</p></div>
          <div><span className="num">02</span><h3 style={{ marginTop: 6 }}>We replay a year of your usage</h3><p style={{ opacity: .85, margin: 0 }}>Every half hour of the last twelve months, against the sun at your postcode. No typical-home averages.</p></div>
          <div><span className="num">03</span><h3 style={{ marginTop: 6 }}>One recommended system, priced</h3><p style={{ opacity: .85, margin: 0 }}>Panels and battery sized to your home, with the installed price and what it saves you a year. Adjust it if you like.</p></div>
        </div>
        <p style={{ marginTop: 24 }}>{meter ? <Link className="btn" href={`/estimate?postcode=${postcode}#usage`}>Connect my meter →</Link> : <Link className="btn" href="/estimate">Size my system →</Link>} <Link className="link" href="/estimate" style={{ marginLeft: 12, color: "#fff", opacity: .85 }}>{meter ? "No meter handy? Estimate from your bill." : "Start from your last bill."}</Link></p>
        {!meter && <p className="small" style={{ opacity: .7, marginTop: 10 }}>Meter connection is coming online for everyone shortly. Until then we size from your bill and confirm from your photos.</p>}
      </div></section>

      <section><div className="wrap">
        <p className="eyebrow">Step two</p>
        <h2>Prefer a different brand? Same three sizes.</h2>
        <div className="grid" style={{ marginTop: 20 }}>
          {([
            ["SolaX", "Core range", "Best price per kWh of the three, Australian support office, battery grows 5.1 kWh at a time."],
            ["GoodWe", "Value", "Biggest battery for the money. Modules are 8.85 kWh, so sizes jump in bigger steps."],
            ["Sungrow", "Brand", "Australia's most installed residential inverter and the inverter installers voted to put on their own homes in 2026. The brand your sparky would choose."],
          ] as const).map(([brand, tier, line]) => { const f = family(brand); return (
            <Link key={brand} href={`/brands/${brand.toLowerCase()}`} className="card mint" style={{ textDecoration: "none" }}>
              <div className="tag"><span>{tier}</span></div><h3>{brand}</h3><p className="small" style={{ margin: 0 }}>{line}</p>
              {f && <p className="small muted" style={{ margin: 0 }}>Family size <strong>{aud(f.q.stack.amount_payable)}</strong>{f.q.config.usable_kwh !== 15.3 ? ` (${f.q.config.usable_kwh} kWh)` : ""}</p>}
            </Link>); })}
        </div>
        <div className="grid g4" style={{ marginTop: 18 }}>
          <div className="card"><h3>All systems</h3><p className="muted">Every size and brand, grouped by battery band.</p><Link className="link" href="/systems">Browse</Link></div>
          <div className="card"><h3>Battery only</h3><p className="muted">Already have solar? Add a battery with the Cheaper Home Batteries discount taken off.</p><Link className="link" href="/batteries">See batteries</Link></div>
          <div className="card"><h3>Compare</h3><p className="muted">Put up to three systems side by side: price, battery, inverter, cost per kWh.</p><Link className="link" href="/systems">Pick systems</Link></div>
          <div className="card"><h3>Build your own</h3><p className="muted">Pick each part and watch the price.</p><Link className="link" href="/build">Start</Link></div>
        </div>
      </div></section>

      <section className="shade"><div className="wrap"><div className="grid g2">
        <div className="card founder">
          <div className="face"><span className="avatar" aria-hidden>KB</span><div><strong>Karl Brown, founder</strong><br /><span className="small muted">Founded InStyle Solar: 29,000+ installs, AFR Fast 100 #3</span></div></div>
          {t.founder_quote && <p style={{ margin: "12px 0 0" }}>&ldquo;{t.founder_quote}&rdquo;</p>}
          <p className="small" style={{ margin: "10px 0 0" }}>{t.founder_video ? <a className="link" href={t.founder_video} target="_blank" rel="noreferrer">Watch: why we built this</a> : <Link className="link" href="/about">Our story</Link>}</p>
        </div>
      </div></div></section>

      <section><div className="wrap">
        <p className="eyebrow">Where to start</p>
        <h2>Pick the path that fits your home.</h2>
        <div className="grid" style={{ marginTop: 20 }}>
          <div className="card"><span className="num">01</span><h3>Add a battery to existing solar</h3><p className="muted">Store your daytime solar for the evening. Each battery comes with its own hybrid inverter.</p><Link className="link" href="/batteries">Explore batteries</Link></div>
          <div className="card mint"><span className="num">02</span><h3>New solar and battery</h3><p className="muted">A complete system with named panels, inverter and battery, priced together with installation.</p><Link className="link" href="/systems">Explore complete systems</Link></div>
          <div className="card"><span className="num">03</span><h3>Help me choose</h3><p className="muted">Your meter data or your bill. One recommended system, priced.</p><Link className="link" href="/estimate">Find my system</Link></div>
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
          {[["Pick and adjust", "Start from a size, change the panels and battery, watch the price."], ["Secure the price", "Locked for 14 days, rebate included."], ["Send four photos", "Your installer confirms the price, often instantly."], ["Sign and pay once", "Bank transfer saves about 1%."], ["Pick your date", "From your installer's real free days."]].map(([t, d], i) => (
            <div key={t} style={{ borderTop: "1px solid rgba(255,255,255,.2)", paddingTop: 14 }}><span className="num" style={{ color: "var(--teal-soft)" }}>0{i + 1}</span><h3 style={{ marginTop: 6 }}>{t}</h3><p style={{ opacity: .8, margin: 0 }}>{d}</p></div>))}
        </div>
        <p style={{ marginTop: 26 }}><Link className="btn" href="/how-it-works">How it works →</Link></p>
      </div></section>
      <Footer />
    </>
  );
}
