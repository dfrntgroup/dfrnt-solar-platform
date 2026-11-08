import Link from "next/link";
import { publishedReviews } from "@/lib/reviews";
import { Header, Footer } from "@/components/Header";
import { SystemCard } from "@/components/SystemCard";
import { earliestFor } from "@/lib/capacity";
import { getSetting } from "@/lib/settings";
import { aud, priced, rebateDate, sitePostcode, windowEnd, longDate } from "@/lib/site";
import { energyVisible } from "@/lib/energy";

export const dynamic = "force-dynamic";
export const metadata = { description: "Solar and home batteries for South East Queensland. The price is on the page: every system, your postcode, installed, with the rebate already taken off. No sales call to get a number.", alternates: { canonical: "/" } };

// Homepage order from the Website Brand Guideline, Platform theme v1.1 (5 Nov 2026), section 10. Locked lines verbatim.
export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const postcode = await sitePostcode(sp);
  const earliest = await earliestFor(postcode);
  const reviews = await publishedReviews(3);
  const all = await priced(postcode);
  const ladder = ["solax-6kw-10kwh", "solax-10kw-15kwh", "solax-13kw-20kwh"].map((slug) => all.find(({ s }) => s.slug === slug)).filter(Boolean) as typeof all;
  const family = (brand: string) => all.find(({ s }) => s.brand === brand && s.kind === "solar_battery" && s.config.phases === 1 && s.size === "Family");
  const count = all.length;
  const meter = await energyVisible(sp);
  const end = await windowEnd();
  const t = await getSetting("trust");
  const { rebateFromFor } = await import("@/lib/rebate-from");
  const forward = await rebateFromFor(postcode);

  const Estimator = ({ dark = false }: { dark?: boolean }) => (
    <form action="/estimate" method="get" className="finder" style={dark ? { marginTop: 0 } : undefined}>
      <div className="row">
        <label>Postcode<input name="postcode" defaultValue={postcode} inputMode="numeric" pattern="\d{4}" maxLength={4} className="field" /></label>
        <label>Last quarterly bill ($)<input name="bill" inputMode="numeric" placeholder="e.g. 750" className="field" required /></label>
      </div>
      <div className="pills" role="radiogroup" aria-label="What do you need?" style={{ paddingTop: 10 }}>
        <label><input type="radio" name="solar" value="no" defaultChecked style={{ position: "absolute", opacity: 0 }} /><span className="pill-r">Solar + battery</span></label>
        <label><input type="radio" name="solar" value="yes" style={{ position: "absolute", opacity: 0 }} /><span className="pill-r">Battery for the solar I have</span></label>
      </div>
      <button className="btn block" style={{ marginTop: 12 }} type="submit">Show me my system</button>
      <p className="small muted" style={{ margin: "10px 0 0" }}>That&apos;s all we need. Nobody rings you.</p>
    </form>);

  return (
    <>
      <Header postcode={postcode} />

      {/* 1 · Hero with the estimator inside it */}
      <div className="hero">
        <div className="bg" aria-hidden><img src="/img/hero-home.webp" alt="" /></div>
        <div className="wrap split">
          <div>
            <p className="eyebrow">DFRNT Solar /// South East Queensland</p>
            <h1 className="hero-h1">Most solar companies want you confused.<span className="turn">We want you confident.</span></h1>
            <p className="lead hide-sm">So the price is on the page. Every system, your postcode, installed, with the rebate already taken off. No sales call to get a number. No number that changes after you sign.</p>
            <p className="lead show-sm" style={{ fontSize: 17 }}>So the price is on the page. Your postcode, installed, rebate off.</p>
            <p className="hand">Type your bill in. See for yourself.</p>
            <p className="cta-row" style={{ flexDirection: "row", flexWrap: "wrap" }}><Link className="btn" href="/systems">See my price</Link><Link className="btn ghost" href="/beat-my-quote" style={{ color: "#fff" }}>Beat my quote</Link></p>
          </div>
          <div><Estimator /></div>
        </div>
      </div>

      {/* 2 · Proof strip: the hard break under the hero */}
      <div className="checks"><div className="wrap"><ul>
        <li>29,000+ roofs</li><li>$275M built, then sold</li><li>#3 AFR Fast 100</li><li>2023 exit to Hanwha</li><li>2026 back, differently</li>
      </ul></div></div>

      {/* 3 · Trust tiles */}
      <section><div className="wrap">
        <div className="tiles4">
          <div className="tile"><div className="line">Licensed. Accredited. Checked by us.</div><p className="sub">Every installer holds an SAA accreditation and a current electrical licence, and we&apos;ve seen both.</p></div>
          <div className="tile"><div className="line">Ten business days to change your mind.</div><p className="sub">Full refund. Any reason. No form.</p></div>
          <div className="tile"><div className="line">Nothing added without your yes.</div><p className="sub">If your switchboard or roof needs extra work, you see the line and the dollars before you agree.</p></div>
          <div className="tile"><div className="line">Family-owned. The team is back.</div><p className="sub">The people who built InStyle Solar, now building the one they&apos;d buy from. When you call 1300 1 DFRNT, you get one of us.</p></div>
        </div>
      </div></section>

      {/* 4 · Three systems, price cards */}
      <section className="shade"><div className="wrap">
        <p className="eyebrow">Our pick · {postcode} · rebates as at {rebateDate()}</p>
        <h2>Three systems. Three prices. Pick one in a minute.</h2>
        <p className="sub">Small, Family and Large. Each is the installed price for your postcode after the federal battery rebate. Tap one and change the panels or the battery; the price updates in front of you.{forward ? ` Installs up to ${longDate(end!)} are fully booked in ${postcode}, so prices include the rebate for installs from ${longDate(forward)}.` : end ? ` Battery rebates step down after ${longDate(end)}.` : ""}</p>
        <div className="grid sketchy" style={{ marginTop: 20 }}>{ladder.map(({ s, q }) => <SystemCard key={s.slug} s={s} q={q} earliest={earliest} />)}</div>
        <p style={{ marginTop: 18 }}><span className="hand">Need something else?</span> &nbsp;<Link className="link" href="/systems">{count} systems. All priced.</Link></p>
      </div></section>

      {/* 5 · Quote comparison */}
      <section><div className="wrap">
        <div className="grid g2">
          <div>
            <p className="eyebrow">Beat my quote</p>
            <h2>A quote is a number with a deadline. A price is a number with everything behind it.</h2>
            <p className="sub">Theirs: one figure, a logo, &ldquo;valid for 7 days&rdquo;. Ours: one figure, every component named with model number and warranty, around 35 inclusions, 14 days to think. Same roof. Only one lets you check the maths.</p>
            <p><Link className="btn" href="/beat-my-quote">Bring us their quote</Link></p>
          </div>
          <div className="card dark">
            <h3>Things you won&apos;t find here.</h3>
            <p style={{ margin: 0, color: "var(--on-ground-muted)" }}>No door knockers. No &ldquo;ends Friday&rdquo;. No zero-bill fairy tales. No price that moves after you sign. No lead sold to four strangers. No system we wouldn&apos;t put on our own roof.</p>
          </div>
        </div>
      </div></section>

      {/* 6 · Manifesto band */}
      <section className="manifesto"><div className="wrap">
        <h2>One price. Everything behind it named.</h2>
      </div></section>

      {/* 7 · Sizing + three brands */}
      <section><div className="wrap">
        <div className="grid g2" style={{ alignItems: "start" }}>
          <div>
            <p className="eyebrow">Sizing</p>
            <h2>We don&apos;t guess your usage. We read it.</h2>
            <p className="sub">Connect your smart meter through the Consumer Data Right and we replay a year of half-hourly usage against the sun on your roof. {meter ? "Two minutes, nothing to upload." : "Not live for every retailer yet; until it is, your bill and four photos get the same answer."}</p>
            <p>{meter ? <Link className="btn" href={`/estimate?postcode=${postcode}#usage`}>Connect my meter</Link> : <Link className="btn" href="/estimate">Start with my bill</Link>}</p>
            <p className="hand">No home visit to get a number</p>
          </div>
          <div>
            <p className="eyebrow">Brands</p>
            <h2 style={{ fontSize: 30 }}>Three battery brands. On purpose.</h2>
            <p className="sub">GoodWe for one box and one number. SolaX for the flexible core range at the sharpest price. Sungrow for the proven all-rounder. We don&apos;t carry twenty brands because you don&apos;t need twenty decisions.</p>
            <div className="grid" style={{ gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
              {(["SolaX", "Sungrow", "GoodWe"] as const).map((brand) => { const f = family(brand); return (
                <Link key={brand} href={`/brands/${brand.toLowerCase()}`} className="card" style={{ textDecoration: "none", padding: 14, gap: 4 }}>
                  <strong>{brand}</strong>{f && <span className="small muted">Family size {aud(f.q.stack.amount_payable)}</span>}
                </Link>); })}
            </div>
          </div>
        </div>
      </div></section>

      {/* 8 · Founder note */}
      <section className="shade"><div className="wrap">
        <div className="card sketch" style={{ padding: "28px 26px 22px" }}>
        <div className="quote">{t.founder_quote || "I started InStyle Solar in 2014 with $2,500. By 2023 it had put solar on 29,000 roofs and I sold it. I know exactly how a solar quote gets built, and I know why most companies won't show you. So the price is on the page. Every one of them, every postcode, installed, after rebates. If that costs us a sale to someone who wanted to haggle, fine."}</div>
        <p className="sub" style={{ marginTop: 14 }}>The founder · {t.founder_video ? <a className="link" href={t.founder_video} target="_blank" rel="noreferrer">Watch: why we built this</a> : <Link className="link" href="/about">Our story</Link>}</p>
        </div>
      </div></section>

      {/* 9 · Process, five steps */}
      <section><div className="wrap">
        <p className="eyebrow">How it works</p>
        <h2>One price, one contract, one payment.</h2>
        <div className="grid" style={{ marginTop: 20, gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
          {[["Pick it, adjust it", "Start from a size, change the panels and battery, watch the price."], ["Lock it for 14 days", "Rebate included. Nothing to pay."], ["Send four photos", "Switchboard, meter, roof, inverter spot. Your installer confirms the price from them."], ["One contract, one payment", "Bank transfer keeps about 1%."], ["Installed, then kept", "Your System Record: serials, documents, warranties, support. Yours from day one."]].map(([h, d], i) => (
            <div key={h} className="card" style={{ gap: 6 }}><span className="num">0{i + 1}</span><h3 style={{ fontSize: 20 }}>{h}</h3><p className="small muted" style={{ margin: 0 }}>{d}</p></div>))}
        </div>
        <p style={{ marginTop: 22 }}><Link className="btn ghost" href="/how-it-works">How it works, in full</Link></p>
      </div></section>

      {/* 10 · Refusals + orphans */}
      <section className="dark"><div className="wrap">
        <div className="grid g2" style={{ alignItems: "start" }}>
          <div>
            <p className="eyebrow">What you keep</p>
            <h2>196,471 Queensland solar systems have no one to call.</h2>
            <p className="sub">Eighty-three companies gone. Here&apos;s what you keep if we&apos;re not here: every manufacturer warranty, enforceable by you. Your logbook, certificate and monitoring, yours from day one. A founder whose last company is still trading three years on.</p>
          </div>
          <div>
            <p className="eyebrow">Three ways in</p>
            <div style={{ display: "grid", gap: 12 }}>
              <Link href="/batteries" className="card dark" style={{ textDecoration: "none", gap: 4 }}><div className="line" style={{ fontSize: 24 }}>Already have solar?</div><span className="sub">Add the battery.</span></Link>
              <Link href="/systems" className="card dark" style={{ textDecoration: "none", gap: 4 }}><div className="line" style={{ fontSize: 24 }}>Starting fresh?</div><span className="sub">Pick a system.</span></Link>
              <Link href="/estimate" className="card dark" style={{ textDecoration: "none", gap: 4 }}><div className="line" style={{ fontSize: 24 }}>Not sure?</div><span className="sub">Send us your bill. If you don&apos;t need solar, we&apos;ll tell you that too.</span></Link>
            </div>
          </div>
        </div>
      </div></section>

      {/* 11 · Reviews, once there are three real ones */}
      {reviews.count >= 3 && <section><div className="wrap">
        <p className="eyebrow">Reviews{reviews.average != null ? ` · ${reviews.average} / 5 from ${reviews.count}` : ""}</p>
        <h2>From people we&apos;ve installed for.</h2>
        <div className="grid" style={{ marginTop: 16 }}>{reviews.rows.slice(0, 3).map((r) => <div key={r.id} className="card"><p className="stars">{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</p><p>{r.body.length > 220 ? `${r.body.slice(0, 220)}…` : r.body}</p><p className="small muted">{[r.first_name, r.suburb].filter(Boolean).join(", ")}</p></div>)}</div>
        <p style={{ marginTop: 14 }}><Link className="link" href="/reviews">Read every review</Link></p>
      </div></section>}

      {/* 12 · Closing CTA with the estimator again */}
      <section className="manifesto"><div className="wrap">
        <div className="grid g2" style={{ alignItems: "center" }}>
          <div><h2>Your bill in. Your price out.</h2><p style={{ color: "#fff", fontWeight: 500, fontSize: 19, margin: "12px 0 0" }}>Postcode and last quarterly bill. Thirty seconds. South East Queensland.</p></div>
          <Estimator dark />
        </div>
      </div></section>

      {/* 13 · Footer */}
      <Footer />
    </>
  );
}
