// S2: Stripe tells us, not the browser. Verified signature, each event handled once.
import { NextResponse } from "next/server";
import { handleEvent, stripeReady, verifyEvent } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!stripeReady()) return NextResponse.json({ error: "not configured" }, { status: 503 });
  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "missing signature" }, { status: 400 });
  const raw = await req.text();
  let ev;
  try { ev = await verifyEvent(raw, sig); } catch { return NextResponse.json({ error: "bad signature" }, { status: 400 }); }
  try {
    const r = await handleEvent(ev);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    console.error("stripe webhook", ev.type, (e as Error).message);
    return NextResponse.json({ error: "handler failed" }, { status: 500 });   // Stripe retries
  }
}
