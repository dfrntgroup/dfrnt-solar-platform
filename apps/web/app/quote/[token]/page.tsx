import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@dfrnt/db";
import type { Quote } from "@dfrnt/engine";
import { Header, Footer } from "@/components/Header";
import { aud, aud2, longDate } from "@/lib/site";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your secured price", robots: { index: false } };

export default async function QuoteRecord({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f]{36}$/.test(token)) notFound();
  const [row] = await db()`select status, postcode, title, lock_until::text as lock_until, result from quotes where token = ${token}`;
  if (!row) notFound();
  const q = row.result as Quote;
  const st = q.stack;
  return (
    <>
      <Header postcode={row.postcode as string} back={`/quote/${token}`} />
      <section><div className="wrap" style={{ maxWidth: 680 }}>
        <p className="eyebrow">Your secured price · {row.status as string}</p>
        <h1>{(row.title as string) ?? q.config.summary}</h1>
        <p className="muted">{q.config.summary}</p>
        <div className="pay" style={{ margin: "16px 0 6px" }}><small>You pay, installed</small>{aud(st.amount_payable)}</div>
        <div className="ok">Price and rebate locked until <strong>{longDate(row.lock_until as string)}</strong>. Keep this link: it&apos;s your record.</div>
        <table className="lines" style={{ marginTop: 18 }}><tbody>
          <tr><td>Price before rebates (inc GST {aud2(st.gst)})</td><td className="r">{aud2(st.price_inc_gst)}</td></tr>
          <tr><td>Less assignment of STCs ({st.stcs} certificates)</td><td className="r">−{aud2(st.less_stcs)}</td></tr>
          <tr className="total"><td>You pay</td><td className="r">{aud2(st.amount_payable)}</td></tr>
        </tbody></table>
        <h2 style={{ marginTop: 28 }}>Next steps</h2>
        <ol className="muted"><li>Tell us about your home and send a few photos (coming in the next build step).</li><li>Your installer confirms the install, usually the same day.</li><li>Sign, pay and choose your install date.</li></ol>
        <p><Link href="/systems">← Back to systems</Link></p>
      </div></section>
      <Footer />
    </>
  );
}
