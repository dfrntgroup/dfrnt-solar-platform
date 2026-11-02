import Link from "next/link";
import { Static } from "@/components/Static";
import { LegalText } from "@/components/Legal";
import { PRIVACY, PRIVACY_VERSION } from "@/lib/legal";

export const metadata = { title: "Privacy policy", description: "How DFRNT Solar collects, uses and protects your information, including meter data you choose to share." };
export default function Page() {
  return (
    <Static eyebrow="Privacy policy" title="How we look after your information.">
      
      <LegalText sections={PRIVACY} />
      <p className="small muted">Version {PRIVACY_VERSION}. <Link href="/agreement">Installation agreement</Link> · <Link href="/terms">Website terms</Link> · <Link href="/privacy">Privacy</Link></p>
    </Static>
  );
}
