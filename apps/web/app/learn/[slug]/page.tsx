import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@dfrnt/db";
import { findSystem, priceSystem } from "@dfrnt/engine";
import { Header, Footer } from "@/components/Header";
import { SystemCard } from "@/components/SystemCard";
import { todayAEST } from "@/lib/api";
import { renderMarkdown } from "@/lib/markdown";
import { pricingData } from "@/lib/pricing-data";
import { sitePostcode } from "@/lib/site";

export const dynamic = "force-dynamic";

export default async function Article({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string>> }) {
  const { slug } = await params;
  const postcode = await sitePostcode(await searchParams);
  const [a] = await db()`select title, summary, body, system_slug, author, published_at from content_items where slug = ${slug} and status = 'published'`;
  if (!a) notFound();
  const data = await pricingData();
  const sys = a.system_slug ? findSystem(a.system_slug as string, data.catalogue) : undefined;
  return (
    <>
      <Header postcode={postcode} back={`/learn/${slug}`} />
      <section><div className="wrap" style={{ maxWidth: 720 }}>
        <p className="eyebrow"><Link href="/learn">Learn</Link> · {a.author as string}</p>
        <h1>{a.title as string}</h1>
        <p className="muted" style={{ fontSize: 18 }}>{a.summary as string}</p>
        <div dangerouslySetInnerHTML={{ __html: renderMarkdown(a.body as string) }} />
        {sys && <div style={{ marginTop: 28 }}><p className="eyebrow">Live price for {postcode}</p><SystemCard s={sys} q={priceSystem(sys, { postcode, asOf: todayAEST() }, data)} /></div>}
      </div></section>
      <Footer />
    </>
  );
}
