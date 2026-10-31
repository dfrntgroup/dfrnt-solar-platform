import type { ReactNode } from "react";
import "./globals.css";
export const metadata = { title: { default: "DFRNT Solar — solar and batteries, one installed price", template: "%s · DFRNT Solar" }, description: "Fixed installed prices for solar and batteries in South East Queensland. Rebates taken off for you." };
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en-AU"><body>{children}</body></html>;
}
