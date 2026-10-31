import { db } from "@dfrnt/db";

export type Review = { id: string; rating: number; body: string; first_name: string | null; suburb: string | null; reply: string | null; published_at: Date; business_name: string | null };

/** Published reviews only. An average is shown only once there are enough to mean something. */
export const MIN_FOR_AVERAGE = 10;
export async function publishedReviews(limit = 100): Promise<{ rows: Review[]; count: number; average: number | null }> {
  try {
    const rows = await db()`select r.id, r.rating, r.body, r.first_name, r.suburb, r.reply, r.published_at, i.business_name
      from reviews r left join installers i on i.id = r.installer_id where r.status = 'published' order by r.published_at desc limit ${limit}`;
    const [agg] = await db()`select count(*)::int n, avg(rating)::float8 a from reviews where status = 'published'`;
    const n = (agg?.n as number) ?? 0;
    return { rows: rows as unknown as Review[], count: n, average: n >= MIN_FOR_AVERAGE ? Math.round((agg!.a as number) * 10) / 10 : null };
  } catch { return { rows: [], count: 0, average: null }; }
}
