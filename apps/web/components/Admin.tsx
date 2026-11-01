import Link from "next/link";
import type { ReactNode } from "react";

export function AdminShell({ who, area, children }: { who: string; area: "ops" | "installer"; children: ReactNode }) {
  const links = area === "ops"
    ? [["/ops", "Board"], ["/ops/analytics", "Analytics"], ["/ops/pricing", "Pricing"], ["/ops/approvals", "Approvals"], ["/ops/ledger", "Pay run"], ["/ops/purchasing", "POs"], ["/ops/stc", "STCs"], ["/ops/products", "Products"], ["/ops/addons", "Add-ons"], ["/ops/service", "Service plan"], ["/ops/desk", "Booking desk"], ["/ops/capacity", "Capacity"], ["/ops/callbacks", "Call-backs"], ["/ops/support", "Support"], ["/ops/credits", "Credits"], ["/ops/xero", "Xero"], ["/ops/energy", "Real usage"], ["/ops/messages", "Messages"], ["/ops/campaigns", "Campaigns"], ["/ops/installers", "Installers"], ["/ops/content", "Content"], ["/ops/reviews", "Reviews"], ["/ops/growth", "Referrals"], ["/ops/agents", "Agents"], ["/ops/settings", "Settings"], ["/installer", "Installer view"]]
    : [["/installer", "My jobs"], ["/installer/calendar", "Calendar"], ["/installer/profile", "Profile"]];
  return (
    <>
      <header className="hdr admin"><div className="wrap">
        <Link href={area === "ops" ? "/ops" : "/installer"} className="logo">DFRNT <span>{area === "ops" ? "Ops" : "Installer"}</span></Link>
        <nav>{links.map(([h, t]) => <Link key={h} href={h!}>{t}</Link>)}</nav>
        <span className="small muted who">{who} · {area === "ops" && <><a href="/account/security">Security</a> · </>}<a href="/logout">Sign out</a></span>
      </div></header>
      <section><div className="wrap">{children}</div></section>
    </>
  );
}

export const input = { width: "100%", padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 6, font: "inherit" } as const;
