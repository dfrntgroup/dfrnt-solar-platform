// One-button form that posts fixed hidden fields (avoids relying on the submit button's value).
export function Step({ action, fields, label, ghost }: { action: (f: FormData) => Promise<void>; fields: Record<string, string>; label: string; ghost?: boolean }) {
  return (
    <form action={action} style={{ display: "inline" }}>
      {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <button className={`btn sm${ghost ? " ghost" : ""}`} type="submit">{label}</button>
    </form>
  );
}
