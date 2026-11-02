"use client";
// S1: Stripe's payment form inside our page (PayTo, or card with Apple Pay / Google Pay). The amount is fixed on the
// server; this only collects the customer's details and confirms. Stripe then tells our webhook.
import { useMemo, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";

function Form({ returnUrl, label }: { returnUrl: string; label: string }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function pay(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true); setErr(null);
    const { error } = await stripe.confirmPayment({ elements, confirmParams: { return_url: returnUrl } });
    if (error) { setErr(error.message ?? "That didn't go through. Please try again."); setBusy(false); }
  }
  return (
    <form onSubmit={pay} className="card" style={{ marginTop: 12 }}>
      <PaymentElement options={{ layout: "tabs" }} />
      {err && <div className="note" style={{ marginTop: 10 }}>{err}</div>}
      <button className="btn block" type="submit" disabled={!stripe || busy} style={{ marginTop: 12 }}>{busy ? "Processing…" : label}</button>
      <span className="small muted">Payments are processed by Stripe. We never see your card or bank login.</span>
    </form>
  );
}

export function StripePay({ publishableKey, clientSecret, returnUrl, label }: { publishableKey: string; clientSecret: string; returnUrl: string; label: string }) {
  const promise = useMemo(() => loadStripe(publishableKey), [publishableKey]);
  return (
    <Elements stripe={promise} options={{ clientSecret, appearance: { theme: "stripe", variables: { colorPrimary: "#007a75", fontFamily: "Onest, system-ui, sans-serif", borderRadius: "6px" } } }}>
      <Form returnUrl={returnUrl} label={label} />
    </Elements>
  );
}
