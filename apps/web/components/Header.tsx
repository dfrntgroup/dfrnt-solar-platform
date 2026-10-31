import Link from "next/link";
import { setPostcode } from "@/app/actions";

const links = [["/systems", "Solar + battery"], ["/batteries", "Battery only"], ["/brands/solax", "Brands"], ["/price-list", "Price list"]];

export function Header({ postcode, back = "/" }: { postcode: string; back?: string }) {
  return (
    <>
      <div className="announce">Fixed installed prices · one contract, one price, one payment · rebates taken off for you</div>
      <header className="hdr">
        <div className="wrap">
          <Link href="/" className="logo">DFRNT <span>Solar</span></Link>
          <nav className="nav">{links.map(([h, t]) => <Link key={h} href={h!}>{t}</Link>)}</nav>
          <form action={setPostcode} className="pc" aria-label="Your postcode">
            <input name="postcode" defaultValue={postcode} inputMode="numeric" pattern="\d{4}" maxLength={4} aria-label="Postcode" />
            <input type="hidden" name="back" value={back} />
            <button className="btn sm" type="submit">Set</button>
          </form>
        </div>
      </header>
      <div className="mnav">{links.map(([h, t]) => <Link key={h} href={h!}>{t}</Link>)}</div>
    </>
  );
}

export function Footer() {
  return (
    <footer>
      <div className="wrap cols">
        <div><strong style={{ color: "#fff" }}>DFRNT Solar</strong><p>Solar and batteries for South East Queensland. Fixed installed prices, installed by licensed local electricians.</p></div>
        <div><Link href="/systems">Solar + battery</Link><br /><Link href="/batteries">Battery only</Link><br /><Link href="/price-list">Price list</Link></div>
        <div><Link href="/brands/solax">SolaX</Link><br /><Link href="/brands/sungrow">Sungrow</Link><br /><Link href="/brands/goodwe">GoodWe</Link></div>
        <div className="small">Prices include GST and installation. Rebates are the Small-scale Technology Certificates and Cheaper Home Batteries incentive, assigned to us and taken off your price.</div>
      </div>
    </footer>
  );
}
