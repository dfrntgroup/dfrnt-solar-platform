import Link from "next/link";
import { rebateWindow, yieldFor } from "@dfrnt/engine";
import { Header, Footer } from "@/components/Header";
import { Builder } from "@/components/Builder";
import { secureBuild } from "@/app/actions";
import { buildOptions, choiceFromQuery } from "@/lib/builder";
import { pricingData } from "@/lib/pricing-data";
import { energySettings } from "@/lib/energy";
import { earliestFor } from "@/lib/capacity";
import { todayAEST } from "@/lib/api";
import { sitePostcode } from "@/lib/site";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Build your own solar and battery system",
  description: "Pick the brand, inverter, battery and panels. The price, rebate and parts list update as you go. Installed in South East Queensland at a fixed price.",
  alternates: { canonical: "/build" },
};

export default async function Build({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const postcode = await sitePostcode(sp);
  const data = await pricingData();
  const { siteFor } = await import("@/lib/rebate-from");
  const site = await siteFor(postcode);
  const w = rebateWindow(todayAEST(), data.rebates, site.rebateFrom);
  const o = buildOptions(choiceFromQuery(sp), postcode, w.rebate_date, data, site);
  const served = (await earliestFor(postcode)) !== null;
  const loc = yieldFor(postcode, (await energySettings()).yields);
  return (
    <>
      <Header postcode={postcode} back="/build" />
      <section style={{ paddingTop: 24 }}><div className="wrap">
        <p className="small"><Link href="/systems" className="muted">← All systems</Link></p>
        <p className="eyebrow">Build your own</p>
        <h1 style={{ fontSize: "clamp(30px, 6vw, 44px)" }}>Pick each part. See the price as you go.</h1>
        <p className="muted" style={{ maxWidth: 640 }}>For people who know what they want. Choose the brand, inverter, battery and panels; the price, rebate and parts list follow. Same price rules and checkout as every system on the site, and your installer still confirms it fits from your photos before you pay. Not sure what you need? <Link href="/estimate">Find my system</Link>.</p>
        <Builder postcode={postcode} served={served} changed={sp.changed === "1"} secure={secureBuild}
          initial={{ ...o, dayKwhPerKw: loc.kwh_per_kw, lockUntil: w.lock_until }} />
      </div></section>
      <Footer />
    </>
  );
}
