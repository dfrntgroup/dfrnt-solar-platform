"use client";
import { useEffect, useState } from "react";
/** Live "n of 4 done" as photos upload. */
export function PhotoCount({ initial }: { initial: string[] }) {
  const [have, setHave] = useState(new Set(initial));
  useEffect(() => {
    const on = (e: Event) => setHave((h) => new Set(h).add((e as CustomEvent<string>).detail));
    document.addEventListener("photo-uploaded", on);
    return () => document.removeEventListener("photo-uploaded", on);
  }, []);
  return <strong>{have.size} of 4 done.</strong>;
}
