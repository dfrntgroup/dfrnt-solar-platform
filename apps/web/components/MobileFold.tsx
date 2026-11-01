"use client";
import { useEffect } from "react";

/** Phone tidy-ups for Ops: fold long sections, open the menu from the bottom bar, close it after navigating. */
export function MobileFold() {
  useEffect(() => {
    const phone = window.matchMedia("(max-width: 899px)").matches;
    if (phone) document.querySelectorAll<HTMLDetailsElement>("details.msec").forEach((d) => d.removeAttribute("open"));
    const menu = document.getElementById("omenu") as HTMLDetailsElement | null;
    const btn = document.querySelector<HTMLAnchorElement>("a.obar-menu");
    const open = (e: Event) => { e.preventDefault(); if (menu) { menu.open = true; window.scrollTo({ top: 0 }); } };
    btn?.addEventListener("click", open);
    const close = () => { if (menu) menu.open = false; };
    menu?.querySelectorAll("a").forEach((a) => a.addEventListener("click", close));
    return () => { btn?.removeEventListener("click", open); };
  }, []);
  return null;
}
