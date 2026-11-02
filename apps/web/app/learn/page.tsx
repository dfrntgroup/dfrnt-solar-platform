import Link from "next/link";
import { db } from "@dfrnt/db";
import { Header, Footer } from "@/components/Header";
import { sitePostcode } from "@/lib/site";

export const dynamic = "force-dynamic";
export const metadata = { title: "Learn", description: "Plain-English guides to solar, home batteries and rebates in Queensland." };

export default async function Learn({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const postcode = await sitePostcode(await searchParams);
  const items = await db()`select slug, title, summary, published_at from content_items where status = 'published' order by published_at desc`;
  return (
    <>
      <Header postcode={postcode} back="/learn" />
      <section><div className="wrap">
        <p className="eyebrow">Learn</p><h1>Straight answers on solar and batteries.</h1>
        <div className="grid">{items.map((i) => <Link key={i.slug as string} href={`/learn/${i.slug}`} className="card" style={{ textDecoration: "none" }}><h3>{i.title as string}</h3><p className="muted small">{i.summary as string}</p></Link>)}</div>
      </div></section>
      <Footer />
    </>
  );
}
