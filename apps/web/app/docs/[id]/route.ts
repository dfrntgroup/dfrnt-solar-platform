import { redirect } from "next/navigation";
import { db } from "@dfrnt/db";
import { photoUrl } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** Product datasheets and manuals (public documents). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
  const [d] = await db()`select url, path from product_docs where id = ${id}`;
  if (!d) return new Response("Not found", { status: 404 });
  if (d.url) redirect(d.url as string);
  const url = await photoUrl(d.path as string);
  if (!url) return new Response("Not found", { status: 404 });
  redirect(url);
}
