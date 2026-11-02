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
        <div className="tscroll"><table className="lines index"><thead>
          <tr><th>System</th><th className="r">You pay</th><th className="r">Per battery kWh<span className="small muted">whole price ÷ kWh</span></th><th className="r">Per solar kW<span className="small muted">whole price ÷ kW</span></th></tr></thead><tbody>
          {rows.map(({ s, q }) => <tr key={s.slug}><td><strong>{s.brand}</strong><br /><span className="small">{s.title}</span></td><td className="r">{aud(q.stack.amount_payable)}</td>
            <td className="r">{aud(q.stack.amount_payable / q.config.usable_kwh)}</td><td className="r">{q.config.panel_kw ? aud(q.stack.amount_payable / q.config.panel_kw) : "—"}</td></tr>)}
        </tbody></table></div>
      </div></section>
      <Footer />
    </>
  );
}
