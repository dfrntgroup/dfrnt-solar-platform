import { Header, Footer } from "@/components/Header";
import { PhotoInput } from "@/components/PhotoInput";
import { sitePostcode } from "@/lib/site";
import { beatQuote } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Beat my quote" };

/** A12: send another company's quote; we show the like-for-like price from our engine. */
export default async function Beat({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const postcode = await sitePostcode(sp);
  const input = { width: "100%", padding: 12, border: "1px solid #aebdba", borderRadius: 7, font: "inherit" } as const;
  return (
    <>
      <Header postcode={postcode} back="/beat-my-quote" />
      <section><div className="wrap" style={{ maxWidth: 600 }}>
        <p className="eyebrow">Beat my quote</p>
        <h1>Got a quote? Let&apos;s compare it honestly.</h1>
        <p className="lead">Send us a photo of it. We&apos;ll match the system like for like and show you our installed price, line by line. If theirs is better value, we&apos;ll tell you.</p>
        {sp.sent ? <div className="ok">Got it. A real person will reply within one business day.</div> : (
          <form action={beatQuote}>
            <p><input name="name" placeholder="Name" style={input} required /></p>
            <p><input name="email" type="email" placeholder="Email" style={input} required /></p>
            <p><input name="price" placeholder="Their price after rebates ($)" style={input} /></p>
            <p><textarea name="details" placeholder="What's in it (panels, inverter, battery size)" style={{ ...input, minHeight: 90 }} /></p>
            <p><label className="small muted">Photo of the quote<br /><PhotoInput name="quote" /></label></p>
            <button className="btn block">Send for comparison</button>
          </form>)}
      </div></section>
      <Footer />
    </>
  );
}
