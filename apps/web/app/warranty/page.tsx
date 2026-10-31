import Link from "next/link";
import { Static } from "@/components/Static";
export const metadata = { title: "Warranty" };
export default function Page() {
  return (
    <Static eyebrow="Warranty" title="What's covered, and for how long.">
      <table className="incl"><tbody>
        <tr><td className="k">Workmanship</td><td>10 years from your install date, from DFRNT Solar. If something goes wrong with how your system was installed, we fix it at no cost to you.</td></tr>
        <tr><td className="k">Panels</td><td>Manufacturer&apos;s product and performance warranty, passed on to you in full (Risen: 30-year performance).</td></tr>
        <tr><td className="k">Inverter</td><td>Manufacturer&apos;s warranty, passed on in full.</td></tr>
        <tr><td className="k">Battery</td><td>Manufacturer&apos;s warranty, passed on in full (typically 10 years with a minimum retained capacity).</td></tr>
      </tbody></table>
      <p>The exact manufacturer terms for your parts are on your system record, with the serial numbers registered to your address.</p>
      <h2>One number to call</h2>
      <p>If something stops working, tell us on your system record or <Link href="/contact?kind=fault">here</Link>. We deal with the installer and the manufacturer for you; you don&apos;t chase anyone.</p>
      <h2>Your rights under the law</h2>
      <p>Our goods come with guarantees that cannot be excluded under the Australian Consumer Law. You are entitled to a replacement or refund for a major failure and compensation for any other reasonably foreseeable loss or damage. You are also entitled to have the goods repaired or replaced if the goods fail to be of acceptable quality and the failure does not amount to a major failure.</p>
      <p className="small muted">Full terms: clause 11 of the <Link href="/agreement">installation agreement</Link>.</p>
    </Static>
  );
}
