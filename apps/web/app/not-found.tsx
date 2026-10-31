import Link from "next/link";
import { Header, Footer } from "@/components/Header";

export default function NotFound() {
  return (
    <>
      <Header postcode="4551" />
      <section><div className="wrap" style={{ maxWidth: 640 }}>
        <p className="eyebrow">404</p>
        <h1>That page isn&apos;t here.</h1>
        <p className="lead">It may have moved, or the link was mistyped. Every price is still one tap away.</p>
        <p><Link className="btn" href="/systems">See all systems</Link> <Link className="btn ghost" href="/contact">Talk to us</Link></p>
      </div></section>
      <Footer />
    </>
  );
}
