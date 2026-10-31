import Link from "next/link";
import { Static } from "@/components/Static";
import { LegalText } from "@/components/Legal";
import { TERMS, AGREEMENT_VERSION } from "@/lib/legal";

export const metadata = { title: "Website terms" };
export default function Page() {
  return (
    <Static eyebrow="Website terms" title="What a price on this website means.">
      
      <LegalText sections={TERMS} />
      <p className="small muted">Version {AGREEMENT_VERSION}. <Link href="/agreement">Installation agreement</Link> · <Link href="/terms">Website terms</Link> · <Link href="/privacy">Privacy</Link></p>
    </Static>
  );
}
