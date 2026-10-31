// Minimal, safe markdown: headings, paragraphs, lists, bold. Everything is escaped first.
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const inline = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
export function renderMarkdown(md: string) {
  const out: string[] = [];
  let list = false;
  for (const raw of md.split(/\n/)) {
    const line = raw.trimEnd();
    if (/^[-*] /.test(line)) { if (!list) { out.push("<ul>"); list = true; } out.push(`<li>${inline(line.slice(2))}</li>`); continue; }
    if (list) { out.push("</ul>"); list = false; }
    if (!line.trim()) continue;
    const h = /^(#{1,3}) (.*)$/.exec(line);
    out.push(h ? `<h${h[1]!.length + 1}>${inline(h[2]!)}</h${h[1]!.length + 1}>` : `<p>${inline(line)}</p>`);
  }
  if (list) out.push("</ul>");
  return out.join("\n");
}
