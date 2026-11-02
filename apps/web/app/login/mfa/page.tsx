import { Header, Footer } from "@/components/Header";
import { MfaChallenge } from "@/components/Mfa";

export const dynamic = "force-dynamic";
export default async function Mfa({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <>
      <Header postcode="4551" />
      <section><div className="wrap" style={{ maxWidth: 380 }}><h1 style={{ fontSize: 28 }}>Enter your code</h1><p className="muted">From your authenticator app.</p>
        <MfaChallenge next={next && next.startsWith("/") && !next.startsWith("//") ? next : "/ops"} /></div></section>
      <Footer />
    </>
  );
}
