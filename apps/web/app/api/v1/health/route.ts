import { db } from "@dfrnt/db";
import { pricingData } from "@/lib/pricing-data";
import { json } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  let database: unknown;
  try {
    const rows = await db()`select name from _migrations order by name`;
    database = { ok: true, migrations: rows.map((r) => r.name) };
  } catch (e) {
    database = { ok: false, error: (e as Error).message.slice(0, 200) };
  }
  return json({
    ok: true,
    engine: (await pricingData()).versions,
    database,
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
  });
}
