import type { Section } from "@/lib/legal";
import { DRAFT } from "@/lib/legal";

/** Renders a legal document from sections. Shows a draft banner until legal review is done. */
export function LegalText({ sections, compact = false }: { sections: Section[]; compact?: boolean }) {
  return (
    <div className={compact ? "legal compact" : "legal"}>
      {DRAFT && <p className="note small">Draft wording awaiting legal review.</p>}
      {sections.map((s) => (
        <div key={s.h}>
          <h3>{s.h}</h3>
          {s.p.map((t, i) => <p key={i}>{t}</p>)}
        </div>
      ))}
    </div>
  );
}
