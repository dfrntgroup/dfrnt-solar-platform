"use client";
// G1/G3: first-touch attribution cookie, and (only on public pages) the Meta pixel, Google tag and Microsoft Clarity when set up.
// Never on system records (their link is private), staff or installer areas.
import { useEffect } from "react";
import { usePathname } from "next/navigation";

const PRIVATE = /^\/(ops|installer|quote|usage|login|auth|account|api|logout)/;

function rememberFirstTouch() {
  try {
    const u = new URL(location.href), p = u.searchParams;
    const has = (k: string) => p.get(k) ? { [k]: p.get(k)!.slice(0, 200) } : {};
    const now = document.cookie.split("; ").find((c) => c.startsWith("dfa="));
    let cur: Record<string, string> = {};
    if (now) try { cur = JSON.parse(decodeURIComponent(now.slice(4))); } catch { /* reset */ }
    const ids = { ...has("gclid"), ...has("fbclid"), ...has("wbraid"), ...has("gbraid") };
    const utm = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"].reduce((a, k) => ({ ...a, ...has(k) }), {});
    if (now && !Object.keys(ids).length && !Object.keys(utm).length) return;
    const next = now ? { ...cur, ...utm, ...ids, ...(Object.keys(ids).length ? { ts: String(Date.now()) } : {}) }
      : { landing: u.pathname, ref: document.referrer.slice(0, 200), ts: String(Date.now()), ...utm, ...ids };
    document.cookie = `dfa=${encodeURIComponent(JSON.stringify(next))}; path=/; max-age=${90 * 86400}; samesite=lax; secure`;
    if (ids.fbclid && !document.cookie.includes("_fbc=")) document.cookie = `_fbc=fb.1.${Date.now()}.${ids.fbclid}; path=/; max-age=${90 * 86400}; samesite=lax; secure`;
  } catch { /* ignore */ }
}

function inject(id: string, code: string) {
  if (document.getElementById(id)) return;
  const s = document.createElement("script"); s.id = id; s.text = code; document.head.appendChild(s);
}

export function Tags({ meta, google, clarity }: { meta?: string; google?: string; clarity?: string }) {
  const path = usePathname();
  useEffect(() => {
    if (PRIVATE.test(path)) return;
    rememberFirstTouch();
    const w = window as unknown as { fbq?: (...a: unknown[]) => void; gtag?: (...a: unknown[]) => void };
    if (meta) {
      inject("fb-pixel", `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${meta.replace(/\D/g, "")}');`);
      w.fbq?.("track", "PageView");
    }
    if (google) {
      if (!document.getElementById("gtag-src")) { const s = document.createElement("script"); s.id = "gtag-src"; s.async = true; s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(google)}`; document.head.appendChild(s); }
      inject("gtag-init", `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${google.replace(/[^\w-]/g, "")}');`);
      w.gtag?.("event", "page_view", { page_path: path });
    }
    if (clarity) inject("clarity", `(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y)})(window,document,"clarity","script","${clarity.replace(/\W/g, "")}");`);
  }, [path, meta, google, clarity]);
  return null;
}
