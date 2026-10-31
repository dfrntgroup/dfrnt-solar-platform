// Earliest install date for a postcode from real installer capacity (paid, booked jobs only hold slots).
import { db } from "@dfrnt/db";
import { earliestDate, type Capacity } from "@dfrnt/engine";
import { todayAEST } from "./api";

let cache: { at: number; key: string; v: string | null } | null = null;

export async function earliestFor(postcode: string): Promise<string | null | undefined> {
  if (cache && cache.key === postcode && Date.now() - cache.at < 60_000) return cache.v;
  const pc = parseInt(postcode, 10);
  try {
    const rows = await db()`select i.capacity, (select json_object_agg(d, n) from (select install_date::text d, count(*)::int n from quotes q where q.installer_id = i.id and install_date is not null
        and status in ('booked','gear_ordered','delivered','on_site','variation_pending') group by 1) x) booked
      from installers i where active and exists (select 1 from unnest(postcode_ranges) r where r @> ${pc}::int)`;
    if (!rows.length) { cache = { at: Date.now(), key: postcode, v: null }; return null; }   // no installer covers it
    const dates = rows.map((r) => earliestDate(todayAEST(), { ...(r.capacity as Omit<Capacity, "booked">), booked: (r.booked ?? {}) as Record<string, number> })).filter(Boolean).sort() as string[];
    const v = dates[0] ?? null;
    cache = { at: Date.now(), key: postcode, v };
    return v;
  } catch { return undefined; }   // unknown (database unavailable)
}

/** What the battery size does for a typical home — plain words, not a promise. */
export function outcome(kwh: number, kw: number) {
  if (!kwh) return kw ? "Daytime solar for your home" : "";
  if (kwh < 12) return "Covers most evenings";
  if (kwh < 18) return "Evenings and into the night";
  if (kwh < 26) return "Evening to morning for most homes";
  return "Big homes, EVs and long blackouts";
}
