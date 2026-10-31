import { Header, Footer } from "@/components/Header";
import { sitePostcode } from "@/lib/site";
import { contactUs } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Talk to us" };

export default async function Contact({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const postcode = await sitePostcode(sp);
  const input = { width: "100%", padding: 10, border: "1px solid var(--line)", borderRadius: 6, font: "inherit" } as const;
  return (
    <>
      <Header postcode={postcode} back="/contact" />
      <section><div className="wrap" style={{ maxWidth: 560 }}>
        <p className="eyebrow">Talk to us</p><h1>Ask us anything, or book a call.</h1>
        {sp.sent ? <div className="ok">Thanks — a real person will get back to you within one business day.</div> : (
          <form action={contactUs}>
            <input type="hidden" name="quote" value={sp.quote ?? ""} />
            <p><select name="kind" style={input} defaultValue={sp.kind ?? "question"}><option value="question">A question</option><option value="callback">Please call me</option><option value="fault">Something isn&apos;t working</option><option value="complaint">A complaint</option></select></p>
            <p><input name="name" placeholder="Name" style={input} required /></p>
            <p><input name="email" type="email" placeholder="Email" style={input} required /></p>
            <p><input name="phone" placeholder="Mobile (for a call back)" style={input} /></p>
            <p><textarea name="body" placeholder="How can we help?" style={{ ...input, minHeight: 120 }} required /></p>
            <p style={{ position: "absolute", left: -9999 }} aria-hidden><input name="website" tabIndex={-1} autoComplete="off" /></p>
            <button className="btn block" type="submit">Send</button>
          </form>)}
      </div></section>
      <Footer />
    </>
  );
}
