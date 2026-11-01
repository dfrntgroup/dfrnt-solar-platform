import { db } from "@dfrnt/db";
import { Header, Footer } from "@/components/Header";
import { unsubSig } from "@/lib/campaigns";

export const dynamic = "force-dynamic";
export const metadata = { title: "Unsubscribe", robots: { index: false } };

export default async function Unsubscribe({ searchParams }: { searchParams: Promise<{ e?: string; s?: string }> }) {
  const { e = "", s = "" } = await searchParams;
  const email = e.trim().toLowerCase();
  const ok = !!email && s === unsubSig(email);
  if (ok) await db()`insert into marketing_optout (email) values (${email}) on conflict do nothing`;
  return (
    <>
      <Header postcode="4551" />
      <section><div className="wrap" style={{ maxWidth: 600 }}>
        <h1 style={{ fontSize: 30 }}>{ok ? "You're unsubscribed" : "That link didn't work"}</h1>
        <p>{ok ? `We won't send ${email} any more emails about prices or rebates. If you have a system with us, you'll still get emails about your installation.` : "Reply to any of our emails and we'll take you off the list."}</p>
      </div></section>
      <Footer />
    </>
  );
}
