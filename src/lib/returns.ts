import { STATION_PREFIX, isReturnCode, mintReturnCode, normalizeCode, type ReturnType } from "@/lib/codes";
import { type CapturedPhoto } from "@/lib/photo";
import { IS_DEMO, PHOTOS_BUCKET, isTableMissing, sb } from "@/lib/supabase";

export type ReturnStatus = "open" | "closed";

export type Ret = {
  id: number;
  code: string;
  type: ReturnType;
  status: ReturnStatus;
  returnedBy: string | null;
  vendor: string | null;
  jobName: string | null;
  notes: string | null;
  photoPath: string | null;
  thumbPath: string | null;
  createdAt: string;
  updatedAt: string | null;
  closedAt: string | null;
  closedBy: string | null;
  closeNote: string | null;
};

export type RetRow = {
  id: number;
  code: string;
  type: string;
  status: string;
  returned_by: string | null;
  vendor: string | null;
  job_name: string | null;
  notes: string | null;
  photo_path: string | null;
  thumb_path: string | null;
  created_at: string;
  updated_at: string | null;
  closed_at: string | null;
  closed_by: string | null;
  close_note: string | null;
};

const COLUMNS =
  "id, code, type, status, returned_by, vendor, job_name, notes, photo_path, thumb_path, created_at, updated_at, closed_at, closed_by, close_note";

const TYPES: ReturnType[] = ["vendor", "stock", "warranty", "general"];

export function mapReturn(r: RetRow): Ret {
  return {
    id: Number(r.id),
    code: r.code,
    type: (TYPES as string[]).includes(r.type) ? (r.type as ReturnType) : "general",
    status: r.status === "closed" ? "closed" : "open",
    returnedBy: r.returned_by,
    vendor: r.vendor,
    jobName: r.job_name,
    notes: r.notes,
    photoPath: r.photo_path,
    thumbPath: r.thumb_path,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    closedAt: r.closed_at,
    closedBy: r.closed_by,
    closeNote: r.close_note,
  };
}

function fail(error: { message?: string; code?: string } | null, fallback: string): never {
  if (isTableMissing(error)) throw new Error("Returns are not set up yet. Run supabase/migrations/002_locations_returns.sql in Supabase.");
  throw new Error(error?.message || fallback);
}

const text = (v: string | null | undefined, max: number) => {
  const t = (v ?? "").trim().slice(0, max);
  return t ? t : null;
};

export async function listReturns(status: ReturnStatus | "all"): Promise<Ret[]> {
  let q = sb().from("returns").select(COLUMNS);
  if (status !== "all") q = q.eq("status", status);
  q = status === "closed" ? q.order("closed_at", { ascending: false }) : q.order("created_at", { ascending: false });
  const { data, error } = await q;
  if (error) fail(error, "Could not load returns.");
  return ((data ?? []) as RetRow[]).map(mapReturn);
}

export async function getReturn(raw: string): Promise<Ret | null> {
  const code = normalizeCode(raw);
  const { data, error } = await sb().from("returns").select(COLUMNS).eq("code", code).maybeSingle();
  if (error) fail(error, "Could not look up that return.");
  return data ? mapReturn(data as RetRow) : null;
}

async function patchReturn(code: string, patch: Record<string, unknown>): Promise<Ret> {
  const { data, error } = await sb().from("returns").update(patch).eq("code", code).select(COLUMNS).maybeSingle();
  if (error) fail(error, "Could not save.");
  if (!data) throw new Error("That return is gone.");
  return mapReturn(data as RetRow);
}

/** Mints a code for the type and saves an open return with who brought it back. */
export async function startReturn(type: ReturnType, returnedBy: string): Promise<Ret> {
  const who = returnedBy.trim().slice(0, 80);
  if (!who) throw new Error("Enter who's returning it.");
  for (let i = 0; i < 20; i += 1) {
    const code = mintReturnCode(type);
    const { data, error } = await sb().from("returns").insert({ code, type, status: "open", returned_by: who }).select(COLUMNS).single();
    if (!error) return mapReturn(data as RetRow);
    if (error.code !== "23505") fail(error, "Could not start the return.");
  }
  throw new Error("Could not find a free return code. Try again.");
}

export type ReturnDetails = { returnedBy: string; vendor: string; jobName: string; notes: string };

export function detailsFrom(r: Ret): ReturnDetails {
  return { returnedBy: r.returnedBy ?? "", vendor: r.vendor ?? "", jobName: r.jobName ?? "", notes: r.notes ?? "" };
}

export async function saveReturnDetails(code: string, d: ReturnDetails): Promise<Ret> {
  if (!d.returnedBy.trim()) throw new Error("Enter who's returning it.");
  return patchReturn(code, {
    returned_by: text(d.returnedBy, 80),
    vendor: text(d.vendor, 200),
    job_name: text(d.jobName, 120),
    notes: text(d.notes, 2000),
  });
}

/** The code on the item never changes; only what kind of return it is. */
export function reclassifyReturn(code: string, type: ReturnType): Promise<Ret> {
  return patchReturn(code, { type });
}

export function closeReturn(code: string, closedBy: string, note: string): Promise<Ret> {
  const who = closedBy.trim().slice(0, 80);
  if (!who) throw new Error("Enter who closed it out.");
  return patchReturn(code, { status: "closed", closed_at: new Date().toISOString(), closed_by: who, close_note: text(note, 500) });
}

export function reopenReturn(code: string): Promise<Ret> {
  return patchReturn(code, { status: "open", closed_at: null, closed_by: null, close_note: null });
}

// ------------------------------------------------------------------ photos

const photoDir = (code: string) => `returns/${code}`;

export async function setReturnPhoto(code: string, photo: CapturedPhoto): Promise<Ret> {
  const stamp = Date.now();
  const photoPath = `${photoDir(code)}/${stamp}.jpg`;
  const thumbPath = `${photoDir(code)}/${stamp}-t.jpg`;
  const bucket = sb().storage.from(PHOTOS_BUCKET);
  const opts = { contentType: "image/jpeg", upsert: true };
  const a = await bucket.upload(photoPath, photo.full, opts);
  if (a.error) throw new Error("Photo did not upload. Check the signal and try again.");
  const b = await bucket.upload(thumbPath, photo.thumb, opts);
  if (b.error) throw new Error("Photo did not upload. Check the signal and try again.");
  const before = await getReturn(code);
  const ret = await patchReturn(code, { photo_path: photoPath, thumb_path: thumbPath });
  const old = [before?.photoPath, before?.thumbPath].filter((p): p is string => Boolean(p));
  if (old.length) await bucket.remove(old).catch(() => undefined);
  return ret;
}

async function removeReturnPhotos(code: string) {
  const bucket = sb().storage.from(PHOTOS_BUCKET);
  const { data } = await bucket.list(photoDir(code), { limit: 1000 });
  const paths = (data ?? []).map((f) => `${photoDir(code)}/${f.name}`);
  if (paths.length) await bucket.remove(paths);
}

export async function removeReturn(code: string): Promise<void> {
  const { error } = await sb().from("returns").delete().eq("code", code);
  if (error) fail(error, "Could not remove it.");
  await removeReturnPhotos(code).catch(() => undefined);
}

// ------------------------------------------------------------------ station

/** The token printed in the returns station QR. Lives in the settings table. */
export async function stationToken(): Promise<string | null> {
  if (IS_DEMO) return "demo";
  const { data, error } = await sb().from("settings").select("value").eq("key", "return_station_token").maybeSingle();
  if (error) return null;
  return (data as { value?: string } | null)?.value ?? null;
}

export function stationPayload(token: string): string {
  return `${STATION_PREFIX}${token}`;
}

/** True when a scan is the returns station QR posted in the warehouse. */
export async function isStationScan(raw: string): Promise<boolean> {
  const token = await stationToken();
  return Boolean(token) && raw.trim() === stationPayload(token as string);
}

export { isReturnCode };
