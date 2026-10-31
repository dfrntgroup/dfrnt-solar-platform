import { Header, Footer } from "@/components/Header";
import { applyInstaller } from "./actions";

export const metadata = { title: "Install for DFRNT Solar" };

export default async function Apply({ searchParams }: { searchParams: Promise<{ sent?: string }> }) {
  const sp = await searchParams;
  const input = { width: "100%", padding: 10, border: "1px solid var(--line)", borderRadius: 6, font: "inherit" } as const;
  return (
    <>
      <Header postcode="4551" />
      <section><div className="wrap" style={{ maxWidth: 560 }}>
        <p className="eyebrow">For installers</p><h1>Install for DFRNT Solar.</h1>
        <p className="muted">Jobs priced from your own labour menu, paid from a ledger as soon as the job is installed. You set your days, your areas and the jobs you&apos;ll price instantly.</p>
        {sp.sent ? <div className="ok">Thanks — we&apos;ll be in touch within two business days.</div> : (
          <form action={applyInstaller}>
            {([["business_name", "Business name"], ["abn", "ABN"], ["contact_name", "Your name"], ["email", "Email"], ["phone", "Mobile"], ["licence_no", "Electrical contractor licence"], ["postcodes", "Postcodes you cover (e.g. 4000-4299, 4550-4575)"]] as const)
              .map(([k, l]) => <p key={k}><input name={k} placeholder={l} style={input} required={["business_name", "contact_name", "email"].includes(k)} /></p>)}
            <p><textarea name="notes" placeholder="Anything else (crew size, brands you install, SAA accreditation)" style={{ ...input, minHeight: 90 }} /></p>
            <button className="btn block">Apply</button>
          </form>)}
      </div></section>
      <Footer />
    </>
  );
}
