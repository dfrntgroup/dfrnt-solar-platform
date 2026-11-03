// December switch-over (approved 3 Nov 2026): there is no cut-over date. When an area has no free install day
// left before the current rebate window ends, new prices there use the next window's rebate, and installs start
// in that window. The installers' own calendars decide; nothing is set by hand.
import { nextWindowStart, rebateWindow } from "@dfrnt/engine";
import { todayAEST } from "./api";
import { pricingData } from "./pricing-data";
import { nextDays } from "./capacity";

/** Start of the next rebate window when the current one is fully booked for this postcode; null otherwise. */
export async function rebateFromFor(postcode: string): Promise<string | null> {
  if (!/^\d{4}$/.test(postcode)) return null;
  const today = todayAEST();
  const { rebates } = await pricingData();
  const end = rebateWindow(today, rebates).window_end;
  if (!end) return null;
  const days = await nextDays(postcode, undefined, 1);
  // null = nobody covers the area (waitlist, not a switch-over); [] or unknown = no evidence it's full.
  if (!days || !days.length) return null;
  return days[0]! > end ? nextWindowStart(today, rebates) : null;
}

/** Everything pricing needs for a visitor's postcode today. */
export async function siteFor(postcode: string) {
  return { postcode, asOf: todayAEST(), rebateFrom: await rebateFromFor(postcode) };
}
