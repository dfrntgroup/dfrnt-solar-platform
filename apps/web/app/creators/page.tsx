import Link from "next/link";
import { Static } from "@/components/Static";
export const metadata = { title: "Creators" };
export default function Page() {
  return (
    <Static eyebrow="Creators" title="Make honest videos about your system. Get paid per install.">
      <p>We work with homeowners, tradies and product experts who make straightforward content about solar and batteries. You get your own code: your audience gets money off, and you earn a commission for every system installed from it.</p>
      <ul><li>Paid only on installed jobs, after install.</li><li>Every post must say it&apos;s a paid partnership (ACCC and AANA rules).</li><li>We can run your posts as ads, with your permission.</li></ul>
      <p><Link className="btn" href="/contact?kind=question">Apply to be a creator</Link></p>
    </Static>
  );
}
