import type { RebateWindow } from "@dfrnt/engine";
import { longDate } from "./site";

/** The one sentence that explains how long a price is held and which rebate it uses (product pages and the builder). */
export function rebateLine(w: Pick<RebateWindow, "window_end" | "lock_until">, rebateFrom?: string | null) {
  const nextStep = w.window_end ? new Date(Date.parse(`${w.window_end}T00:00:00Z`) + 86400_000).toISOString().slice(0, 10) : null;
  const forwardEnd = rebateFrom ? new Date(Date.parse(`${rebateFrom}T00:00:00Z`) - 86400_000).toISOString().slice(0, 10) : null;
  return rebateFrom ? `Installs up to ${longDate(forwardEnd!)} are fully booked in your area, so this price includes the rebate for installs from ${longDate(rebateFrom)}. It is held until ${longDate(w.lock_until)}.`
    : !w.window_end ? `This price is held until ${longDate(w.lock_until)}.`
    : w.lock_until < w.window_end ? `This price is held until ${longDate(w.lock_until)}. The rebate steps down on ${longDate(nextStep!)}, so it applies to installs done by ${longDate(w.window_end)}. You see your install dates before you pay.`
    : `This price is held until ${longDate(w.window_end)}, the last day of this rebate step. Installs must be done by then, and you see your dates before you pay.`;
}
