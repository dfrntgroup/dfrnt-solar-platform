import { Static } from "@/components/Static";
export const metadata = { title: "About us" };
export default function Page() {
  return (
    <Static eyebrow="About" title="Built by people who've installed 29,000 systems.">
      <p>DFRNT Solar is a family-owned solar and battery company in South East Queensland. The founders built and sold one of Australia&apos;s largest solar installers before starting again with a simpler idea: show the real price, take the rebate off for you, and use the best local electricians.</p>
      <p>We don&apos;t send salespeople. Every price is on the website. Your installer is a licensed local electrician who prices your home from photos and is paid fairly for the work.</p>
      <p className="small muted">[placeholder — final wording and photos from Karl]</p>
    </Static>
  );
}
