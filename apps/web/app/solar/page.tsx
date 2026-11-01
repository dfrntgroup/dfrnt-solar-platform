import Link from "next/link";
import { Header, Footer } from "@/components/Header";
import { suburbs } from "@/lib/suburbs";
import { sitePostcode } from "@/lib/site";

export const dynamic = "force-dynamic";
export const metadata = { title: "Solar and batteries by suburb" };

export default async function Suburbs({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const postcode = await sitePostcode(await searchParams);
  const list = await suburbs();
  return (
    <>
      <Header postcode={postcode} back="/solar" />
      <section><div className="wrap" style={{ maxWidth: 800 }}>
        <h1>Suburbs we&apos;ve installed in</h1>
        {list.length ? <div className="filters">{list.map((s) => <Link key={s.slug} className="chip" href={`/solar/${s.slug}`}>{s.name} {s.postcode}</Link>)}</div>
          : <p className="muted">Our first installs are on the way. In the meantime, <Link href="/systems">see every system priced for your postcode</Link>.</p>}
      </div></section>
      <Footer />
    </>
  );
}
