import Link from "next/link";
import { Static } from "@/components/Static";
import { getSetting } from "@/lib/settings";
import { team } from "@/lib/team";
export const metadata = { title: "About us", description: "DFRNT Solar is a family-owned solar and battery company on the Sunshine Coast, from the team behind InStyle Solar." };
// Copy from Karl's Pylon "About us" (1 Nov 2026). Accreditation line left out until confirmed current.
export default async function Page() {
  const people = team((await getSetting("trust")).team);
  return (
    <Static eyebrow="About us" title="We built one of Australia's largest solar companies. Then we sold it. Now we're back.">
      <p className="lead">In 2014, Karl Brown invested $2,500 into InStyle Solar. Over nine years, we installed 29,000+ systems, generated $50M+ in annual revenue, ranked #3 on the AFR Fast 100, and completed an eight-figure exit to Hanwha Energy in 2023.</p>
      <p>Walking away gave us clarity. We saw how incentives distort behaviour, how confusion closes deals, and how often homeowners are left undersupported or disappointed. So we came back.</p>
      <h2>Most solar companies want you confused. We want you confident.</h2>
      <p>We want you to understand every component and why it was chosen. See exactly where your money goes. Know what your system should produce, and hold us to it. A confident customer doesn&apos;t need to be sold. They need the truth.</p>
      <p>That&apos;s why every price is on this website, installed, with the rebate already taken off. No salespeople, no pressure tactics, no shortcuts, no disappearing after install.</p>
      <h2>Accountable after the install</h2>
      <p>Every system comes with its own system record: serial numbers, warranty details, compliance certificate and full photo documentation, kept on one page you can come back to any time. We back every install with a 10-year workmanship warranty.</p>
      <p>We&apos;re not building the biggest solar company. We&apos;re building the one homeowners actually deserve. Family-owned, based in South East Queensland.</p>
      {people.length > 0 && <><h2>The people behind it</h2>
        <div className="grid g2" style={{ marginTop: 12 }}>{people.map((m) => <div key={m.name} className="card face">
          <span className="avatar" aria-hidden>{m.initials}</span><div><strong>{m.name}</strong> · {m.role}{m.line && <><br /><span className="small muted">{m.line}</span></>}</div></div>)}</div></>}
      <p style={{ marginTop: 22 }}><Link className="btn" href="/systems">See every price</Link> <Link className="btn ghost" href="/contact?kind=callback">Talk to a human</Link></p>
    </Static>
  );
}
