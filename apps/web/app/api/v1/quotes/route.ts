import { QuoteRequestSchema } from "@/lib/schema";
import { json, problem, resolveActor, writeOptions } from "@/lib/api";
import { createQuote } from "@/lib/quotes";

export const dynamic = "force-dynamic";

/** quotes.create — tier A. Prices a configuration with the engine and saves it with a 14-day / window-end lock. */
export async function POST(req: Request) {
  const actor = await resolveActor(req);
  if (actor instanceof Response) return actor;
  const parsed = QuoteRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return problem(400, "Invalid quote request", parsed.error.flatten());
  const out = await createQuote(actor, parsed.data, writeOptions(req));
  return json({ ...out.result, replayed: out.replayed, dry_run: out.dryRun }, out.replayed ? 200 : 201);
}
