import Link from "next/link";
import { Static } from "@/components/Static";
import { SELLER } from "@/lib/legal";
import { pricingData } from "@/lib/pricing-data";
import { todayAEST } from "@/lib/api";
import { longDate } from "@/lib/site";

export const dynamic = "force-dynamic";
export const metadata = { title: "Questions", description: "Straight answers about DFRNT Solar: the price, rebates, installers, paying, cancelling, warranties, export limits and sizing.", alternates: { canonical: "/faq" } };

// Launch copy (3 Nov 2026). Every answer matches the agreement in lib/legal.ts and how the platform behaves.
async function faqs(): Promise<[string, string][]> {
  const r = (await pricingData()).rebates;
  const next = [...r.battery_factor].sort((a, b) => a.from.localeCompare(b.from)).find((x) => x.from > todayAEST());
  return [
    ["Is the price really the price? What could change it?",
      "Yes. The price on the website is the installed price for your postcode, including GST, with the rebate already taken off. It assumes a standard install: single storey, tin roof, a switchboard with space, and the battery within 5 metres of it. If your photos show anything else, your installer prices it before you pay and you approve it first. After you sign, the price only changes if you approve a change or ask to move your install past the rebate date. We never raise it because our own costs go up."],
    ["How do the rebates work, and what happens when they change?",
      `The rebate is the value of the certificates (STCs) your system creates under the Small-scale Renewable Energy Scheme, including the Cheaper Home Batteries Program. We take it off your price up front at a fixed rate, and you assign the certificates to us. The amount depends on your install date.${next ? ` The battery rebate next steps down on ${longDate(next.from)}.` : ""} A secured price is held for 14 days, or to the end of the current rebate step if that comes first, and we only offer install dates inside it. Only one battery rebate can be claimed per address.`],
    ["Why don't you send a salesperson?",
      "Because you don't need one. Every price is published, your home is checked from four photos, and a licensed installer confirms the price before you pay. No sales visit, no price on the night, no pressure to sign. If you'd like to talk it through, a real person will ring you when you ask."],
    ["Who installs it, and are they licensed?",
      "A licensed electrical contractor accredited with Solar Accreditation Australia, working as our subcontractor. You see their name, licence and accreditation before you pay. We stay responsible to you for their work as if we had done it ourselves."],
    ["What if my roof or switchboard is complicated?",
      "Send the photos anyway. Your installer looks at them and prices anything extra, such as a switchboard upgrade, a second storey or a long cable run, line by line. You approve it before you pay. If the work can't be done safely or to standard, we tell you and you pay nothing."],
    ["When can you install, and who picks the day?",
      "You do, from your installer's real free days. The system never makes up a date. You pick your day after you pay, and every date we offer is inside your rebate window. If a date has to move for weather, safety or supply, we offer you the next free days."],
    ["How do I pay, and is my money safe?",
      `One payment for everything: card, Apple Pay, Google Pay, PayTo or bank transfer. Paying from your bank saves about 1%. You pay ${SELLER.name}, never an installer. We will never email you new bank details. If anyone asks you to pay a different account, don't pay, and call us on ${SELLER.phone}.`],
    ["Can I change my mind?",
      "Yes. Cancel for any reason within 10 business days of signing and we refund everything. After that you can still cancel before installation, and we refund what you've paid less costs we've actually incurred and can't recover, which we show you with evidence. If we cancel, you get everything back."],
    ["What warranties do I get, and who do I call later on?",
      "Panels carry the manufacturer's product warranty plus a 30-year performance warranty; the inverter and battery 10 years each; and our workmanship 10 years. Call us first, whatever it is. Your System Record keeps your serial numbers, certificates, warranty cards and photos on one page for life."],
    ["Will my distributor let me export? Do I need three-phase?",
      "We apply to your distributor for you. They decide whether your system can connect and how much it may export. If they set a limit that changes what you're buying, we tell you before any work starts, and you can go ahead or cancel with a full refund. Single-phase and three-phase homes are both covered; your switchboard photo tells us which you have."],
    ["Do I have to join a virtual power plant?",
      "No. It's never required to buy from us, and your battery works on its own. If an energy retailer offers you one, check what it pays and how much of your battery it uses. Ask us and we'll tell you whether your battery is compatible."],
    ["How big a system do I need?",
      "Use Find my system: enter your postcode and your last quarterly bill, and we show the three systems that fit best, with prices. Many homes use 8 to 12 kWh between dinner and breakfast, which is a good guide to battery size. Not sure? Ask for a call and we'll size it with you."],
  ];
}

export default async function Page() {
  const list = await faqs();
  const ld = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: list.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) };
  return (
    <Static eyebrow="Questions" title="Straight answers, before you ask.">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      {list.map(([q, a], i) => <details key={q} className="card" style={{ marginTop: 10 }} open={i === 0}><summary><strong>{q}</strong></summary><p style={{ margin: "10px 0 0" }}>{a}</p></details>)}
      <p style={{ marginTop: 22 }}><Link className="btn" href="/estimate">Find my system</Link> <Link className="btn ghost" href="/contact?kind=callback">Ask a person</Link></p>
    </Static>
  );
}
