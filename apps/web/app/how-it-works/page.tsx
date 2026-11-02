import Link from "next/link";
import { Static } from "@/components/Static";
export const metadata = { title: "How it works", description: "How buying solar online with DFRNT Solar works: price, photos, sign, pay, pick your install day, and your system record for life." };
export default function Page() {
  return (
    <Static eyebrow="How it works" title="One price, one contract, one payment.">
      <h3>1. Pick a system and see the real price</h3><p>Every system shows what you pay installed, after the government rebates. No home visit to get a number. Change the panels or battery and the price updates.</p>
      <h3>2. Secure the price for 14 days</h3><p>We lock today&apos;s price and rebate. If the battery rebate is about to drop, every install date we offer you is before the change.</p>
      <h3>3. Tell us about your home</h3><p>A few questions and four photos. If your home fits your installer&apos;s standard job you get your confirmed price straight away; otherwise your installer prices it from the photos, usually the same day.</p>
      <h3>4. Sign, pay, book</h3><p>One contract covers the equipment, the installation and the rebate paperwork. Pay by bank transfer (about 1% off) or card. Then pick a date from your installer&apos;s real free days.</p>
      <h3>5. Install and after</h3><p>A licensed local electrician installs and commissions your system. Your documents, warranties and support live on one page that&apos;s yours for good.</p>
      <p><Link className="btn" href="/systems">See every system</Link></p>
    </Static>
  );
}
