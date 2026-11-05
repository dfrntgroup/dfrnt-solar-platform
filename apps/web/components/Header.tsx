import Link from "next/link";
import { setPostcode } from "@/app/actions";
import { db } from "@dfrnt/db";
import { SELLER } from "@/lib/legal";
import { getSetting } from "@/lib/settings";

/** Reviews and Real installs only appear in the menus once there's something real to show. */
let proofCache: { at: number; v: { reviews: boolean; installs: boolean } } | null = null;
async function proof() {
  if (proofCache && Date.now() - proofCache.at < 300_000) return proofCache.v;
  const v = await proofFresh();
  proofCache = { at: Date.now(), v };
  return v;
}
async function proofFresh() {
  try {
    const { includeTest } = await import("@/lib/installers");
    const [r] = await db()`select
      (select count(*)::int from reviews v left join installers i on i.id = v.installer_id where v.status = 'published' and (i.id is null or not i.is_test or ${includeTest()})) reviews,
      (select count(*)::int from quotes q left join installers i on i.id = q.installer_id where q.showcase_consent and q.status in ('installed','lodged','settled','complete')
        and (i.id is null or not i.is_test or ${includeTest()}) and exists (select 1 from quote_photos p where p.quote_id = q.id and p.public)) installs`;
    return { reviews: (r?.reviews as number) > 0, installs: (r?.installs as number) > 0 };
  } catch { return { reviews: false, installs: false }; }
}

// Brand guideline v1.1 (5 Nov 2026): Batteries · Build your own · What would it cost me · Our story · the phone · one teal button.
const links = [["/systems", "Systems"], ["/batteries", "Batteries"], ["/build", "Build your own"], ["/estimate", "What would it cost me"], ["/about", "Our story"]];
const more = [["/price-list", "Price list"], ["/price-index", "Price Index"], ["/beat-my-quote", "Beat my quote"], ["/rebates", "Rebate calculator"], ["/how-it-works", "How it works"], ["/learn", "Learn"], ["/faq", "Questions"]];

export function Wordmark({ size = 30 }: { size?: number }) {
  return <Link href="/" className="wm" style={{ fontSize: size }} aria-label="DFRNT Solar"><b>DF<i>R</i>NT</b><small>Solar</small></Link>;
}

export async function Header({ postcode, back = "/" }: { postcode: string; back?: string }) {
  const pr = await proof();
  return (
    <header className="hdr">
      <div className="wrap">
        <div className="left">
          <details className="menu"><summary aria-label="Menu">☰</summary>
            <div className="drawer">{links.map(([h, t]) => <Link key={h} href={h!}>{t}</Link>)}{more.map(([h, t]) => <Link key={h} href={h!}>{t}</Link>)}{pr.reviews && <Link href="/reviews">Reviews</Link>}{pr.installs && <Link href="/installs">Real installs</Link>}<Link href="/contact">Talk to a human</Link></div>
          </details>
        </div>
        <div className="center"><Wordmark /></div>
        <nav className="desk">{links.map(([h, t]) => <Link key={h} href={h!}>{t}</Link>)}</nav>
        <div className="right">
          <a className="tel" href="tel:1300133768" aria-label="Call us on 1300 133 768"><span className="hide-sm">1300 1 DFRNT</span><span className="show-sm" aria-hidden>☎</span></a>
          <Link className="btn cta" href="/estimate">See my price</Link>
          <details style={{ position: "relative" }}>
            <summary className="pcchip" style={{ listStyle: "none", cursor: "pointer" }}>📍 {postcode}</summary>
            <form action={setPostcode} style={{ position: "absolute", right: 0, top: 40, background: "#fff", color: "var(--ink)", border: "3px solid var(--ink)", padding: 12, display: "flex", gap: 6, zIndex: 40, width: 220 }}>
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

export async function Footer() {
  const pr = await proof();
  const t = await getSetting("trust");
  const tel = SELLER.phone.replace(/\s/g, "");
  return (
    <footer>
      <div className="wrap cols">
        <div><Wordmark size={26} /><div className="hand">Different. On purpose.</div><p>Solar and home batteries for South East Queensland. The price is on the page.</p></div>
        <div><Link href="/systems">All systems</Link><br /><Link href="/batteries">Batteries</Link><br /><Link href="/estimate">What would it cost me</Link><br /><Link href="/build">Build your own</Link><br /><Link href="/price-list">Price list</Link><br /><Link href="/price-index">Price Index</Link><br /><Link href="/rebates">Rebate calculator</Link><br /><Link href="/beat-my-quote">Beat my quote</Link>{pr.reviews && <><br /><Link href="/reviews">Reviews</Link></>}{pr.installs && <><br /><Link href="/installs">Real installs</Link></>}</div>
        <div><Link href="/how-it-works">How it works</Link><br /><Link href="/faq">Questions</Link><br /><Link href="/about">Our story</Link><br /><Link href="/warranty">Warranty</Link><br /><Link href="/learn">Learn</Link><br /><Link href="/refer">Refer a friend</Link><br /><Link href="/creators">Creators</Link></div>
        <div><Link href="/brands/solax">SolaX</Link><br /><Link href="/brands/sungrow">Sungrow</Link><br /><Link href="/brands/goodwe">GoodWe</Link><br /><Link href="/installers/apply">For installers</Link><br /><Link href="/contact">Talk to a human</Link><br /><Link href="/agreement">Agreement</Link><br /><Link href="/terms">Terms</Link><br /><Link href="/privacy">Privacy</Link></div>
      </div>
      <div className="wrap small biz" style={{ marginTop: 24 }}>
        <strong style={{ color: "#fff" }}>DFRNT Solar</strong> · Different. On purpose.<br />
        <strong>{SELLER.name}</strong> trading as {SELLER.trading} · ABN {SELLER.abn}{t.licence ? ` · ${t.licence}` : ""}{t.insurance ? ` · ${t.insurance}` : ""}<br />
        {t.address ? `${t.address} · ` : ""}<a href={`tel:${tel}`}>{SELLER.phone}</a> · <a href={`mailto:${SELLER.email}`}>{SELLER.email}</a>{t.hours ? ` · Calls answered ${t.hours}` : ""}
      </div>
      <div className="wrap small" style={{ marginTop: 12, opacity: .8 }}>Installs by licensed electricians accredited with Solar Accreditation Australia. Prices include GST and installation. Rebates are Small-scale Technology Certificates under the Small-scale Renewable Energy Scheme, including the Cheaper Home Batteries Program, assigned to us and taken off your price.</div>
    </footer>
  );
}
