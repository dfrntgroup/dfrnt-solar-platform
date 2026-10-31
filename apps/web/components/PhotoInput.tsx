"use client";
// Shrinks phone photos in the browser (longest side 1800 px, JPEG) so four photos fit well inside the upload limit.
export function PhotoInput({ name }: { name: string }) {
  async function shrink(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget, file = input.files?.[0];
    if (!file || !file.type.startsWith("image/") || file.size < 700_000) return;
    try {
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
      const c = document.createElement("canvas");
      c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
      c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
      const blob: Blob | null = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.82));
      if (!blob) return;
      const dt = new DataTransfer();
      dt.items.add(new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }));
      input.files = dt.files;
    } catch { /* keep the original */ }
  }
  return <input type="file" name={name} accept="image/*" capture="environment" onChange={shrink} />;
}
