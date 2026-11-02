import type { NextConfig } from "next";

const security = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=(self)" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Content-Security-Policy", value: "default-src 'self'; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' https://js.stripe.com https://connect.facebook.net https://www.googletagmanager.com https://*.clarity.ms https://www.clarity.ms; connect-src 'self' https://api.stripe.com https://*.stripe.com https://*.supabase.co https://www.facebook.com https://connect.facebook.net https://*.clarity.ms https://www.google-analytics.com https://*.google-analytics.com https://www.googletagmanager.com https://*.doubleclick.net https://www.google.com https://www.google.com.au; frame-src https://js.stripe.com https://hooks.stripe.com https://*.stripe.com https://pay.google.com https://www.googletagmanager.com https://td.doubleclick.net https://www.facebook.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://*.fiskil.com https://*.stripe.com" },
];

const config: NextConfig = {
  transpilePackages: ["@dfrnt/engine", "@dfrnt/db"],
  experimental: { serverActions: { bodySizeLimit: "40mb" } },
  async headers() { return [{ source: "/:path*", headers: security }]; },
  // GoodWe default module moved to the 9.0 kWh Lynx D G2 (3 Nov 2026): old system links keep working.
  async redirects() {
    return [["goodwe-10kw-16kwh", "goodwe-10kw-18kwh"], ["goodwe-10kw-32kwh", "goodwe-10kw-35kwh"], ["goodwe-3p-14kw-24kwh", "goodwe-3p-14kw-27kwh"], ["goodwe-battery-16kwh", "goodwe-battery-18kwh"]]
      .map(([a, b]) => ({ source: `/systems/${a}`, destination: `/systems/${b}`, permanent: true }));
  },
};
export default config;
