// S1: the "Use my real usage" card. Server component; posts to a server action that opens Fiskil's consent screen.
export function UsageConnect({ action, hidden, askEmail, error, compact }: {
  action: (f: FormData) => Promise<void>; hidden: Record<string, string>; askEmail: boolean; error?: string; compact?: boolean;
}) {
  const box = { padding: 10, border: "1px solid var(--line)", borderRadius: 6, font: "inherit", width: "100%" } as const;
  return (
    <form id="usage" action={action} className="card" style={{ marginTop: compact ? 12 : 18, padding: 16, borderColor: "var(--teal)" }}>
      {Object.entries(hidden).filter(([k]) => !(askEmail && (k === "solar" || k === "phase"))).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <strong>Use my real power usage</strong>
      <span className="small">Skip the guesswork. Connect your meter through your retailer and we size from your actual last 12 months, half-hour by half-hour. About a minute: pick your retailer, enter the code they send, confirm.</span>
      {askEmail && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 8 }}>
        <label className="small">Email (for your results)<input name="email" type="email" required autoComplete="email" style={box} /></label>
        <label className="small">First name (optional)<input name="name" autoComplete="given-name" style={box} /></label>
        <label className="small">Solar panels already?<select name="solar" defaultValue={hidden.solar ?? "no"} style={box}><option value="no">No, panels and a battery</option><option value="yes">Yes, just a battery</option></select></label>
        <label className="small">Power supply<select name="phase" defaultValue={hidden.phase ?? "1"} style={box}><option value="1">Single phase, or not sure</option><option value="3">Three phase</option></select></label>
      </div>}
      {error && <div className="note small">{error}</div>}
      <button className="btn" type="submit">Connect my meter →</button>
      <span className="small muted">Read-only, through Fiskil (an accredited Consumer Data Right recipient). We see usage, meter and plan details only: no bills or payments. Stop any time.</span>
    </form>
  );
}
