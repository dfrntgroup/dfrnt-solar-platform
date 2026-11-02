import { Header, Footer } from "@/components/Header";
import { aud, priced, rebateDate, sitePostcode } from "@/lib/site";

export const dynamic = "force-dynamic";
export const metadata = { title: "Price Index", description: "What solar and home batteries actually cost installed in South East Queensland, updated from our live prices." };

export default async function PriceIndex({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const postcode = await sitePostcode(await searchParams);
  const rows = (await priced(postcode)).filter(({ q }) => q.config.usable_kwh > 0).sort((a, b) => a.q.stack.amount_payable / a.q.config.usable_kwh - b.q.stack.amount_payable / b.q.config.usable_kwh);
  return (
    <>
      <Header postcode={postcode} back="/price-index" />
      <section><div className="wrap">
        <p className="eyebrow">Price Index · {postcode} · {rebateDate()}</p>
        <h1>What solar and batteries really cost.</h1>
        <p className="muted">Installed prices after rebates, worked out the same way for every system. Updated whenever our prices change.</p>
        <table className="lines"><tbody>
          <tr><td><strong>System</strong></td><td className="r"><strong>You pay</strong></td><td className="r"><strong>Whole price ÷ battery kWh</strong></td><td className="r"><strong>Whole price ÷ solar kW</strong></td></tr>
          {rows.map(({ s, q }) => <tr key={s.slug}><td>{s.brand} · {s.title}</td><td className="r">{aud(q.stack.amount_payable)}</td>
            <td className="r">{aud(q.stack.amount_payable / q.config.usable_kwh)}</td><td className="r">{q.config.panel_kw ? aud(q.stack.amount_payable / q.config.panel_kw) : "—"}</td></tr>)}
        </tbody></table>
      </div></section>
      <Footer />
    </>
  );
}
