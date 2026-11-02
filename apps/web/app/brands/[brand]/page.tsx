import Link from "next/link";
import { notFound } from "next/navigation";
import { Header, Footer } from "@/components/Header";
import { SystemCard } from "@/components/SystemCard";
import { earliestFor } from "@/lib/capacity";
import { priced, sitePostcode } from "@/lib/site";
import { BRANDS, PAIRS } from "@/lib/brands";

export const dynamic = "force-dynamic";

const brands = BRANDS;

export async function generateMetadata({ params }: { params: Promise<{ brand: string }> }) {
  const b = BRANDS[(await params).brand];
  return b ? { title: `${b.name} solar and batteries, installed`, description: `${b.name} systems installed in South East Queensland at fixed prices, rebate already taken off. See every ${b.name} system and its price for your postcode.`, alternates: { canonical: `/brands/${(await params).brand}` } } : {};
}
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
        <p className="small">Compare: {PAIRS.filter((p) => p.split("-vs-").includes(brand)).map((p, i) => <span key={p}>{i ? " · " : ""}<Link href={`/compare/${p}`}>{p.split("-vs-").map((x) => BRANDS[x]!.name).join(" vs ")}</Link></span>)}</p>
        <div className="grid">{rows.map(({ s, q }) => <SystemCard key={s.slug} s={s} q={q} earliest={earliest} />)}</div>
      </div></section>
      <Footer />
    </>
  );
}
