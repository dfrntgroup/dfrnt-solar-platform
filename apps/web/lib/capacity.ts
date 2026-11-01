// Earliest install day for a postcode: live from installers' calendars where connected (scheduling S3).
import { nextDaysFor } from "./schedule";
import type { JobNeeds } from "@dfrnt/engine";

/** null = nobody installs there yet; undefined = unknown (database unavailable). */
export async function earliestFor(postcode: string, needs?: Partial<JobNeeds>): Promise<string | null | undefined> {
  try { const d = await nextDaysFor(postcode, needs, 1); return d === null ? null : d[0] ?? undefined; } catch { return undefined; }
}

export async function nextDays(postcode: string, needs?: Partial<JobNeeds>, n = 3): Promise<string[] | null | undefined> {
  try { return await nextDaysFor(postcode, needs, n); } catch { return undefined; }
}

/** What the battery size does for a typical home — plain words, not a promise. */
export { outcome } from "./outcome";
