// C7: every installer who covers a postcode, with what the customer needs to choose between them. Same price whoever they pick.
import { db } from "@dfrnt/db";
import { earliestDate, type Capacity } from "@dfrnt/engine";
import { todayAEST } from "./api";

export interface InstallerOption {
  id: string; business_name: string; licence_no: string | null; saa_accreditation: string | null;
  reviews: number; average: number | null; earliest: string | null; installs: number;
}

/** Test installers count only outside production (preview and local), so the live site never shows them. */
export const includeTest = () => process.env.VERCEL_ENV !== "production";

export async function installersFor(postcode: string, limit = 3): Promise<InstallerOption[]> {
  const pc = parseInt(postcode, 10);
  if (!Number.isFinite(pc)) return [];
  const rows = await db()`select i.id, i.business_name, i.licence_no, i.saa_accreditation, i.capacity,
      (select json_object_agg(d, n) from (select install_date::text d, count(*)::int n from quotes q where q.installer_id = i.id and install_date is not null
        and status in ('booked','gear_ordered','delivered','on_site','variation_pending') group by 1) x) booked,
      (select count(*)::int from reviews r where r.installer_id = i.id and r.status = 'published') reviews,
      (select round(avg(rating)::numeric, 1)::float8 from reviews r where r.installer_id = i.id and r.status = 'published') average,
      (select count(*)::int from quotes q where q.installer_id = i.id and q.status in ('installed','lodged','settled','complete')) installs
    from installers i where i.active and (not i.is_test or ${includeTest()}) and exists (select 1 from unnest(i.postcode_ranges) r where r @> ${pc}::int)
    order by i.is_test, i.created_at`;
  return rows.map((r) => ({
    id: r.id as string, business_name: r.business_name as string, licence_no: (r.licence_no as string) ?? null, saa_accreditation: (r.saa_accreditation as string) ?? null,
    reviews: r.reviews as number, average: (r.reviews as number) >= 3 ? (r.average as number) : null, installs: r.installs as number,
    earliest: earliestDate(todayAEST(), { ...(r.capacity as Omit<Capacity, "booked">), booked: (r.booked ?? {}) as Record<string, number> }),
  })).sort((a, b) => (a.earliest ?? "9999").localeCompare(b.earliest ?? "9999")).slice(0, limit);
}
