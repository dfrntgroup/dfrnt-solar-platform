"use client";
// Shrinks phone photos in the browser (longest side 1800 px, JPEG). With a token, each photo uploads as soon as it's picked,
// with a tick when it lands; without JavaScript (or if the upload fails) the file stays in the form and goes with the submit.
import { useState } from "react";

async function shrink(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size < 700_000) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    const blob: Blob | null = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.82));
    return blob ? new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : file;
  } catch { return file; }
}

export function PhotoInput({ name, token, kind }: { name: string; token?: string; kind?: string }) {
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");
  async function picked(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget, original = input.files?.[0];
    if (!original) return;
    const file = await shrink(original);
    const put = (f: File) => { const dt = new DataTransfer(); dt.items.add(f); input.files = dt.files; };
    if (file !== original) put(file);
    if (!token || !kind) return;
    setState("sending"); setMsg("");
    const fd = new FormData(); fd.set("kind", kind); fd.set("file", file);
    try {
      const r = await fetch(`/api/v1/quotes/${token}/photo`, { method: "POST", body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((j as { error?: string }).error ?? "Upload failed");
      input.value = "";                       // uploaded: don't send it again with the form
      setState("done");
      document.dispatchEvent(new CustomEvent("photo-uploaded", { detail: kind }));
    } catch (err) { setState("error"); setMsg((err as Error).message); }
  }
  return (
    <span style={{ display: "block" }}>
      <input type="file" name={name} accept="image/*" capture="environment" onChange={picked} disabled={state === "sending"} />
      {state === "sending" && <span className="small muted" style={{ display: "block", marginTop: 4 }}>Uploading…</span>}
      {state === "done" && <span className="small ok" style={{ display: "block", marginTop: 4 }}>✓ Uploaded</span>}
      {state === "error" && <span className="small note" style={{ display: "block", marginTop: 4 }}>{msg}. It&apos;ll go when you press the button below instead.</span>}
    </span>
  );
}
