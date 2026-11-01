import { db } from "@dfrnt/db";
import { GOOGLE_NAMES, googleFeedKey, type ConversionName } from "@/lib/conversions";

export const dynamic = "force-dynamic";

/** Google Ads scheduled upload (Goals → Conversions → Uploads → Schedules → HTTPS). Last 30 days; Google drops duplicates. */
export async function GET(req: Request) {
  if (new URL(req.url).searchParams.get("key") !== googleFeedKey()) return new Response("Not found", { status: 404 });
  const rows = await db()`select e.name, e.value::float8 value, e.created_at, q.attribution->>'gclid' gclid from conversion_events e join quotes q on q.id = e.quote_id
    where e.platform = 'google' and e.created_at > now() - interval '30 days' and q.attribution ? 'gclid' order by e.created_at`;
  const t = (d: Date) => new Date(d.getTime() + 10 * 3600_000).toISOString().replace("T", " ").slice(0, 19);
  const lines = ["Parameters:TimeZone=Australia/Brisbane", "Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency,Ad User Data,Ad Personalization",
    ...rows.map((r) => [r.gclid, GOOGLE_NAMES[r.name as ConversionName] ?? r.name, t(new Date(r.created_at as string)), r.value ?? "", r.value != null ? "AUD" : "", "Granted", "Granted"].join(","))];
  await db()`update conversion_events set status = 'served', sent_at = now() where platform = 'google' and status = 'pending'`;
  return new Response(lines.join("\n"), { headers: { "content-type": "text/csv; charset=utf-8", "cache-control": "no-store" } });
}
