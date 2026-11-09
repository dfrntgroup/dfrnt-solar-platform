// The quote/job lifecycle, declared once (9 Nov 2026). STATES and TRANSITIONS stay in jobs.ts for the code that imports them;
// everything else about the machine (labels, named sets, the effect each edge needs, who may take it) lives here.
import { defineMachine, type Tier } from "./machines";
import { BOARD, STATES, TRANSITIONS, type JobState } from "./jobs";

/** One label per state, used everywhere a state is shown (customer record, Ops, installer portal, API, agents). */
export const JOB_LABELS: Record<JobState, string> = {
  saved: "Saved", secured: "Checkout", pricing_instant: "Pricing", pricing_installer: "Pricing", tech_review: "Tech review",
  priced: "Quoted", signed: "Signed", payment_pending: "Pending payment", payment_review: "Payment review",
  awaiting_date: "Awaiting date", booked: "Booked", gear_ordered: "Gear ordered", delivered: "Delivered", on_site: "On site",
  variation_pending: "On hold", installed: "Installed", lodged: "Lodged", settled: "Settled", complete: "Complete",
  cancelled: "Cancelled", expired: "Expired", lapsed: "Lapsed", declined: "Declined",
};

/**
 * Effects. An edge with no entry is plain: "Change stage" and agents may take it directly.
 * A named effect means the edge can only be taken through the action that does that work (the web app maps the name to its function).
 * Names ending in "!" are inline hooks: the work runs inside the transition itself, so the edge is still takeable from "Change stage".
 */
export const JOB_EFFECTS: Record<string, string | readonly string[]> = {
  "saved->secured": "secure", "lapsed->secured": "secure",
  "secured->pricing_instant": "submitSite", "secured->pricing_installer": "submitSite", "secured->tech_review": "submitSite",
  "*->priced": "freezePrice",
  "priced->signed": "sign",
  "signed->payment_pending": "createPayment",
  "payment_pending->signed": ["changePayment", "intentFailed", "release"],
  "payment_pending->payment_review": "stripeStatus", "payment_review->payment_pending": "stripeStatus",
  "payment_pending->awaiting_date": "markPaid", "payment_review->awaiting_date": "markPaid",
  "awaiting_date->booked": "bookDay",
  "booked->awaiting_date": "releaseDay",
  "on_site->variation_pending": "raiseVariation", "variation_pending->on_site": "decideVariation",
  "on_site->installed": "installed!",
  "settled->complete": "completeCheck!",
  "tech_review->pricing_installer": "assignInstaller", "priced->pricing_installer": "assignInstaller",
  "*->cancelled": "cancel",
};

/** Who may take each edge. R never applies to an edge. Unlisted edges are H (a person or the customer, through its own action). */
export const JOB_TIERS: Record<string, Tier> = {
  "booked->gear_ordered": "A", "gear_ordered->delivered": "A", "delivered->on_site": "A",
  "installed->lodged": "A", "lodged->settled": "A", "settled->complete": "A",
  "pricing_installer->tech_review": "A", "pricing_instant->tech_review": "A",
  "secured->lapsed": "A", "priced->lapsed": "A", "pricing_installer->lapsed": "A", "saved->expired": "A",
  "*->priced": "P", "on_site->installed": "P", "on_site->variation_pending": "P",
  "payment_pending->awaiting_date": "P", "payment_review->awaiting_date": "P",
  "tech_review->declined": "P", "tech_review->pricing_installer": "P", "priced->pricing_installer": "P",
};

export const QUOTE = defineMachine<JobState>({ name: "quote", states: STATES, transitions: TRANSITIONS, labels: JOB_LABELS, effects: JOB_EFFECTS, tiers: JOB_TIERS, defaultTier: "H" });

export const isInlineEffect = (e: string) => e.endsWith("!");
/** Edges "Change stage" (and tier-A/P agents, subject to tier) may take: plain edges and inline-hook edges. */
export const isManualEdge = (from: JobState, to: JobState) => QUOTE.can(from, to) && QUOTE.effectsOf(from, to).every(isInlineEffect);
/** The action that owns an edge, or null when it is manual. */
export const ownerOf = (from: JobState, to: JobState): string | null => QUOTE.effectsOf(from, to).find((e) => !isInlineEffect(e)) ?? null;

/* ---------- named sets: the only lists the app should type ---------- */
const S = (...xs: JobState[]): readonly JobState[] => Object.freeze(xs);
export const JOB_SETS = {
  /** Customer can still open the checkout and send home details. */
  OPEN_CHECKOUT: S("saved", "secured", "lapsed"),
  /** An installer (or Ops) can put a price on it. */
  AWAITING_PRICE: S("pricing_installer", "tech_review"),
  /** Somewhere between home details and a frozen price. */
  PRICING: S("pricing_instant", "pricing_installer", "tech_review"),
  /** Priced or earlier and not yet signed: add-ons go into the contract, codes can be applied, designs revised. */
  PRE_SIGN: S("secured", "pricing_instant", "pricing_installer", "tech_review", "priced"),
  /** A code (credit or referral) can be applied. */
  CODE_OK: S("secured", "pricing_installer", "tech_review", "priced"),
  /** A design revision can be proposed or answered. */
  REVISABLE: S("pricing_installer", "tech_review", "priced"),
  /** Signed, money not yet in. */
  AWAITING_PAYMENT: S("payment_pending", "payment_review"),
  /** Paid, day not yet booked (or booked and released). */
  AFTER_PAY: S("awaiting_date", "booked", "gear_ordered", "delivered"),
  /** Holds a slot on the calendar. */
  BOOKED: S("booked", "gear_ordered", "delivered", "on_site", "variation_pending"),
  /** Has a day that can be moved or released. */
  HAS_DAY: S("booked", "gear_ordered", "delivered"),
  /** A variation can be raised (a second one while already on hold just joins the first). */
  VARIATION_OK: S("booked", "gear_ordered", "delivered", "on_site", "variation_pending"),
  /** Work done: the customer's System Record is live. */
  INSTALLED: S("installed", "lodged", "settled", "complete"),
  /** Live, before install, not closed: the pipeline for capacity and rebate-window planning. */
  PIPELINE: S("secured", "pricing_instant", "pricing_installer", "tech_review", "priced", "signed", "payment_pending", "payment_review", "awaiting_date"),
  /** Eligible for the next-rebate-window offer. */
  FORWARDABLE: S("secured", "pricing_instant", "pricing_installer", "tech_review", "priced", "signed", "payment_pending"),
  /** Closed without an install. */
  CLOSED: S("cancelled", "expired", "lapsed", "declined"),
  /** States the customer or Ops may cancel from: derived from the table, never typed. */
  CAN_CANCEL: QUOTE.from("cancelled"),
  /** Shown on the Ops board. */
  ON_BOARD: QUOTE.where((s) => !["saved", "expired", "lapsed", "declined", "cancelled"].includes(s)),
} as const;

/** Groups for the customer's progress chips: the journey in six steps (closed states sit in none). */
export const JOB_STEPS: { label: string; states: readonly JobState[] }[] = [
  { label: "Your home", states: S("saved", "secured", "lapsed") },
  { label: "Price", states: S("pricing_instant", "pricing_installer", "tech_review", "priced") },
  { label: "Sign + pay", states: S("signed", "payment_pending", "payment_review") },
  { label: "Book", states: S("awaiting_date") },
  { label: "Install", states: S("booked", "gear_ordered", "delivered", "on_site", "variation_pending") },
  { label: "Done", states: S("installed", "lodged", "settled", "complete") },
];

/** Sub-status: things the state column doesn't say but every screen needs to. */
export interface JobFlags { status: JobState; rebook?: boolean | null; install_date?: string | null; design_fee_status?: string | null; revision?: unknown; lock_until?: string | null }
export function subStatus(q: JobFlags, today?: string): string | null {
  if (JOB_SETS.BOOKED.includes(q.status) && (q.rebook || !q.install_date)) return "needs a day";
  if (q.status === "secured" && q.design_fee_status === "due") return "fee due";
  if (JOB_SETS.REVISABLE.includes(q.status) && q.revision) return "revision waiting";
  if (today && (q.status === "secured" || q.status === "priced") && q.lock_until && q.lock_until < today) return "lock expired";
  return null;
}
/** "Booked · needs a day" or just "Booked". */
export const statusLabel = (q: JobFlags, today?: string) => { const sub = subStatus(q, today); return sub ? `${JOB_LABELS[q.status]} · ${sub}` : JOB_LABELS[q.status]; };

/** What an actor of this tier may do next from a state: the allowed moves with their owner and tier. */
export interface NextMove { to: JobState; label: string; via: string | null; tier: Tier; manual: boolean }
export function nextMoves(from: JobState, maxTier: Tier = "H"): NextMove[] {
  const rank: Record<Tier, number> = { R: 0, A: 1, P: 2, H: 3 };
  return QUOTE.next(from).map((to) => ({ to, label: JOB_LABELS[to], via: ownerOf(from, to), tier: QUOTE.tierOf(from, to), manual: isManualEdge(from, to) }))
    .filter((m) => rank[m.tier] <= rank[maxTier]);
}

/** Ops board columns, in journey order, derived from BOARD for the states that belong on the board. */
export const BOARD_COLUMNS: readonly string[] = Object.freeze([...new Set(JOB_SETS.ON_BOARD.map((s) => BOARD[s]))]);

/**
 * One table for "this job is waiting too long" (decided 9 Nov 2026). Hours of wall-clock time since the state's own clock
 * (pricing_requested_at for installer pricing, paid_at for awaiting a date, updated_at otherwise). The board, the agent sweep
 * and the crons all read it.
 */
export const STALE = {
  pricing_installer: { nudge_hours: 4, reassign_hours: 24 },
  pricing_instant: { rescue_hours: 1 },
  tech_review: { alert_hours: 24 },
  payment_pending: { remind_days: [3, 6] as readonly number[], release_days: 7 },
  payment_review: { alert_hours: 0 },
  awaiting_date: { desk_hours: 48 },
  booked: { po_days_before_install: 5 },
} as const;
