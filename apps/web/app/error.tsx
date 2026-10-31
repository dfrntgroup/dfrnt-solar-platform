"use client";
import Link from "next/link";

/** Shown if a page fails. Keeps the customer moving and gives them a person to call. */
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <section><div className="wrap" style={{ maxWidth: 640 }}>
      <p className="eyebrow">Something went wrong</p>
      <h1>That didn&apos;t load properly.</h1>
      <p className="lead">Nothing you entered is lost. Try again, or call us on 1300 133 768 and a real person will help.</p>
      <p><button className="btn" onClick={() => reset()}>Try again</button> <Link className="btn ghost" href="/">Home</Link></p>
    </div></section>
  );
}
