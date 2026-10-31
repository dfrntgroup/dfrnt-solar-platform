import Link from "next/link";
import type { ReactNode } from "react";

export function AdminShell({ who, area, children }: { who: string; area: "ops" | "installer"; children: ReactNode }) {
  const links = area === "ops"
    ? [["/ops", "Board"], ["/ops/approvals", "Approvals"], ["/ops/ledger", "Pay run"], ["/ops/messages", "Messages"], ["/ops/installers", "Installers"], ["/ops/content", "Content"], ["/ops/growth", "Referrals"], ["/ops/agents", "Agents"], ["/installer", "Installer view"]]
    : [["/installer", "My jobs"]];
  return (
    <>
      <header className="hdr"><div className="wrap">
        <Link href={area === "ops" ? "/ops" : "/installer"} className="logo">DFRNT <span>{area === "ops" ? "Ops" : "Installer"}</span></Link>
        <nav className="nav">{links.map(([h, t]) => <Link key={h} href={h!}>{t}</Link>)}</nav>
        <span className="small muted">{who} · <a href="/logout">Sign out</a></span>
      </div></header>
      <section><div className="wrap">{children}</div></section>
    </>
  );
}

export const input = { width: "100%", padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 6, font: "inherit" } as const;
