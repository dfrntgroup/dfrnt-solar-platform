"use client";
import { useState } from "react";

/** B5: send this price to a partner or family member. Uses the phone's share sheet, or copies the link. */
export function Share({ title, text, path, label = "Share this price" }: { title: string; text: string; path?: string; label?: string }) {
  const [done, setDone] = useState(false);
  const go = async () => {
    const url = path ? new URL(path, location.origin).toString() : location.href;
    try {
      if (navigator.share) await navigator.share({ title, text, url });
      else { await navigator.clipboard.writeText(url); setDone(true); setTimeout(() => setDone(false), 2500); }
    } catch { /* closed the share sheet */ }
  };
  return <button type="button" className="btn ghost sm" onClick={go}>{done ? "Link copied" : label}</button>;
}
