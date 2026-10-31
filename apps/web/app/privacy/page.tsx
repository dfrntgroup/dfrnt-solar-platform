import Link from "next/link";
import { Static } from "@/components/Static";
import { LegalText } from "@/components/Legal";
import { PRIVACY, PRIVACY_VERSION } from "@/lib/legal";

export const metadata = { title: "Privacy policy" };
export default function Page() {
  return (
    <Static eyebrow="Privacy policy" title="How we look after your information.">
      
      <LegalText sections={PRIVACY} />
      <p className="small muted">Version {PRIVACY_VERSION}. <Link href="/agreement">Installation agreement</Link> · <Link href="/terms">Website terms</Link> · <Link href="/privacy">Privacy</Link></p>
    </Static>
  );
}
