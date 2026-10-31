// Private photo storage: Supabase Storage bucket 'site-photos' on Vercel; local disk when running locally.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const BUCKET = "site-photos";
let bucketReady = false;

export async function putPhoto(path: string, data: ArrayBuffer, contentType: string) {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    const file = join(process.env.LOCAL_STORAGE_DIR ?? "/tmp/dfrnt-storage", BUCKET, path);
    await mkdir(join(file, ".."), { recursive: true });
    await writeFile(file, Buffer.from(data));
    return;
  }
  const h = { authorization: `Bearer ${key}`, apikey: key };
  if (!bucketReady) {
    await fetch(`${url}/storage/v1/bucket`, { method: "POST", headers: { ...h, "content-type": "application/json" }, body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false }) });
    bucketReady = true;
  }
  const r = await fetch(`${url}/storage/v1/object/${BUCKET}/${path}`, { method: "POST", headers: { ...h, "content-type": contentType, "x-upsert": "true" }, body: data });
  if (!r.ok) throw new Error(`Photo upload failed (${r.status})`);
}

/** Short-lived signed URL for staff and installers to view a photo. */
export async function photoUrl(path: string): Promise<string | null> {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const r = await fetch(`${url}/storage/v1/object/sign/${BUCKET}/${path}`, { method: "POST", headers: { authorization: `Bearer ${key}`, apikey: key, "content-type": "application/json" }, body: JSON.stringify({ expiresIn: 3600 }) });
  if (!r.ok) return null;
  const j = (await r.json()) as { signedURL?: string };
  return j.signedURL ? `${url}/storage/v1${j.signedURL}` : null;
}
