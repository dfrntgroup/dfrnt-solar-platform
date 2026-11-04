import { db } from "@dfrnt/db";
import { putPhoto } from "@/lib/storage";
import { allow } from "@/lib/ratelimit";
import { imageInfo, MIN_PHOTO_PX } from "@/lib/image-size";
import { isKind, photosFor, retakeKinds, retakeReceived } from "@/lib/photos";

export const dynamic = "force-dynamic";

/** Checkout step 3: one photo per request, uploaded the moment it's taken (no all-or-nothing form post on a weak connection). */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f]{36}$/.test(token)) return Response.json({ error: "Not found" }, { status: 404 });
  if (!(await allow("photo", 40))) return Response.json({ error: "Too many uploads — wait a few minutes" }, { status: 429 });
  const [q] = await db()`select id, status, input from quotes where token = ${token}`;
  if (!q) return Response.json({ error: "Not found" }, { status: 404 });
  const form = await req.formData().catch(() => null);
  const kind = String(form?.get("kind") ?? ""), file = form?.get("file");
  if (!isKind(kind) || !(file instanceof File) || !file.size) return Response.json({ error: "No photo" }, { status: 400 });
  // Before pricing: any photo this job type uses. While the installer is pricing: only a photo they've asked to see again (P4).
  const open = ["saved", "secured", "lapsed"].includes(q.status as string);
  const retake = !open && ["pricing_installer", "tech_review"].includes(q.status as string) && (await retakeKinds(q.id as string)).some((r) => r.kind === kind);
  if (!open && !retake) return Response.json({ error: "Photos are already with your installer" }, { status: 409 });
  if (open && !photosFor({ input: q.input as never }).includes(kind)) return Response.json({ error: "Not a photo this job needs" }, { status: 400 });
  if (file.size > 4_000_000) return Response.json({ error: "Photo too large" }, { status: 413 });
  // Judge the bytes, not the label the browser put on them.
  const bytes = await file.arrayBuffer();
  const info = imageInfo(new Uint8Array(bytes.slice(0, 65536)));
  if (!info) return Response.json({ error: "That isn't a photo. Take a photo with your camera and try again" }, { status: 400 });
  if (Math.max(info.width, info.height) < MIN_PHOTO_PX) return Response.json({ error: "That photo is too small to read. Take it again, closer and in focus" }, { status: 400 });
  const type = `image/${info.type}`;
  const path = `${q.id}/${kind}-${Date.now()}.${info.type === "jpeg" ? "jpg" : info.type}`;
  try { await putPhoto(path, bytes, type); }
  catch { return Response.json({ error: "Upload failed — try again" }, { status: 502 }); }
  await db()`insert into quote_photos (quote_id, kind, path, content_type, bytes) values (${q.id}, ${kind}, ${path}, ${type}, ${file.size})`;
  await db()`update quotes set checkout_at = now() where id = ${q.id}`;
  if (retake) await retakeReceived(q.id as string).catch(() => null);
  return Response.json({ ok: true, kind });
}
