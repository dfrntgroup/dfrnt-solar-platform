import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { Quote, SiteAnswers } from "@dfrnt/engine";
import { AGREEMENT, SELLER, DRAFT, type Section } from "./legal";
import { friendlySummary } from "./images";

const TEAL = rgb(0, 0.557, 0.537), INK = rgb(0.09, 0.14, 0.15), MUTED = rgb(0.38, 0.45, 0.45);
/** Standard PDF fonts only cover Latin-1; swap the few characters we use that fall outside it. */
const clean = (s: string) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/×/g, "x").replace(/…/g, "...").replace(/[^\x00-\xFF]/g, "");
const money = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const date = (d: Date | string) => new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: "Australia/Brisbane" });

/** A tiny flowing-text writer: wraps, paginates, keeps a consistent margin. */
class Writer {
  page!: PDFPage; y = 0;
  constructor(public doc: PDFDocument, public font: PDFFont, public bold: PDFFont, public footer: string) { this.newPage(); }
  newPage() {
    this.page = this.doc.addPage([595.28, 841.89]); this.y = 790;
    this.page.drawText(clean(this.footer), { x: 50, y: 30, size: 7.5, font: this.font, color: MUTED });
  }
  ensure(h: number) { if (this.y - h < 55) this.newPage(); }
  text(s: string, o: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; gap?: number; x?: number; width?: number } = {}) {
    const size = o.size ?? 10, f = o.bold ? this.bold : this.font, x = o.x ?? 50, width = o.width ?? 495, lh = size * 1.38;
    const words = clean(s).split(/\s+/); let line = "";
    const flush = () => { this.ensure(lh); this.page.drawText(line, { x, y: this.y, size, font: f, color: o.color ?? INK }); this.y -= lh; line = ""; };
    for (const w of words) { const t = line ? `${line} ${w}` : w; if (f.widthOfTextAtSize(t, size) > width && line) { flush(); line = w; } else line = t; }
    if (line) flush();
    this.y -= o.gap ?? 4;
  }
  row(label: string, value: string, o: { bold?: boolean; size?: number } = {}) {
    const size = o.size ?? 10, f = o.bold ? this.bold : this.font; this.ensure(size * 1.6);
    this.page.drawText(clean(label), { x: 50, y: this.y, size, font: f, color: INK });
    const v = clean(value); this.page.drawText(v, { x: 545 - f.widthOfTextAtSize(v, size), y: this.y, size, font: f, color: INK });
    this.y -= size * 1.6;
  }
  rule(thick = 0.6) { this.ensure(8); this.page.drawLine({ start: { x: 50, y: this.y + 6 }, end: { x: 545, y: this.y + 6 }, thickness: thick, color: INK }); this.y -= 6; }
  heading(s: string) { this.y -= 6; this.text(s, { size: 12, bold: true, gap: 2 }); }
  brand() {
    this.page.drawText("DFRNT", { x: 50, y: this.y, size: 22, font: this.bold, color: INK });
    this.page.drawText("SOLAR", { x: 52, y: this.y - 11, size: 7, font: this.bold, color: TEAL });
    const r = `${SELLER.name} · ABN ${SELLER.abn}`;
    this.page.drawText(clean(r), { x: 545 - this.font.widthOfTextAtSize(clean(r), 8), y: this.y + 8, size: 8, font: this.font, color: MUTED });
    const c = `${SELLER.phone} · ${SELLER.email}`;
    this.page.drawText(clean(c), { x: 545 - this.font.widthOfTextAtSize(clean(c), 8), y: this.y - 3, size: 8, font: this.font, color: MUTED });
    this.y -= 40;
  }
}

async function start(footer: string) {
  const doc = await PDFDocument.create();
  const w = new Writer(doc, await doc.embedFont(StandardFonts.Helvetica), await doc.embedFont(StandardFonts.HelveticaBold), footer);
  return { doc, w };
}

export type DocJob = {
  token: string; title: string | null; customer_name: string | null; customer_email: string | null; site: SiteAnswers | null;
  signed_at: Date | null; signed_name: string | null; agreement_version: string | null; paid_at: Date | null; payment_method: string | null;
  payment_reference: string | null; invoice_number: string | null; install_date: string | null; lock_until: string; quote: Quote;
};
const address = (s: SiteAnswers | null) => s?.address ? [s.address.unit ? `${s.address.unit}/${s.address.line1}` : s.address.line1, `${s.address.suburb} ${s.address.state} ${s.address.postcode}`].join(", ") : "";

/** The signed installation agreement: schedule (what this job is) then the clauses as signed. */
export async function agreementPdf(j: DocJob, sections: Section[] = AGREEMENT) {
  const { doc, w } = await start(`${SELLER.trading} installation agreement · version ${j.agreement_version ?? "unsigned"} · system record ${j.token.slice(0, 8)}`);
  w.brand();
  w.text("Installation agreement", { size: 20, bold: true, gap: 2 });
  if (DRAFT) w.text("Draft wording awaiting legal review.", { size: 9, color: MUTED, gap: 8 });
  w.heading("Your system record (schedule)");
  const s = j.quote.stack;
  w.row("Customer", j.customer_name ?? ""); w.row("Email", j.customer_email ?? ""); w.row("Installation address", address(j.site));
  w.text(`System: ${j.title ?? ""}. ${friendlySummary(j.quote.config.summary)}`, { size: 9.5, color: INK, gap: 6 });
  w.row("Price before rebates (inc GST)", money(s.price_inc_gst));
  w.row(`Less rebate: ${s.stcs} STCs assigned to us`, `-${money(s.less_stcs)}`);
  w.row("You pay", money(s.amount_payable), { bold: true });
  w.row("Rebate held for installs on or before", j.quote.window.window_end ? date(j.quote.window.window_end) : date(j.lock_until));
  if (j.install_date) w.row("Install date", date(j.install_date));
  w.rule();
  w.row("Signed by", j.signed_name ?? "Not signed yet", { bold: true });
  w.row("Signed electronically on", j.signed_at ? new Date(j.signed_at).toLocaleString("en-AU", { timeZone: "Australia/Brisbane" }) : "-");
  w.row("Cooling-off", "10 business days from signing, full refund");
  w.y -= 6;
  for (const sec of sections) { w.heading(sec.h); for (const p of sec.p) w.text(p, { size: 9.5 }); }
  return doc.save();
}

/** Tax invoice, issued once paid. GST is on the full price before the rebate; the STC assignment is shown as a reduction. */
export async function invoicePdf(j: DocJob) {
  const { doc, w } = await start(`${SELLER.name} · ABN ${SELLER.abn} · Tax invoice ${j.invoice_number ?? ""}`);
  w.brand();
  w.text("Tax invoice", { size: 20, bold: true, gap: 8 });
  w.row("Invoice number", j.invoice_number ?? ""); w.row("Date", j.paid_at ? date(j.paid_at) : date(new Date()));
  w.row("Bill to", j.customer_name ?? ""); w.row("Installation address", address(j.site));
  if (j.payment_reference) w.row("Payment reference", j.payment_reference);
  w.rule();
  const s = j.quote.stack;
  const sum = (k: string[]) => s.lines.filter((l) => k.includes(l.kind)).reduce((a, l) => a + (l.sell_ex_gst ?? 0), 0);
  w.text(j.title ?? "Solar and battery system, supplied and installed", { bold: true, gap: 2 });
  w.text(friendlySummary(j.quote.config.summary), { size: 9, color: MUTED, gap: 8 });
  w.row("Equipment and materials", money(sum(["hardware", "bos"])));
  w.row("Installation", money(sum(["installation"])));
  const vari = sum(["variation"]); if (vari) w.row("Approved variations", money(vari));
  if (s.discount_inc_gst) w.row("Less discounts", `-${money(Math.round((s.discount_inc_gst / 1.1) * 100) / 100)}`);
  w.rule();
  w.row("Total excluding GST", money(s.price_ex_gst)); w.row("GST", money(s.gst)); w.row("Total including GST", money(s.price_inc_gst), { bold: true });
  w.row(`Less rebate: ${s.stcs} STCs assigned to ${SELLER.trading}`, `-${money(s.less_stcs)}`);
  w.rule(1.2);
  w.row(j.paid_at ? "Amount paid" : "Amount payable", money(s.amount_payable), { bold: true, size: 12 });
  w.y -= 10;
  w.text("The rebate is the value of the Small-scale Technology Certificates your system creates, assigned to us under your installation agreement and taken off your price.", { size: 8.5, color: MUTED });
  return doc.save();
}
