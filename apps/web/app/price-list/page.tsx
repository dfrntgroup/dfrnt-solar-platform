import Link from "next/link";
import { Header, Footer } from "@/components/Header";
import { aud, priced, rebateDate, sitePostcode } from "@/lib/site";

export const dynamic = "force-dynamic";
export const metadata = { title: "Price list" };

export default async function PriceList({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const postcode = await sitePostcode(await searchParams);
  const rows = priced(postcode).sort((a, b) => a.s.kind.localeCompare(b.s.kind) || a.q.stack.amount_payable - b.q.stack.amount_payable);
  return (
    <>
      <Header postcode={postcode} back="/price-list" />
      <section><div className="wrap">
        <p className="eyebrow">Price list · {postcode} · rebates as at {rebateDate()}</p>
        <h1>Every price, in one place.</h1>
        <p className="muted">Installed prices including GST, for a standard single-storey install on a tin roof. Tile roofs, two storeys and switchboard work are priced from your photos before you pay.</p>
        <table className="lines">
          <tbody>
            <tr><td><strong>System</strong></td><td className="r"><strong>Before rebates</strong></td><td className="r"><strong>Rebates</strong></td><td className="r"><strong>You pay</strong></td></tr>
            {rows.map(({ s, q }) => (
              <tr key={s.slug}>
                <td><Link href={`/systems/${s.slug}`}>{s.brand} · {s.title}</Link></td>
                <td className="r">{aud(q.stack.price_inc_gst)}</td>
                <td className="r">−{aud(q.stack.less_stcs)}</td>
                <td className="r"><strong>{aud(q.stack.amount_payable)}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div></section>
      <Footer />
    </>
  );
}
