import Link from "next/link";
import { Header, Footer } from "@/components/Header";
import { publishedReviews, MIN_FOR_AVERAGE } from "@/lib/reviews";
import { sitePostcode } from "@/lib/site";

export const dynamic = "force-dynamic";
export const metadata = { title: "Customer reviews" };

/** A21: every published review, newest first. No average until there are enough reviews to mean something. */
export default async function Reviews({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const postcode = await sitePostcode(await searchParams);
  const { rows, count, average } = await publishedReviews();
  return (
    <>
      <Header postcode={postcode} back="/reviews" />
      <section><div className="wrap" style={{ maxWidth: 760 }}>
        <p className="eyebrow">Reviews</p>
        <h1>What our customers say.</h1>
        <p className="lead">Every customer is asked after their install. We publish every genuine review, good or bad, and reply to the ones that tell us we got something wrong.</p>
        {average != null && <p className="pay"><small>Average from {count} reviews</small>{average} / 5</p>}
        {count > 0 && average == null && <p className="muted small">{count} review{count === 1 ? "" : "s"} so far. We&apos;ll show an average once there are {MIN_FOR_AVERAGE}.</p>}
        {rows.map((r) => (
          <div key={r.id} className="card" style={{ marginTop: 14 }}>
            <p><span className="stars" aria-label={`${r.rating} out of 5`}>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span></p>
            <p>{r.body}</p>
            <p className="small muted">{[r.first_name, r.suburb].filter(Boolean).join(", ")} · {new Date(r.published_at).toLocaleDateString("en-AU", { month: "long", year: "numeric" })}{r.business_name ? ` · installed by ${r.business_name}` : ""}</p>
            {r.reply && <p className="small" style={{ borderLeft: "3px solid var(--teal)", paddingLeft: 10 }}><strong>Our reply:</strong> {r.reply}</p>}
          </div>))}
        {count === 0 && <div className="card mint" style={{ marginTop: 20 }}><h3>We&apos;re new, so there are no reviews yet.</h3><p className="muted">We won&apos;t borrow ratings from anywhere else. The first reviews appear here as our first customers&apos; systems switch on. Until then, the founders behind 29,000+ solar installs are a phone call away.</p><Link className="link" href="/contact?kind=callback">Book a call</Link></div>}
      </div></section>
      <Footer />
    </>
  );
}
