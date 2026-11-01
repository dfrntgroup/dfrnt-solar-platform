// C7: every installer who covers a postcode and can do this job, with what the customer needs to choose between them.
// Same price whoever they pick. Earliest day comes from their live calendar (scheduling S2/S3).
import { db } from "@dfrnt/db";
import type { JobNeeds } from "@dfrnt/engine";

export interface InstallerOption {
  id: string; business_name: string; licence_no: string | null; saa_accreditation: string | null;
  reviews: number; average: number | null; earliest: string | null; installs: number;
}

/** Test installers count only outside production (preview and local), so the live site never shows them. */
export const includeTest = () => process.env.VERCEL_ENV !== "production";

export async function installersFor(postcode: string, needs?: JobNeeds, limit = 3): Promise<InstallerOption[]> {
  const pc = parseInt(postcode, 10);
  if (!Number.isFinite(pc)) return [];
  const rows = await db()`select i.id, i.business_name, i.licence_no, i.saa_accreditation,
      (select count(*)::int from reviews r where r.installer_id = i.id and r.status = 'published') reviews,
      (select round(avg(rating)::numeric, 1)::float8 from reviews r where r.installer_id = i.id and r.status = 'published') average,
      (select count(*)::int from quotes q where q.installer_id = i.id and q.status in ('installed','lodged','settled','complete')) installs
    from installers i where i.active and (not i.is_test or ${includeTest()}) and exists (select 1 from unnest(i.postcode_ranges) r where r @> ${pc}::int)
    order by i.is_test, i.created_at`;
  const { earliestFor } = await import("./schedule");
  const n: JobNeeds = needs ?? { brand: "", kind: "solar_battery", panelKw: 10, phases: 1, roofType: "tin", storeys: 1, postcode };
  const out: InstallerOption[] = [];
  for (const r of rows) {
    const e = await earliestFor(r.id as string, n);
    if (e.can.filter((x) => n.brand || !x.startsWith("Not accredited")).length) continue;
    out.push({
      id: r.id as string, business_name: r.business_name as string, licence_no: (r.licence_no as string) ?? null, saa_accreditation: (r.saa_accreditation as string) ?? null,
      reviews: r.reviews as number, average: (r.reviews as number) >= 3 ? (r.average as number) : null, installs: r.installs as number, earliest: e.date,
    });
  }
  return out.sort((a, b) => (a.earliest ?? "9999").localeCompare(b.earliest ?? "9999")).slice(0, limit);
}
