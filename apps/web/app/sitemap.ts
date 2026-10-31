import { PAIRS } from "@/lib/brands";
import type { MetadataRoute } from "next";
import { db } from "@dfrnt/db";
import { pricingData } from "@/lib/pricing-data";

export const dynamic = "force-dynamic";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.SITE_URL ?? "https://dfrntsolar.com.au";
  const fixed = ["", "/rebates", "/beat-my-quote", "/reviews", "/installs", ...PAIRS.map((x) => `/compare/${x}`), "/systems", "/batteries", "/estimate", "/price-list", "/price-index", "/compare", "/learn", "/how-it-works", "/about", "/warranty", "/refer", "/creators", "/contact", "/installers/apply", "/brands/solax", "/brands/sungrow", "/brands/goodwe"];
  const systems = (await pricingData()).catalogue.systems.map((s) => `/systems/${s.slug}`);
  let articles: string[] = [];
  try { articles = (await db()`select slug from content_items where status = 'published'`).map((r) => `/learn/${r.slug}`); } catch { /* first build */ }
  return [...fixed, ...systems, ...articles].map((p) => ({ url: `${base}${p}`, changeFrequency: "weekly" }));
}
