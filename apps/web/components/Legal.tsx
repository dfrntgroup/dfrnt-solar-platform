import type { Section } from "@/lib/legal";
import { DRAFT } from "@/lib/legal";

/** Renders a legal document from sections. Shows a draft banner until legal review is done. */
export async function LegalText({ sections, compact = false }: { sections: Section[]; compact?: boolean }) {
  // The draft note is for the team, never the customer: staff see it on every copy until legal review lands.
  const staff = DRAFT ? await (await import("@/lib/auth")).currentStaff().catch(() => null) : null;
  return (
    <div className={compact ? "legal compact" : "legal"}>
      {DRAFT && staff && <p className="note small">Staff only: draft wording awaiting legal review (customers don&apos;t see this note).</p>}
      {sections.map((s) => (
        <div key={s.h}>
          <h3>{s.h}</h3>
          {s.p.map((t, i) => <p key={i}>{t}</p>)}
        </div>
      ))}
    </div>
  );
}
