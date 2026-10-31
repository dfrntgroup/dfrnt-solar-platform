import type { ReactNode } from "react";
import { Header, Footer } from "./Header";

/** Plain content page. Copy marked [placeholder] is waiting for Karl's final wording or legal review. */
export function Static({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return (
    <>
      <Header postcode="4551" />
      <section><div className="wrap" style={{ maxWidth: 720 }}><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{children}</div></section>
      <Footer />
    </>
  );
}
