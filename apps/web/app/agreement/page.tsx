import Link from "next/link";
import { Static } from "@/components/Static";
import { LegalText } from "@/components/Legal";
import { AGREEMENT, AGREEMENT_VERSION } from "@/lib/legal";

export const metadata = { title: "Installation agreement", description: "The DFRNT Solar installation agreement: what you get, how payment works, your 10-business-day change-of-mind refund, warranties and complaints." };
export default function Page() {
  return (
    <Static eyebrow="Installation agreement" title="The agreement you sign.">
      <p className="lead">This is the agreement every customer signs on their system record. Read it before you start; nothing in it is hidden in fine print.</p>
      <LegalText sections={AGREEMENT} />
      <p className="small muted">Version {AGREEMENT_VERSION}. <Link href="/agreement">Installation agreement</Link> · <Link href="/terms">Website terms</Link> · <Link href="/privacy">Privacy</Link></p>
    </Static>
  );
}
