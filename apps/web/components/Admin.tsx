import Link from "next/link";
import type { ReactNode } from "react";

export function AdminShell({ who, area, children }: { who: string; area: "ops" | "installer"; children: ReactNode }) {
  const links = area === "ops"
    ? [["/ops", "Board"], ["/ops/pricing", "Pricing"], ["/ops/approvals", "Approvals"], ["/ops/ledger", "Pay run"], ["/ops/purchasing", "POs"], ["/ops/stc", "STCs"], ["/ops/support", "Support"], ["/ops/credits", "Credits"], ["/ops/messages", "Messages"], ["/ops/installers", "Installers"], ["/ops/content", "Content"], ["/ops/growth", "Referrals"], ["/ops/agents", "Agents"], ["/installer", "Installer view"]]
    : [["/installer", "My jobs"], ["/installer/profile", "Profile"]];
  return (
    <>
      <header className="hdr"><div className="wrap" style={{ height: "auto", minHeight: 62, padding: "8px 20px" }}>
        <Link href={area === "ops" ? "/ops" : "/installer"} className="logo">DFRNT <span>{area === "ops" ? "Ops" : "Installer"}</span></Link>
        <nav style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", flex: 1, fontSize: 14 }}>{links.map(([h, t]) => <Link key={h} href={h!}>{t}</Link>)}</nav>
        <span className="small muted">{who} · <a href="/logout">Sign out</a></span>
      </div></header>
      <section><div className="wrap">{children}</div></section>
    </>
  );
}

export const input = { width: "100%", padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 6, font: "inherit" } as const;
