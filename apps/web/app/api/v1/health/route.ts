import { db } from "@dfrnt/db";
import { DEFAULT_RULES, DEFAULT_COSTS, DEFAULT_MENU, DEFAULT_REBATE_SETTINGS } from "@dfrnt/engine";
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
    engine: { rules: DEFAULT_RULES.version, costs: DEFAULT_COSTS.version, menu: DEFAULT_MENU.version, rebates: DEFAULT_REBATE_SETTINGS.version },
    database,
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
  });
}
