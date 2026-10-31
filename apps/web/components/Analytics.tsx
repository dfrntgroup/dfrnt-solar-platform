"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** First-party page views and named events. No cookies, no third parties. */
export function track(name: string, props: Record<string, unknown> = {}) {
  try {
    let sid = sessionStorage.getItem("sid");
    if (!sid) { sid = Math.random().toString(36).slice(2); sessionStorage.setItem("sid", sid); }
    navigator.sendBeacon?.("/api/v1/events", JSON.stringify({ name, path: location.pathname, props, session: sid }));
  } catch { /* ignore */ }
}

export function Analytics() {
  const path = usePathname();
  useEffect(() => { if (!/^\/(ops|installer|login|auth)/.test(path)) track("page_view"); }, [path]);
  return null;
}
