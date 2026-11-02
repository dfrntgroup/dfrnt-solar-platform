import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@dfrnt/db";
import { Header, Footer } from "@/components/Header";
import { SystemCard } from "@/components/SystemCard";
import { CallBack } from "@/components/CallBack";
import { nextDaysFor } from "@/lib/schedule";
import { photoUrl } from "@/lib/storage";
import { suburbs } from "@/lib/suburbs";
import { longDate, priced } from "@/lib/site";

export const dynamic = "force-dynamic";

async function find(slug: string) { return (await suburbs()).find((s) => s.slug === slug); }

export async function generateMetadata({ params }: { params: Promise<{ suburb: string }> }) {
  const s = await find((await params).suburb);
  if (!s) return { title: "Not found" };
  return { title: `Solar and batteries in ${s.name} ${s.postcode}`, description: `Fixed installed prices for ${s.name}, rebate already off, real installs nearby and the next free install days.` };
}

/** B2: one page per suburb with real installs: prices for that postcode, next free days, installs and reviews nearby. */
export default async function Suburb({ params, searchParams }: { params: Promise<{ suburb: string }>; searchParams: Promise<Record<string, string>> }) {
  const { suburb } = await params;
  const sp = await searchParams;
  const s = await find(suburb);
  if (!s) notFound();
  const all = await priced(s.postcode);
  const top = all.filter(({ s: x }) => ["solax-10kw-15kwh", "goodwe-10kw-18kwh", "sungrow-10kw-20kwh"].includes(x.slug));
  const days = await nextDaysFor(s.postcode, undefined, 3).catch(() => null);
  const reviews = await db()`select r.rating, r.body, r.first_name, r.suburb from reviews r where r.status = 'published' and lower(r.suburb) = lower(${s.name}) order by r.published_at desc limit 6`;
  const installs = await db()`select q.title, (select p.path from quote_photos p where p.quote_id = q.id and p.public order by p.created_at limit 1) photo
    from quotes q where q.showcase_consent and lower(q.site->'address'->>'suburb') = lower(${s.name}) and q.status in ('installed','lodged','settled','complete')
      and exists (select 1 from quote_photos p where p.quote_id = q.id and p.public) limit 6`;
  const photos = await Promise.all(installs.map(async (i) => ({ title: i.title as string, url: i.photo ? await photoUrl(i.photo as string) : null })));
  return (
    <>
      <Header postcode={s.postcode} back={`/solar/${suburb}`} />
      <section><div className="wrap">
        <p className="eyebrow">{s.name} · {s.postcode}</p>
        <h1>Solar and batteries in {s.name}.</h1>
        <p className="lead">Every price below is for {s.postcode}: installed, with the rebate already taken off. {s.installs} home{s.installs > 1 ? "s" : ""} in {s.name} installed with us.</p>
        {days?.length ? <p><strong>Next free install days:</strong> {days.map((d) => longDate(d)).join(" · ")}</p> : null}
        <div className="grid" style={{ marginTop: 18 }}>{top.map(({ s: x, q }) => <SystemCard key={x.slug} s={x} q={q} earliest={days?.[0] ?? null} />)}</div>
        <p style={{ marginTop: 16 }}><Link className="btn ghost" href={`/systems?postcode=${s.postcode}`}>See all {all.length} systems for {s.postcode} →</Link></p>
        {photos.some((p) => p.url) && <><h2 style={{ marginTop: 28 }}>Installs in {s.name}</h2>
          <div className="grid">{photos.filter((p) => p.url).map((p, i) => <div key={i} className="card"><img src={p.url!} alt={`Installation in ${s.name}`} loading="lazy" style={{ width: "100%" }} /><span className="small">{p.title}</span></div>)}</div></>}
        {reviews.length > 0 && <><h2 style={{ marginTop: 28 }}>What {s.name} customers said</h2>
          {reviews.map((r, i) => <div key={i} className="card" style={{ marginBottom: 8 }}><span className="stars">{"★".repeat(r.rating as number)}</span><p style={{ margin: "4px 0" }}>{r.body as string}</p><span className="small muted">{r.first_name as string}, {r.suburb as string}</span></div>)}</>}
        <div style={{ maxWidth: 440 }}><CallBack back={`/solar/${suburb}`} state={sp.callback} /></div>
      </div></section>
      <Footer />
    </>
  );
}
