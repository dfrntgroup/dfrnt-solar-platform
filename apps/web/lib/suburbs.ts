// B2: suburb pages, only where we have something real: at least one completed install in that suburb.
import { db } from "@dfrnt/db";

export const slugOf = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export async function suburbs() {
  const rows = await db()`select site->'address'->>'suburb' suburb, site->'address'->>'postcode' postcode, count(*)::int installs
    from quotes where status in ('installed','lodged','settled','complete') and site->'address'->>'suburb' is not null
      and not exists (select 1 from installers i where i.id = quotes.installer_id and i.is_test) and coalesce(customer_name, '') not ilike 'test%'
    group by 1, 2 having count(*) >= 1 order by 3 desc`;
  return rows.map((r) => ({ name: String(r.suburb).replace(/\b\w/g, (c) => c.toUpperCase()), postcode: r.postcode as string, installs: r.installs as number, slug: slugOf(r.suburb as string) }));
}
