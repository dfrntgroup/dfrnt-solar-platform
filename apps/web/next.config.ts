// Deployed 2 Nov 2026: CRON_SECRET set.
import type { NextConfig } from "next";

const security = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=(self)" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Content-Security-Policy", value: "default-src 'self'; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' https://connect.facebook.net https://www.googletagmanager.com https://*.clarity.ms https://www.clarity.ms; connect-src 'self' https://*.supabase.co https://www.facebook.com https://connect.facebook.net https://*.clarity.ms https://www.google-analytics.com https://*.google-analytics.com https://www.googletagmanager.com https://*.doubleclick.net https://www.google.com https://www.google.com.au; frame-src https://www.googletagmanager.com https://td.doubleclick.net https://www.facebook.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://*.fiskil.com" },
];

const config: NextConfig = {
  transpilePackages: ["@dfrnt/engine", "@dfrnt/db"],
  experimental: { serverActions: { bodySizeLimit: "40mb" } },
  async headers() { return [{ source: "/:path*", headers: security }]; },
};
export default config;
