import type { JobState } from "@dfrnt/engine";
/** States in which the installer may still set how many crew-days the job takes (before the day is booked). */
export const JOB_DAYS_OK: readonly JobState[] = ["pricing_installer", "tech_review", "priced", "signed", "payment_pending", "payment_review", "awaiting_date"];
