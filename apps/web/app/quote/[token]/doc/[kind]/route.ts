import { db } from "@dfrnt/db";
import { getQuote } from "@/lib/jobs";
import { agreementPdf, invoicePdf } from "@/lib/pdf";

export const dynamic = "force-dynamic";

/** Customer documents generated from our own records: the signed agreement and, once paid, the tax invoice. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string; kind: string }> }) {
  const { token, kind } = await params;
  if (!/^[0-9a-f]{36}$/.test(token)) return new Response("Not found", { status: 404 });
  const q = await getQuote(token);
  if (!q) return new Response("Not found", { status: 404 });
  const job = { ...q, quote: q.snapshot ?? q.result };
  let bytes: Uint8Array, name: string;
  if (kind === "agreement") {
    if (!q.signed_at) return new Response("Not signed yet", { status: 409 });
    bytes = await agreementPdf(job); name = `DFRNT-Solar-agreement-${token.slice(0, 8)}.pdf`;
  } else if (kind === "invoice") {
    if (!q.paid_at) return new Response("The tax invoice is issued once payment is received", { status: 409 });
    if (!q.invoice_number) {
      const [r] = await db()`update quotes set invoice_number = 'INV-' || nextval('invoice_seq') where id = ${q.id} and invoice_number is null returning invoice_number`;
      job.invoice_number = (r?.invoice_number as string) ?? (await getQuote(token))!.invoice_number;
    }
    bytes = await invoicePdf(job); name = `DFRNT-Solar-${job.invoice_number}.pdf`;
  } else return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(bytes), { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${name}"`, "cache-control": "private, no-store" } });
}
