import { redirect } from "next/navigation";
import { db } from "@dfrnt/db";
import { photoUrl } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** A document on a customer's System Record: a short-lived link to the stored file. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  if (!/^[0-9a-f]{36}$/.test(token) || !/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
  const [d] = await db()`select d.path from job_documents d join quotes q on q.id = d.quote_id where d.id = ${id} and q.token = ${token}`;
  if (!d) return new Response("Not found", { status: 404 });
  const url = await photoUrl(d.path as string);
  if (!url) return new Response("Stored locally (test environment)", { status: 404 });
  redirect(url);
}
