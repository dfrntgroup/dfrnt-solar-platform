import Link from "next/link";
import { setPostcode } from "@/app/actions";

const links = [["/systems", "All systems"], ["/batteries", "Battery only"], ["/estimate", "Find my system"], ["/price-list", "Price list"], ["/learn", "Learn"], ["/how-it-works", "How it works"]];

export function Wordmark({ size = 30 }: { size?: number }) {
  return <Link href="/" className="wm" style={{ fontSize: size }} aria-label="DFRNT Solar"><b>DF<i>R</i>NT</b><small>Solar</small></Link>;
}

export function Header({ postcode, back = "/" }: { postcode: string; back?: string }) {
  return (
    <header className="hdr">
      <div className="wrap">
        <div className="left">
          <details className="menu"><summary aria-label="Menu">☰</summary>
            <div className="drawer">{links.map(([h, t]) => <Link key={h} href={h!}>{t}</Link>)}<Link href="/rebates">Rebate calculator</Link><Link href="/beat-my-quote">Beat my quote</Link><Link href="/contact">Talk to us</Link></div>
          </details>
        </div>
        <div className="center"><Wordmark /></div>
        <nav className="desk">{links.slice(0, 5).map(([h, t]) => <Link key={h} href={h!}>{t}</Link>)}</nav>
        <div className="right">
          <details style={{ position: "relative" }}>
            <summary className="pcchip" style={{ listStyle: "none", cursor: "pointer" }}>📍 {postcode}</summary>
            <form action={setPostcode} style={{ position: "absolute", right: 0, top: 40, background: "#fff", border: "2px solid var(--ink)", borderRadius: 7, padding: 12, display: "flex", gap: 6, zIndex: 40, width: 220 }}>
              <input name="postcode" defaultValue={postcode} inputMode="numeric" pattern="\d{4}" maxLength={4} aria-label="Your postcode" className="field" style={{ padding: 8 }} />
              <input type="hidden" name="back" value={back} />
              <button className="btn sm" type="submit">Set</button>
            </form>
          </details>
        </div>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer>
      <div className="wrap cols">
        <div><Wordmark size={26} /><p>Solar and home batteries for South East Queensland. One price, installed, after rebates.</p></div>
        <div><Link href="/systems">All systems</Link><br /><Link href="/batteries">Battery only</Link><br /><Link href="/estimate">Find my system</Link><br /><Link href="/price-list">Price list</Link><br /><Link href="/price-index">Price Index</Link><br /><Link href="/rebates">Rebate calculator</Link><br /><Link href="/beat-my-quote">Beat my quote</Link></div>
        <div><Link href="/how-it-works">How it works</Link><br /><Link href="/about">About</Link><br /><Link href="/warranty">Warranty</Link><br /><Link href="/learn">Learn</Link><br /><Link href="/refer">Refer a friend</Link><br /><Link href="/creators">Creators</Link></div>
        <div><Link href="/brands/solax">SolaX</Link><br /><Link href="/brands/sungrow">Sungrow</Link><br /><Link href="/brands/goodwe">GoodWe</Link><br /><Link href="/installers/apply">For installers</Link><br /><Link href="/contact">Talk to us</Link></div>
      </div>
      <div className="wrap small" style={{ marginTop: 24, opacity: .8 }}>Prices include GST and installation. Rebates are Small-scale Technology Certificates under the Small-scale Renewable Energy Scheme, including the Cheaper Home Batteries Program, assigned to us and taken off your price.</div>
    </footer>
  );
}
