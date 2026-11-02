import Link from "next/link";
import { Static } from "@/components/Static";
export const metadata = { title: "Refer a friend", description: "Refer a friend to DFRNT Solar: they get $250 off and you get $250 after their install." };
export default function Page() {
  return (
    <Static eyebrow="Refer a friend" title="$250 for you, $250 off for them.">
      <p>Every DFRNT Solar customer gets a code on their system page after install. Your friend enters it before they sign and gets $250 off. We pay you $250 once their system is installed.</p>
      <p>No limit on how many friends you refer.</p>
      <p><Link className="btn" href="/systems">See prices</Link></p>
    </Static>
  );
}
