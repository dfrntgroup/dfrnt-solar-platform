// Every other lifecycle in the platform, declared once (S5, 9 Nov 2026). Each was implied by scattered string literals before;
// now the states, the edges and a label per state live here, and the web app moves rows through one guarded helper.
// Values match the database enums and column comments exactly; nothing here renames a state.
import { defineMachine, type Machine } from "./machines";

const m = <S extends string>(name: string, states: readonly S[], transitions: Record<S, readonly S[]>, labels: Record<S, string>) =>
  defineMachine<S>({ name, states, transitions, labels, defaultTier: "H" });

/** payments.status: a system, variation, add-on or report payment; refund rows use the same column (pending → refunded | failed). */
export const PAYMENT = m("payment", ["pending", "review", "received", "failed", "refunded"] as const,
  { pending: ["received", "review", "failed", "refunded"], review: ["received", "pending", "failed"], received: [], failed: [], refunded: [] },
  { pending: "Pending", review: "Processing", received: "Received", failed: "Failed", refunded: "Refunded" });

/** variations.status */
export const VARIATION = m("variation", ["proposed", "approved", "declined", "paid", "cancelled"] as const,
  { proposed: ["approved", "declined", "cancelled"], approved: ["paid", "cancelled"], declined: [], paid: [], cancelled: [] },
  { proposed: "Waiting for the customer", approved: "Approved", declined: "Declined", paid: "Paid", cancelled: "Cancelled" });

/** purchase_orders.status */
export const PURCHASE_ORDER = m("purchase_order", ["draft", "approved", "sent", "delivered", "cancelled"] as const,
  { draft: ["approved", "cancelled"], approved: ["sent", "cancelled"], sent: ["delivered", "cancelled"], delivered: [], cancelled: [] },
  { draft: "Draft", approved: "Approved", sent: "Sent", delivered: "Delivered", cancelled: "Cancelled" });

/** stc_receivables.status */
export const STC_RECEIVABLE = m("stc_receivable", ["expected", "lodged", "sold", "paid", "failed"] as const,
  { expected: ["lodged", "failed"], lodged: ["sold", "failed"], sold: ["paid", "failed"], paid: [], failed: [] },
  { expected: "Expected", lodged: "Lodged", sold: "Sold", paid: "Paid", failed: "Failed" });

/** pay_ledger.status (installer pay). A cancelled job's accrued or eligible lines go back to accrued at $0. */
export const PAY_LEDGER = m("pay_ledger", ["accrued", "eligible", "approved", "paid"] as const,
  { accrued: ["eligible"], eligible: ["approved", "accrued"], approved: ["paid"], paid: [] },
  { accrued: "Accrued", eligible: "Eligible", approved: "Approved", paid: "Paid" });

/** date_offers.status: an installer's offer of days (requested → open) or an earlier-day offer. */
export const DATE_OFFER = m("date_offer", ["requested", "open", "taken", "expired", "lost"] as const,
  { requested: ["open", "expired", "lost"], open: ["taken", "expired", "lost"], taken: [], expired: [], lost: [] },
  { requested: "Waiting for the installer", open: "Days offered", taken: "Taken", expired: "Expired", lost: "Gone" });

/** energy_links.status (CDR smart-meter link). A failed link may be retried, so failed is not terminal; disconnected is. */
export const ENERGY_LINK = m("energy_link", ["new", "consenting", "waiting", "ready", "fallback", "failed", "disconnected"] as const,
  { new: ["consenting", "waiting", "fallback", "disconnected"], consenting: ["waiting", "failed", "fallback", "disconnected"], waiting: ["ready", "fallback", "failed", "disconnected"],
    ready: ["disconnected"], fallback: ["waiting", "disconnected"], failed: ["waiting", "fallback", "disconnected"], disconnected: [] },
  { new: "Starting", consenting: "Consenting", waiting: "Fetching usage", ready: "Connected", fallback: "Using your bill instead", failed: "Didn't connect", disconnected: "Disconnected" });

/** memberships.status (service plan) */
export const MEMBERSHIP = m("membership", ["pending", "active", "lapsed", "cancelled"] as const,
  { pending: ["active", "cancelled", "lapsed"], active: ["lapsed", "cancelled"], lapsed: ["active", "cancelled"], cancelled: [] },
  { pending: "Pending first payment", active: "Active", lapsed: "Lapsed", cancelled: "Cancelled" });

/** approvals.status (O22 queue) */
export const APPROVAL = m("approval", ["pending", "approved", "rejected", "expired"] as const,
  { pending: ["approved", "rejected", "expired"], approved: [], rejected: [], expired: [] },
  { pending: "Waiting for a person", approved: "Approved", rejected: "Rejected", expired: "Expired" });

/** messages.status (outbox) */
export const MESSAGE = m("message", ["held", "queued", "sent", "failed"] as const,
  { held: ["queued", "sent", "failed"], queued: ["sent", "failed", "held"], failed: ["queued", "sent"], sent: [] },   // a retry that fails again stays failed (attempts counted), no self-loop
  { held: "Held", queued: "Queued", sent: "Sent", failed: "Failed" });

/** reviews.status */
export const REVIEW = m("review", ["pending", "published", "hidden"] as const,
  { pending: ["published", "hidden"], published: ["hidden", "pending"], hidden: ["published", "pending"] },
  { pending: "Waiting for a look", published: "Published", hidden: "Hidden" });

/** tickets.status (support, call-backs, waitlist, disputes) */
export const TICKET = m("ticket", ["open", "waiting", "closed"] as const,
  { open: ["waiting", "closed"], waiting: ["open", "closed"], closed: ["open"] },
  { open: "Open", waiting: "Waiting on us", closed: "Closed" });

/** installer_applications.status */
export const INSTALLER_APPLICATION = m("installer_application", ["new", "accepted", "declined"] as const,
  { new: ["accepted", "declined"], accepted: [], declined: [] },
  { new: "New", accepted: "Accepted", declined: "Declined" });

/** credits.status: a credit is released back to issued when the job it was applied to is cancelled. */
export const CREDIT = m("credit", ["issued", "applied", "expired", "void"] as const,
  { issued: ["applied", "expired", "void"], applied: ["issued", "void"], expired: [], void: [] },
  { issued: "Available", applied: "Applied", expired: "Expired", void: "Void" });

/** payouts.status (referral and creator rewards) */
export const PAYOUT = m("payout", ["accrued", "eligible", "paid", "void"] as const,
  { accrued: ["eligible", "void"], eligible: ["paid", "void"], paid: [], void: [] },
  { accrued: "Accrued", eligible: "Eligible", paid: "Paid", void: "Void" });

/** campaigns.status */
export const CAMPAIGN = m("campaign", ["draft", "sending", "sent"] as const,
  { draft: ["sending", "sent"], sending: ["sent"], sent: [] },
  { draft: "Draft", sending: "Sending", sent: "Sent" });

/** callbacks.status */
export const CALLBACK = m("callback", ["new", "done"] as const, { new: ["done"], done: [] }, { new: "To call", done: "Done" });

/** agent_runs.status */
export const AGENT_RUN = m("agent_run", ["running", "done", "blocked", "error", "off", "budget", "test"] as const,
  { running: ["done", "blocked", "error"], done: [], blocked: [], error: [], off: [], budget: [], test: [] },
  { running: "Running", done: "Done", blocked: "Blocked", error: "Error", off: "Off", budget: "Over budget", test: "Test" });

/** Every declared lifecycle, by the table it lives in, for the OpenAPI document and the Ops label helpers. */
export const LIFECYCLES: Record<string, Machine<string>> = {
  payments: PAYMENT as Machine<string>, variations: VARIATION as Machine<string>, purchase_orders: PURCHASE_ORDER as Machine<string>,
  stc_receivables: STC_RECEIVABLE as Machine<string>, pay_ledger: PAY_LEDGER as Machine<string>, date_offers: DATE_OFFER as Machine<string>,
  energy_links: ENERGY_LINK as Machine<string>, memberships: MEMBERSHIP as Machine<string>, approvals: APPROVAL as Machine<string>,
  messages: MESSAGE as Machine<string>, reviews: REVIEW as Machine<string>, tickets: TICKET as Machine<string>,
  installer_applications: INSTALLER_APPLICATION as Machine<string>, credits: CREDIT as Machine<string>, payouts: PAYOUT as Machine<string>,
  campaigns: CAMPAIGN as Machine<string>, callbacks: CALLBACK as Machine<string>, agent_runs: AGENT_RUN as Machine<string>,
};

/** Label for any lifecycle's state, falling back to the raw value. */
export const lifecycleLabel = (table: string, status: string | null | undefined) => (status && LIFECYCLES[table]?.labels[status]) || status || "";
