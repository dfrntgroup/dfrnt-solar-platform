// Google Merchant Center product feed. Price is the installed price after rebates, the same figure the landing page leads with.
import { priceSystem } from "@dfrnt/engine";
import { todayAEST } from "@/lib/api";
import { pricingData } from "@/lib/pricing-data";

export const dynamic = "force-dynamic";
const x = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function GET() {
  const base = process.env.SITE_URL ?? "https://dfrntsolar.com.au";
  const data = await pricingData();
  const items = data.catalogue.systems.map((s) => {
    const q = priceSystem(s, { postcode: "4000", asOf: todayAEST() }, data);
    return `<item><g:id>${x(s.slug)}</g:id><title>${x(`${s.brand} ${s.title}, installed`)}</title>
<description>${x(`${q.config.summary}. Fixed installed price in South East Queensland after the government rebate. Includes installation.`)}</description>
<link>${base}/systems/${s.slug}</link><g:price>${q.stack.amount_payable.toFixed(2)} AUD</g:price><g:availability>in_stock</g:availability>
<g:condition>new</g:condition><g:brand>${x(s.brand)}</g:brand><g:product_type>Solar and battery systems</g:product_type><g:identifier_exists>no</g:identifier_exists></item>`;
  }).join("\n");
  return new Response(`<?xml version="1.0"?><rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel><title>DFRNT Solar</title><link>${base}</link><description>Installed solar and battery systems</description>\n${items}\n</channel></rss>`,
    { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
