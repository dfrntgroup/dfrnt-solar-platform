import { Header, Footer } from "@/components/Header";
import { SystemCard } from "@/components/SystemCard";
import { earliestFor } from "@/lib/capacity";
import { priced, sitePostcode } from "@/lib/site";

export const dynamic = "force-dynamic";
export const metadata = { title: "Add a battery to your solar" };

export default async function Batteries({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const postcode = await sitePostcode(await searchParams);
  const earliest = await earliestFor(postcode, { kind: "battery_only", panelKw: 0 });
  const rows = (await priced(postcode, (s) => s.kind === "battery_only")).sort((a, b) => a.q.stack.amount_payable - b.q.stack.amount_payable);
  return (
    <>
      <Header postcode={postcode} back="/batteries" />
      <section><div className="wrap">
        <p className="eyebrow">Battery only · {postcode}</p>
        <h1>Add a battery to the solar you have.</h1>
        <p className="muted">Each comes with its own hybrid inverter, so it works with almost any existing solar. The Cheaper Home Batteries rebate is taken off the price. One battery rebate per home.</p>
        <div className="grid">{rows.map(({ s, q }) => <SystemCard key={s.slug} s={s} q={q} earliest={earliest} />)}</div>
      </div></section>
      <Footer />
    </>
  );
}
