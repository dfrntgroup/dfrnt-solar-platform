// Google Calendar for installer crews: connect once (OAuth), read busy times (never event details), and keep our bookings
// in one "DFRNT Solar" calendar we create in their account. Needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.
import { db } from "@dfrnt/db";
import { seal, signState, unseal } from "./secret";
import { siteUrl } from "./messages";

export const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events.freebusy",    // busy times only, on calendars they can see
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly", // so they can tick which calendars count
  "https://www.googleapis.com/auth/calendar.app.created",          // the one calendar we create, and our events in it
  "openid", "email",
];
export const googleReady = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
const redirectUri = () => `${siteUrl()}/api/v1/google/callback`;

export function connectUrl(crewId: string, installerId: string, back: string) {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!, redirect_uri: redirectUri(), response_type: "code", scope: SCOPES.join(" "),
    access_type: "offline", prompt: "consent", include_granted_scopes: "true", state: signState({ crewId, installerId, back }),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

async function tokenCall(body: Record<string, string>) {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, ...body }),
  });
  const j = (await r.json()) as { access_token?: string; refresh_token?: string; expires_in?: number; id_token?: string; error?: string; error_description?: string };
  if (!r.ok || !j.access_token) throw new Error(`Google: ${j.error_description ?? j.error ?? r.status}`);
  return j;
}

const cache = new Map<string, { token: string; until: number }>();
async function accessToken(crewId: string): Promise<string> {
  const c = cache.get(crewId);
  if (c && c.until > Date.now() + 60_000) return c.token;
  const [row] = await db()`select refresh_token_enc from installer_crews where id = ${crewId} and source = 'google'`;
  if (!row?.refresh_token_enc) throw new Error("Calendar not connected");
  try {
    const j = await tokenCall({ grant_type: "refresh_token", refresh_token: unseal(row.refresh_token_enc as string) });
    cache.set(crewId, { token: j.access_token!, until: Date.now() + (j.expires_in ?? 3600) * 1000 });
    return j.access_token!;
  } catch (e) {
    await db()`update installer_crews set status = 'error', last_error = ${(e as Error).message} where id = ${crewId}`;
    throw e;
  }
}

async function gapi<T>(crewId: string, path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    ...init, headers: { authorization: `Bearer ${await accessToken(crewId)}`, "content-type": "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(8000),
  });
  if (r.status === 204) return {} as T;
  const j = (await r.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!r.ok) throw new Error(`Google Calendar ${r.status}: ${j.error?.message ?? ""}`);
  return j;
}

/** OAuth callback: store the refresh token (encrypted) and create the DFRNT Solar calendar. */
export async function finishConnect(code: string, crewId: string) {
  const j = await tokenCall({ grant_type: "authorization_code", code, redirect_uri: redirectUri() });
  if (!j.refresh_token) throw new Error("Google didn't return offline access. Remove DFRNT Solar from your Google account's third-party access and connect again.");
  const email = j.id_token ? (JSON.parse(Buffer.from(j.id_token.split(".")[1]!, "base64url").toString()) as { email?: string }).email ?? null : null;
  await db()`update installer_crews set source = 'google', refresh_token_enc = ${seal(j.refresh_token)}, google_email = ${email}, status = 'connected',
    last_error = null, connected_at = now() where id = ${crewId}`;
  cache.set(crewId, { token: j.access_token!, until: Date.now() + (j.expires_in ?? 3600) * 1000 });
  const [crew] = await db()`select c.name, c.dfrnt_calendar_id, i.business_name from installer_crews c join installers i on i.id = c.installer_id where c.id = ${crewId}`;
  if (!crew?.dfrnt_calendar_id) {
    const cal = await gapi<{ id: string }>(crewId, "/calendars", { method: "POST", body: JSON.stringify({ summary: `DFRNT Solar${crew?.name ? ` · ${crew.name}` : ""}`, description: "Installs booked through DFRNT Solar. Created and kept up to date by DFRNT Solar.", timeZone: "Australia/Brisbane" }) });
    await db()`update installer_crews set dfrnt_calendar_id = ${cal.id} where id = ${crewId}`;
  }
}

export async function listCalendars(crewId: string) {
  const j = await gapi<{ items?: { id: string; summary: string; primary?: boolean; accessRole: string }[] }>(crewId, "/users/me/calendarList?minAccessRole=freeBusyReader");
  return (j.items ?? []).map((c) => ({ id: c.id, name: c.summary, primary: !!c.primary }));
}

/** Busy blocks across the calendars the crew ticked (never our own DFRNT calendar: our bookings are counted from our records). */
export async function googleBusy(crewId: string, from: string, to: string, calendarIds: string[], dfrntCalendarId: string | null) {
  const ids = calendarIds.filter((c) => c !== dfrntCalendarId);
  const j = await gapi<{ calendars?: Record<string, { busy?: { start: string; end: string }[]; errors?: unknown[] }> }>(crewId, "/freeBusy", {
    method: "POST", body: JSON.stringify({ timeMin: `${from}T00:00:00+10:00`, timeMax: `${to}T23:59:59+10:00`, timeZone: "Australia/Brisbane", items: ids.map((id) => ({ id })) }),
  });
  return Object.values(j.calendars ?? {}).flatMap((c) => c.busy ?? []);
}

/** Write the booking into the crew's DFRNT Solar calendar: one all-day event per run of back-to-back dates (a Friday + Monday
 *  job is two events, so the weekend stays free). Old events for the job are removed first. Returns the new event ids. */
export async function writeEvents(crewId: string, calendarId: string, oldIds: string | null, e: { title: string; dates: string[]; description: string; location: string }) {
  for (const id of (oldIds ?? "").split(",").filter(Boolean)) await removeEvent(crewId, calendarId, id);
  const runs: string[][] = [];
  for (const d of e.dates) {
    const last = runs[runs.length - 1];
    const prev = last?.[last.length - 1];
    if (last && prev && Date.parse(`${d}T00:00:00Z`) - Date.parse(`${prev}T00:00:00Z`) === 86400_000) last.push(d); else runs.push([d]);
  }
  const ids: string[] = [];
  for (const run of runs) {
    const end = new Date(Date.parse(`${run[run.length - 1]}T00:00:00Z`) + 86400_000).toISOString().slice(0, 10);
    const r = await gapi<{ id: string }>(crewId, `/calendars/${encodeURIComponent(calendarId)}/events`, {
      method: "POST", body: JSON.stringify({ summary: e.title, description: e.description, location: e.location, start: { date: run[0] }, end: { date: end }, transparency: "opaque" }),
    });
    ids.push(r.id);
  }
  return ids.join(",");
}

export async function removeEvent(crewId: string, calendarId: string, eventId: string) {
  await gapi(crewId, `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, { method: "DELETE" }).catch(() => null);
}
