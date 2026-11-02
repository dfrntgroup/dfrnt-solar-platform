import Link from "next/link";
import type { ReactNode } from "react";

import { db } from "@dfrnt/db";
import { MobileFold } from "./MobileFold";

type L = [string, string];
/** Ops pages in four groups (phone menu). Desktop shows the flat list as before. */
export const OPS_GROUPS: [string, L[]][] = [
  ["Today", [["/ops", "Board"], ["/ops/approvals", "Approvals"], ["/ops/callbacks", "Call-backs"], ["/ops/support", "Support"], ["/ops/desk", "Booking desk"]]],
  ["Money", [["/ops/pricing", "Pricing"], ["/ops/ledger", "Pay run"], ["/ops/purchasing", "POs"], ["/ops/payments", "Payments"], ["/ops/stc", "STCs"], ["/ops/credits", "Credits"], ["/ops/xero", "Xero"]]],
  ["Customers and growth", [["/ops/analytics", "Analytics"], ["/ops/campaigns", "Campaigns"], ["/ops/reviews", "Reviews"], ["/ops/growth", "Referrals"], ["/ops/content", "Content"], ["/ops/energy", "Real usage"]]],
  ["Setup", [["/ops/products", "Products"], ["/ops/addons", "Add-ons"], ["/ops/service", "Service plan"], ["/ops/installers", "Installers"], ["/ops/capacity", "Capacity"], ["/ops/messages", "Messages"], ["/ops/agents", "Agents"], ["/ops/settings", "Settings"], ["/installer", "Installer view"]]],
];
const OPS_FLAT: L[] = [["/ops", "Board"], ["/ops/analytics", "Analytics"], ["/ops/pricing", "Pricing"], ["/ops/approvals", "Approvals"], ["/ops/ledger", "Pay run"], ["/ops/payments", "Payments"], ["/ops/purchasing", "POs"], ["/ops/stc", "STCs"], ["/ops/products", "Products"], ["/ops/addons", "Add-ons"], ["/ops/service", "Service plan"], ["/ops/desk", "Booking desk"], ["/ops/capacity", "Capacity"], ["/ops/callbacks", "Call-backs"], ["/ops/support", "Support"], ["/ops/credits", "Credits"], ["/ops/xero", "Xero"], ["/ops/energy", "Real usage"], ["/ops/messages", "Messages"], ["/ops/campaigns", "Campaigns"], ["/ops/installers", "Installers"], ["/ops/content", "Content"], ["/ops/reviews", "Reviews"], ["/ops/growth", "Referrals"], ["/ops/agents", "Agents"], ["/ops/settings", "Settings"], ["/installer", "Installer view"]];
const INSTALLER: L[] = [["/installer", "My jobs"], ["/installer/calendar", "Calendar"], ["/installer/profile", "Profile"]];

async function counts() {
  try {
    const [r] = await db()`select (select count(*)::int from approvals where status = 'pending') approvals,
      (select count(*)::int from tickets where status = 'open') support`;
    return { approvals: (r?.approvals as number) ?? 0, support: (r?.support as number) ?? 0 };
  } catch { return { approvals: 0, support: 0 }; }
}
const Badge = ({ n }: { n: number }) => n > 0 ? <span className="obadge">{n > 99 ? "99+" : n}</span> : null;

export async function AdminShell({ who, area, children }: { who: string; area: "ops" | "installer"; children: ReactNode }) {
  const ops = area === "ops";
  const links = ops ? OPS_FLAT : INSTALLER;
  const c = ops ? await counts() : { approvals: 0, support: 0 };
  const groups: [string, L[]][] = ops ? OPS_GROUPS : [["Installer", INSTALLER]];
  const bar: [string, string, string, number][] = ops
    ? [["/ops", "▦", "Board", 0], ["/ops/approvals", "✓", "Approvals", c.approvals], ["/ops/support", "✉", "Support", c.support]]
    : [["/installer", "▦", "My jobs", 0], ["/installer/calendar", "▤", "Calendar", 0], ["/installer/profile", "◉", "Profile", 0]];
  return (
    <>
      <header className="hdr admin"><div className="wrap">
        <Link href={ops ? "/ops" : "/installer"} className="logo">DFRNT <span>{ops ? "Ops" : "Installer"}</span></Link>
        <nav className="adesk">{links.map(([h, t]) => <Link key={h} href={h}>{t}</Link>)}</nav>
        <span className="small muted who adesk">{who} · {ops && <><a href="/account/security">Security</a> · </>}<a href="/logout">Sign out</a></span>
        <details className="omenu" id="omenu">
          <summary>☰ Menu</summary>
          <div className="omenu-panel">
            {ops && <form action="/ops/find" className="ofind"><input name="q" placeholder="Find a page or a customer…" aria-label="Find a page or a customer" /></form>}
            {groups.map(([g, ls]) => <div key={g}><h4>{g}</h4>{ls.map(([h, t]) => <Link key={h} href={h}>{t}</Link>)}</div>)}
            <div><h4>{who}</h4>{ops && <a href="/account/security">Security</a>}<a href="/logout">Sign out</a></div>
          </div>
        </details>
      </div></header>
      <section className="abody"><div className="wrap">{children}</div></section>
      <nav className="obar" aria-label="Quick links">
        {bar.map(([h, i, t, n]) => <Link key={h} href={h}><i aria-hidden>{i}</i><span>{t}</span><Badge n={n} /></Link>)}
        <a href="#omenu" className="obar-menu"><i aria-hidden>☰</i><span>Menu</span></a>
      </nav>
      <MobileFold />
    </>
  );
}

export const input = { width: "100%", padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 6, font: "inherit" } as const;
