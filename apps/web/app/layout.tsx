import type { ReactNode } from "react";
import "./globals.css";
import { Analytics } from "@/components/Analytics";
export const metadata = { title: { default: "DFRNT Solar — solar and batteries, one installed price", template: "%s · DFRNT Solar" }, description: "Fixed installed prices for solar and batteries in South East Queensland. Rebates taken off for you.", metadataBase: new URL(process.env.SITE_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000")), openGraph: { siteName: "DFRNT Solar", locale: "en_AU", type: "website", images: ["/img/hero-home.webp"] } };
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en-AU"><body>{children}<Analytics /></body></html>;
}
