import Link from "next/link";
import { notFound } from "next/navigation";
import { Header, Footer } from "@/components/Header";
import { SystemCard } from "@/components/SystemCard";
import { earliestFor } from "@/lib/capacity";
import { priced, sitePostcode } from "@/lib/site";

export const dynamic = "force-dynamic";

const brands: Record<string, { name: string; line: string }> = {
  solax: { name: "SolaX", line: "Our core range. X1-VAST hybrid inverters with stackable T-BAT HS51 batteries, expandable later." },
  sungrow: { name: "Sungrow", line: "The world's second-largest inverter maker. SH-RS hybrids with SBH modular batteries." },
  goodwe: { name: "GoodWe", line: "Our value range. The ESA all-in-one: inverter and Lynx D batteries in one column." },
};

export default async function Brand({ params, searchParams }: { params: Promise<{ brand: string }>; searchParams: Promise<Record<string, string>> }) {
  const { brand } = await params;
  const b = brands[brand];
  if (!b) notFound();
  const postcode = await sitePostcode(await searchParams);
  const earliest = await earliestFor(postcode);
  const rows = (await priced(postcode, (s) => s.brand.toLowerCase() === brand)).sort((a, b2) => a.q.stack.amount_payable - b2.q.stack.amount_payable);
  return (
    <>
      <Header postcode={postcode} back={`/brands/${brand}`} />
      <section><div className="wrap">
        <p className="eyebrow">Brands · {Object.entries(brands).map(([k, v], i) => <span key={k}>{i ? " · " : ""}<Link href={`/brands/${k}`}>{v.name}</Link></span>)}</p>
        <h1>{b.name}</h1>
        <p className="muted">{b.line}</p>
        <div className="grid">{rows.map(({ s, q }) => <SystemCard key={s.slug} s={s} q={q} earliest={earliest} />)}</div>
      </div></section>
      <Footer />
    </>
  );
}
