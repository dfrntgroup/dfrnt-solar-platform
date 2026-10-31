import { Header, Footer } from "@/components/Header";
import { devAuth } from "@/lib/auth";
import { sendLink, devSignIn } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in", robots: { index: false } };

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string; sent?: string; error?: string }> }) {
  const sp = await searchParams;
  const input = { width: "100%", padding: 10, border: "1px solid var(--line)", borderRadius: 6, font: "inherit" } as const;
  return (
    <>
      <Header postcode="4551" />
      <section><div className="wrap" style={{ maxWidth: 420 }}>
        <h1 style={{ fontSize: 30 }}>Staff and installer sign-in</h1>
        {sp.sent ? <div className="ok">Check your email for a sign-in link. It works once and expires in an hour.</div> : (
          <form action={sendLink}>
            <input type="hidden" name="next" value={sp.next ?? "/ops"} />
            <p><input name="email" type="email" placeholder="you@company.com.au" style={input} required /></p>
            <button className="btn block" type="submit">Email me a sign-in link</button>
          </form>)}
        {sp.error && <div className="note" style={{ marginTop: 12 }}>{sp.error}</div>}
        {devAuth() && (
          <form action={devSignIn} style={{ marginTop: 24 }}>
            <p className="small muted">Local development only</p>
            <input type="hidden" name="next" value={sp.next ?? "/ops"} />
            <p><input name="email" defaultValue="karl@kgbcap.com.au" style={input} /></p>
            <button className="btn ghost block" type="submit">Dev sign-in</button>
          </form>)}
      </div></section>
      <Footer />
    </>
  );
}
