import type { ReactNode } from "react";
import "@fontsource-variable/inter";
import "@fontsource/caveat/700.css";
import "./globals.css";
import { Analytics } from "@/components/Analytics";
import { Tags } from "@/components/Tags";
export const metadata = { title: { default: "DFRNT Solar — solar and batteries, one installed price", template: "%s · DFRNT Solar" }, description: "Fixed installed prices for solar and batteries in South East Queensland. Rebates taken off for you.", metadataBase: new URL(process.env.SITE_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000")), openGraph: { siteName: "DFRNT Solar", locale: "en_AU", type: "website", images: ["/img/hero-home.webp"] } };
const SITE = process.env.SITE_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");
const ORG = { "@context": "https://schema.org", "@type": "Organization", name: "DFRNT Solar", legalName: "DFRNT Group Pty Ltd", url: SITE, logo: `${SITE}/img/logo.png`, telephone: "+61 1300 133 768",
  taxID: "21 679 198 317", areaServed: "South East Queensland", address: { "@type": "PostalAddress", addressRegion: "QLD", addressCountry: "AU" } };
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en-AU"><body><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ORG) }} />{children}<Analytics /><Tags meta={process.env.NEXT_PUBLIC_META_PIXEL_ID} google={process.env.NEXT_PUBLIC_GOOGLE_ADS_ID} clarity={process.env.NEXT_PUBLIC_CLARITY_ID} /></body></html>;
}
