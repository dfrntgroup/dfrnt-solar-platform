import Link from "next/link";
import { Static } from "@/components/Static";
import { WARRANTIES } from "@/lib/warranties";
export const metadata = { title: "Warranty", description: "Warranties on every DFRNT Solar system: panels, inverter, battery and our workmanship, and who to call." };
export default function Page() {
  return (
    <Static eyebrow="Warranty" title="What's covered, and for how long.">
      <table className="incl"><tbody>
        <tr><td className="k">Our workmanship</td><td><strong>10 years</strong> from your install date, from DFRNT Solar. If something goes wrong with how your system was installed, we fix it at no cost to you.</td></tr>
      </tbody></table>
      <h2>Every product we sell</h2>
      <div className="tscroll"><table className="lines index"><thead><tr><th>Part</th><th>Product</th><th>Product warranty</th><th>Performance</th></tr></thead><tbody>
        {Object.values(WARRANTIES).map((w) => <tr key={w.brand + w.product}><td>{w.part}</td><td><strong>{w.brand}</strong> {w.product}{w.note ? <><br /><span className="small muted">{w.note}</span></> : null}</td>
          <td>{w.years ? `${w.years} years` : <span className="small">Confirmed for your panel before you sign</span>}</td><td className="small">{w.performance ?? "—"}</td></tr>)}
      </tbody></table></div>
      <p className="small muted">Manufacturer warranties are passed on to you in full and registered to your address. Terms are each manufacturer&apos;s Australian warranty.</p>
      <p>The exact manufacturer terms for your parts are on your system record, with the serial numbers registered to your address.</p>
      <h2>One number to call</h2>
      <p>If something stops working, tell us on your system record or <Link href="/contact?kind=fault">here</Link>. We deal with the installer and the manufacturer for you; you don&apos;t chase anyone.</p>
      <h2>Your rights under the law</h2>
      <p>Our goods come with guarantees that cannot be excluded under the Australian Consumer Law. You are entitled to a replacement or refund for a major failure and compensation for any other reasonably foreseeable loss or damage. You are also entitled to have the goods repaired or replaced if the goods fail to be of acceptable quality and the failure does not amount to a major failure.</p>
      <p className="small muted">Full terms: clause 11 of the <Link href="/agreement">installation agreement</Link>.</p>
    </Static>
  );
}
