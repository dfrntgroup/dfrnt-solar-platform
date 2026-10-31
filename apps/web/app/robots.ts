import type { MetadataRoute } from "next";
export default function robots(): MetadataRoute.Robots {
  const base = process.env.SITE_URL ?? "https://dfrntsolar.com.au";
  return { rules: [{ userAgent: "*", allow: "/", disallow: ["/ops", "/installer", "/quote", "/api", "/login", "/auth"] }], sitemap: `${base}/sitemap.xml` };
}
