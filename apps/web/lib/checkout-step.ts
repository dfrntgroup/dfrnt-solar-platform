// The customer's checkout step, decided in one place (9 Nov 2026). Used by the Checkout component, the Ops job page,
// Ops → Call-backs and the follow-up timer. "1 you · 2 your home · 3 photos"; the design fee, when due, stops the clock.
export interface CheckoutFlags { customer_email?: string | null; checkout_at?: Date | string | null; site_draft?: { address?: unknown } | null; design_fee_status?: string | null }
export type CheckoutStep = 1 | 2 | 3;
export function checkoutStep(q: CheckoutFlags): CheckoutStep {
  if (!q.customer_email || !q.checkout_at) return 1;
  if (!q.site_draft?.address) return 2;
  return 3;
}
export const CHECKOUT_STEP_NAMES: Record<CheckoutStep, string> = { 1: "You", 2: "Your home", 3: "Photos" };
/** What is left for the customer to do, in words a follow-up can use. */
export function checkoutLeft(q: CheckoutFlags): string {
  if (q.design_fee_status === "due") return "the design check fee";
  const s = checkoutStep(q);
  return s === 3 ? "four photos" : s === 2 ? "two short steps" : "three short steps";
}
export function checkoutLabel(q: CheckoutFlags): string {
  if (q.design_fee_status === "due") return "design fee due";
  const s = checkoutStep(q);
  return `step ${s}, ${s === 1 ? "contact details" : s === 2 ? "home details" : "photos"}`;
}
