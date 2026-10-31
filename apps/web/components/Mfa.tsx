"use client";
// Two-factor sign-in (TOTP) with Supabase Auth MFA. Enrol once with an authenticator app; afterwards every sign-in asks for a code.
import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

const sb = () => createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
const box = { width: "100%", padding: 10, border: "1px solid var(--line)", borderRadius: 6, font: "inherit", fontSize: 20, letterSpacing: 4 } as const;

export function MfaEnrol() {
  const [state, setState] = useState<{ status: string; qr?: string; secret?: string; factorId?: string; error?: string }>({ status: "loading" });
  const [code, setCode] = useState("");
  useEffect(() => { (async () => {
    const { data } = await sb().auth.mfa.listFactors();
    setState({ status: data?.totp?.some((f) => f.status === "verified") ? "on" : "off" });
  })(); }, []);
  async function start() {
    const { data, error } = await sb().auth.mfa.enroll({ factorType: "totp", friendlyName: `DFRNT ${new Date().toISOString().slice(0, 10)}` });
    if (error) return setState({ status: "off", error: error.message });
    setState({ status: "enrolling", qr: data.totp.qr_code, secret: data.totp.secret, factorId: data.id });
  }
  async function verify() {
    const { error } = await sb().auth.mfa.challengeAndVerify({ factorId: state.factorId!, code });
    if (error) return setState({ ...state, error: error.message });
    setState({ status: "on" });
  }
  if (state.status === "loading") return <p className="muted">Checking…</p>;
  if (state.status === "on") return <div className="ok">Two-factor sign-in is on. Each sign-in asks for a code from your authenticator app.</div>;
  if (state.status === "off") return <><p>Protect your account with an authenticator app (Google Authenticator, 1Password, Authy).</p>{state.error && <div className="note">{state.error}</div>}<button className="btn" onClick={start}>Turn on two-factor</button></>;
  return (
    <div>
      <p>1. Scan this with your authenticator app.</p>
      {state.qr && <img src={state.qr} alt="Two-factor QR code" width={200} height={200} />}
      <p className="small muted">Can&apos;t scan? Enter this key: <code>{state.secret}</code></p>
      <p>2. Type the 6-digit code it shows.</p>
      <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" style={box} />
      {state.error && <div className="note">{state.error}</div>}
      <p><button className="btn" onClick={verify} disabled={code.length !== 6}>Confirm</button></p>
    </div>
  );
}

export function MfaChallenge({ next }: { next: string }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  async function go() {
    const { data } = await sb().auth.mfa.listFactors();
    const f = data?.totp?.find((x) => x.status === "verified");
    if (!f) return setError("No authenticator set up");
    const { error: e } = await sb().auth.mfa.challengeAndVerify({ factorId: f.id, code });
    if (e) return setError(e.message);
    location.href = next;
  }
  return (
    <div>
      <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoFocus style={box} placeholder="6-digit code" />
      {error && <div className="note">{error}</div>}
      <p><button className="btn block" onClick={go} disabled={code.length !== 6}>Continue</button></p>
    </div>
  );
}
