import Link from "next/link";
import { db } from "@dfrnt/db";
import { Header, Footer } from "@/components/Header";
import { photoUrl } from "@/lib/storage";
import { friendlySummary } from "@/lib/images";
import { sitePostcode } from "@/lib/site";

export const dynamic = "force-dynamic";
export const metadata = { title: "Real installs" };

/** A22: real DFRNT Solar installs, shown only with the customer's consent and only the photos ops picked. */
export default async function Installs({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const postcode = await sitePostcode(await searchParams);
  let jobs: { id: string; title: string | null; summary: string; suburb: string | null; d: string; photos: string[] }[] = [];
  try {
    const rows = await db()`select q.id, q.title, q.result->'config'->>'summary' summary, q.site->'address'->>'suburb' suburb, coalesce(q.install_date::text, '') d,
        array(select p.path from quote_photos p where p.quote_id = q.id and p.public order by p.created_at) photos
      from quotes q where q.showcase_consent and q.status in ('installed','lodged','settled','complete')
        and exists (select 1 from quote_photos p where p.quote_id = q.id and p.public) order by q.install_date desc nulls last limit 60`;
    jobs = await Promise.all(rows.map(async (r) => ({ id: r.id as string, title: r.title as string | null, summary: (r.summary as string) ?? "", suburb: r.suburb as string | null, d: r.d as string,
      photos: (await Promise.all((r.photos as string[]).slice(0, 3).map(photoUrl))).filter(Boolean) as string[] })));
  } catch { jobs = []; }
  return (
    <>
      <Header postcode={postcode} back="/installs" />
      <section><div className="wrap">
        <p className="eyebrow">Real installs</p>
        <h1>Systems we&apos;ve put on real homes.</h1>
        <p className="lead">Every photo here is from a DFRNT Solar install, shared with the owner&apos;s permission. No stock photos, no addresses.</p>
        <div className="grid">{jobs.map((j) => (
          <div key={j.id} className="card">
            <div className="tiles" style={{ gridTemplateColumns: `repeat(${Math.max(1, j.photos.length)}, 1fr)`, margin: "0 0 12px" }}>{j.photos.map((u, i) => <img key={i} src={u} alt="Installed system" style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 7 }} />)}</div>
            <h3>{j.title ?? friendlySummary(j.summary)}</h3>
            <p className="small muted">{[j.suburb, j.d && new Date(j.d).toLocaleDateString("en-AU", { month: "long", year: "numeric" })].filter(Boolean).join(" · ")}</p>
          </div>))}</div>
        {jobs.length === 0 && <div className="card mint" style={{ marginTop: 10 }}><h3>The first installs go up here soon.</h3><p className="muted">We only show photos of our own work, with the owner&apos;s say-so. Until there are some, see exactly what&apos;s included in every system.</p><Link className="link" href="/systems">See all systems</Link></div>}
      </div></section>
      <Footer />
    </>
  );
}
