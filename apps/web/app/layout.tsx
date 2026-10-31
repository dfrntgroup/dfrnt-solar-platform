import type { ReactNode } from "react";
export const metadata = { title: "DFRNT Solar", description: "Solar and batteries, one fixed installed price." };
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-AU">
      <body style={{ margin: 0, fontFamily: "Arial, sans-serif", color: "#172426", background: "#fff" }}>{children}</body>
    </html>
  );
}
