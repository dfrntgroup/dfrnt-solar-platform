import { PAIRS } from "@/lib/brands";
import type { MetadataRoute } from "next";
import { db } from "@dfrnt/db";
import { pricingData } from "@/lib/pricing-data";

export const dynamic = "force-dynamic";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.SITE_URL ?? "https://dfrntsolar.com.au";
  const fixed = ["", "/rebates", "/beat-my-quote", ...PAIRS.map((x) => `/compare/${x}`), "/systems", "/batteries", "/estimate", "/price-list", "/price-index", "/learn", "/how-it-works", "/about", "/warranty", "/refer", "/creators", "/contact", "/installers/apply", "/brands/solax", "/brands/sungrow", "/brands/goodwe"];
  const systems = (await pricingData()).catalogue.systems.map((s) => `/systems/${s.slug}`);
  let articles: string[] = [];
  try { articles = (await db()`select slug from content_items where status = 'published'`).map((r) => `/learn/${r.slug}`); } catch { /* first build */ }
  let subs: string[] = [];
  try { const { suburbs } = await import("@/lib/suburbs"); subs = (await suburbs()).map((x) => `/solar/${x.slug}`); } catch { /* none yet */ }
  try {
    const [r] = await db()`select (select count(*)::int from reviews v join installers i on i.id = v.installer_id where v.status = 'published' and not i.is_test) reviews,
      (select count(*)::int from quotes q join installers i on i.id = q.installer_id where q.showcase_consent and not i.is_test and q.status in ('installed','lodged','settled','complete')) installs`;
    if ((r?.reviews as number) > 0) fixed.push("/reviews");
    if ((r?.installs as number) > 0) fixed.push("/installs");
  } catch { /* first build */ }
  return [...fixed, ...systems, ...articles, ...subs].map((p) => ({ url: `${base}${p}`, changeFrequency: "weekly" }));
}
