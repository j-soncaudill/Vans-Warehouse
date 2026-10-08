import { isPlausibleCode, mintCode, normalizeCode } from "@/lib/codes";
import { formToRow, type FormValues } from "@/lib/form";
import { cleanLocation, moveRow } from "@/lib/locations";
import { removePhotoFiles, uploadPhoto, type CapturedPhoto } from "@/lib/photo";
import { stickerPath, uploadSticker } from "@/lib/sticker";
import { notifyChanged } from "@/lib/live";
import * as offline from "@/lib/offline";
import type { CheckoutOp, MoveOp, Op, ReceiveOp } from "@/lib/offline";
import { BARCODES_BUCKET, PHOTOS_BUCKET, isTableMissing, sb } from "@/lib/supabase";

export type PkgStatus = "on_floor" | "checked_out";

export type Pkg = {
  id: number;
  code: string;
  jobName: string;
  poNumber: string | null;
  vendor: string | null;
  deliveredBy: string | null;
  receivedBy: string | null;
  pm: string | null;
  packingSlip: boolean | null;
  quantities: string | null;
  damaged: boolean | null;
  colorTag: string | null;
  notes: string | null;
  status: PkgStatus;
  receivedAt: string;
  checkedOutTo: string | null;
  checkedOutAt: string | null;
  barcodePath: string | null;
  photoPath: string | null;
  thumbPath: string | null;
  lastLocation: string | null;
  locationAt: string | null;
  updatedAt: string | null;
  /** Here before Floorcast; receivedAt is approximate. */
  legacy: boolean;
  slipPhotoPath: string | null;
  slipThumbPath: string | null;
};

export type PkgRow = {
  id: number;
  code: string;
  job_name: string;
  po_number: string | null;
  vendor: string | null;
  delivered_by: string | null;
  received_by: string | null;
  pm: string | null;
  packing_slip_received: boolean | null;
  quantities: string | null;
  damaged: boolean | null;
  color_tag: string | null;
  notes: string | null;
  status: string;
  received_at: string;
  checked_out_to: string | null;
  checked_out_at: string | null;
  barcode_path: string | null;
  photo_path: string | null;
  thumb_path: string | null;
  last_location: string | null;
  location_at: string | null;
  updated_at: string | null;
  legacy?: boolean | null;
  slip_photo_path?: string | null;
  slip_thumb_path?: string | null;
};

const COLUMNS =
  "id, code, job_name, po_number, vendor, delivered_by, received_by, pm, packing_slip_received, quantities, damaged, color_tag, notes, status, received_at, checked_out_to, checked_out_at, barcode_path, photo_path, thumb_path, last_location, location_at, updated_at, legacy, slip_photo_path, slip_thumb_path";

export function mapRow(r: PkgRow): Pkg {
  return {
    id: Number(r.id),
    code: r.code,
    jobName: r.job_name,
    poNumber: r.po_number,
    vendor: r.vendor,
    deliveredBy: r.delivered_by,
    receivedBy: r.received_by,
    pm: r.pm,
    packingSlip: r.packing_slip_received,
    quantities: r.quantities,
    damaged: r.damaged,
    colorTag: r.color_tag,
    notes: r.notes,
    status: r.status === "checked_out" ? "checked_out" : "on_floor",
    receivedAt: r.received_at,
    checkedOutTo: r.checked_out_to,
    checkedOutAt: r.checked_out_at,
    barcodePath: r.barcode_path,
    photoPath: r.photo_path,
    thumbPath: r.thumb_path,
    lastLocation: r.last_location ?? null,
    locationAt: r.location_at ?? null,
    updatedAt: r.updated_at,
    legacy: r.legacy === true,
    slipPhotoPath: r.slip_photo_path ?? null,
    slipThumbPath: r.slip_thumb_path ?? null,
  };
}

function fail(error: { message?: string; code?: string } | null, fallback: string): never {
  if (isTableMissing(error)) throw new Error("The database is not set up. Run supabase/schema.sql in Supabase.");
  throw new Error(error?.message || fallback);
}

export async function listPackages(status: PkgStatus | "all"): Promise<Pkg[]> {
  await offline.loaded;
  // No signal: the list as this phone last saw it, plus anything done offline.
  const fallback = () => {
    const cached = offline.cachedList(status);
    if (cached) return cached;
    throw new Error("No signal, and this phone hasn't loaded the list yet.");
  };
  if (offline.isOffline()) return fallback();
  let q = sb().from("packages").select(COLUMNS);
  if (status !== "all") q = q.eq("status", status);
  q = status === "checked_out" ? q.order("checked_out_at", { ascending: false }) : q.order("received_at", { ascending: false });
  const { data, error } = await q;
  if (error) {
    if (offline.isNetworkError(error)) return fallback();
    fail(error, "Could not load the list.");
  }
  const list = ((data ?? []) as PkgRow[]).map(mapRow);
  offline.rememberList(status, list);
  return offline.withPending(list, status);
}

/** Straight from the server, no offline copy. Sync uses this to see what other phones did. */
async function fetchPackage(code: string): Promise<Pkg | null> {
  const { data, error } = await sb().from("packages").select(COLUMNS).eq("code", code).maybeSingle();
  if (error) fail(error, "Could not look up that code.");
  return data ? mapRow(data as PkgRow) : null;
}

export async function getPackage(raw: string): Promise<Pkg | null> {
  await offline.loaded;
  const code = normalizeCode(raw);
  const fallback = () => {
    const cached = offline.cachedGet(code);
    if (cached !== undefined) return cached;
    throw new Error("No signal, and this phone hasn't loaded the list yet.");
  };
  if (offline.isOffline()) return fallback();
  try {
    const pkg = await fetchPackage(code);
    offline.rememberOne(code, pkg);
    // A box received offline exists only on this phone until it syncs.
    return pkg ? (offline.withPending([pkg], "all")[0] ?? pkg) : (offline.cachedGet(code) ?? null);
  } catch (err) {
    if (offline.isNetworkError(err)) return fallback();
    throw err;
  }
}

async function update(code: string, patch: Record<string, unknown>, guard?: PkgStatus): Promise<Pkg | null> {
  let q = sb().from("packages").update(patch).eq("code", code);
  if (guard) q = q.eq("status", guard);
  const { data, error } = await q.select(COLUMNS).maybeSingle();
  if (error) fail(error, "Could not save.");
  return data ? mapRow(data as PkgRow) : null;
}

export type ReceiveResult = { pkg: Pkg; warnings: string[]; queued?: boolean };

class DuplicateCode extends Error {
  constructor(code: string) {
    super(`${code} is already in the warehouse.`);
  }
}

/**
 * existingCode: the code already on the box (scanned or typed).
 * Leave it empty to mint a new VW- code.
 */
export async function receivePackage(
  values: FormValues,
  existingCode: string | null,
  photo: CapturedPhoto | null,
  slip: CapturedPhoto | null = null,
): Promise<ReceiveResult> {
  const row = formToRow(values);
  const location = cleanLocation(values.location);
  if (!location) throw new Error("Pick where it is, or type the location under Other.");
  let code: string;
  if (existingCode) {
    code = normalizeCode(existingCode);
    if (!isPlausibleCode(code)) throw new Error("That barcode does not look valid. Use letters, numbers, dot, dash.");
    if (await getPackage(code).catch(() => null)) throw new Error(`${code} is already in the warehouse. Scan it to open it.`);
  } else {
    code = mintCode();
    for (let i = 0; i < 8 && (await getPackage(code).catch(() => null)); i += 1) code = mintCode();
  }
  const queue = async (): Promise<ReceiveResult> => {
    const op: ReceiveOp = { kind: "receive", id: offline.newOpId(), at: new Date().toISOString(), code, jobName: row.job_name, values: { ...values, location }, existing: !!existingCode, photo, slip };
    await offline.enqueue(op);
    return { pkg: offline.pendingPkg(op), warnings: [], queued: true };
  };
  if (offline.isOffline()) return queue();
  try {
    return await receiveNow(values, code, photo, slip);
  } catch (err) {
    if (offline.isNetworkError(err)) return queue();
    throw err;
  }
}

/** The actual receive. `at` is when it happened (an offline receive syncs with its own time). */
async function receiveNow(values: FormValues, code: string, photo: CapturedPhoto | null, slip: CapturedPhoto | null, at?: string): Promise<ReceiveResult> {
  const row = formToRow(values);
  const location = cleanLocation(values.location)!;
  const when = at ?? new Date().toISOString();
  const { data, error } = await sb()
    .from("packages")
    .insert({ ...(at && !("received_at" in row) ? { received_at: at } : {}), ...row, code, status: "on_floor", last_location: location, location_at: when })
    .select(COLUMNS)
    .single();
  if (error) {
    if (error.code === "23505") throw new DuplicateCode(code);
    fail(error, "Receive failed.");
  }
  let pkg = mapRow(data as PkgRow);
  const warnings: string[] = [];
  const moved = await sb().from("package_moves").insert({ ...moveRow(code, null, location, row.received_by), ...(at ? { moved_at: at } : {}) });
  if (moved.error) warnings.push("The location was saved, but its history entry was not.");
  const patch: Record<string, unknown> = {};

  const barcodePath = await uploadSticker(pkg);
  if (barcodePath) patch.barcode_path = barcodePath;
  else warnings.push("Sticker file did not upload. You can still save or print it.");

  if (photo) {
    try {
      const paths = await uploadPhoto(code, photo);
      patch.photo_path = paths.photoPath;
      patch.thumb_path = paths.thumbPath;
    } catch (err) {
      warnings.push(err instanceof Error ? err.message : "Photo did not upload.");
    }
  }
  if (slip) {
    try {
      const paths = await uploadPhoto(code, slip, "slip");
      patch.slip_photo_path = paths.photoPath;
      patch.slip_thumb_path = paths.thumbPath;
    } catch (err) {
      warnings.push(err instanceof Error ? `Packing slip: ${err.message}` : "Packing slip photo did not upload.");
    }
  }
  if (Object.keys(patch).length) pkg = (await update(code, patch)) ?? pkg;
  return { pkg, warnings };
}

export async function editPackage(code: string, values: FormValues): Promise<Pkg> {
  const before = await getPackage(code);
  const pkg = await update(code, formToRow(values), "on_floor");
  if (!pkg) throw new Error("It was checked out or removed. Reload and try again.");
  // The sticker shows the job and received date, so redraw it when either changes.
  if (before && (before.jobName !== pkg.jobName || before.legacy !== pkg.legacy || before.receivedAt !== pkg.receivedAt)) {
    await uploadSticker(pkg);
  }
  return pkg;
}

/** New photo replaces the old one. Allowed only while the box is on the floor. */
export async function replacePhoto(code: string, photo: CapturedPhoto): Promise<Pkg> {
  const current = await getPackage(code);
  if (!current) throw new Error("That package is gone.");
  if (current.status !== "on_floor") throw new Error("Photos are locked after checkout.");
  const paths = await uploadPhoto(code, photo);
  const pkg = await update(code, { photo_path: paths.photoPath, thumb_path: paths.thumbPath }, "on_floor");
  if (!pkg) {
    await sb().storage.from(PHOTOS_BUCKET).remove([paths.photoPath, paths.thumbPath]);
    throw new Error("Photos are locked after checkout.");
  }
  await removePhotoFiles(code, [paths.photoPath, paths.thumbPath]).catch(() => undefined);
  return pkg;
}

/** Adds or replaces the packing slip photo (Administrators). Works on the floor or checked out. */
export async function replaceSlipPhoto(code: string, photo: CapturedPhoto): Promise<Pkg> {
  const paths = await uploadPhoto(code, photo, "slip");
  const pkg = await update(code, { slip_photo_path: paths.photoPath, slip_thumb_path: paths.thumbPath });
  if (!pkg) {
    await sb().storage.from(PHOTOS_BUCKET).remove([paths.photoPath, paths.thumbPath]);
    throw new Error("That package is gone.");
  }
  await removePhotoFiles(code, [paths.photoPath, paths.thumbPath], "slip").catch(() => undefined);
  return pkg;
}

export async function checkOut(code: string, takenBy: string): Promise<Pkg> {
  const who = takenBy.trim().slice(0, 80);
  if (!who) throw new Error("Enter who it was checked out by.");
  const queue = async () => {
    const cur = offline.cachedGet(code);
    if (cur?.status === "checked_out") throw new Error("Already checked out, or removed.");
    const op: CheckoutOp = { kind: "checkout", id: offline.newOpId(), at: new Date().toISOString(), code, jobName: cur?.jobName ?? code, who };
    await offline.enqueue(op);
    return offline.cachedGet(code) ?? ({ ...(cur as Pkg), status: "checked_out", checkedOutTo: who, checkedOutAt: op.at } as Pkg);
  };
  if (offline.isOffline()) return queue();
  try {
    const pkg = await update(code, { status: "checked_out", checked_out_to: who, checked_out_at: new Date().toISOString() }, "on_floor");
    if (!pkg) throw new Error("Already checked out, or removed.");
    return pkg;
  } catch (err) {
    if (offline.isNetworkError(err)) return queue();
    throw err;
  }
}

export type BatchResult = { done: Pkg[]; skipped: Array<{ code: string; jobName: string; reason: string }> };

/** Checks several boxes out to one person. Boxes someone else already took are skipped, not overwritten. */
export async function checkOutMany(pkgs: Array<Pick<Pkg, "code" | "jobName">>, takenBy: string, onEach?: (done: number) => void): Promise<BatchResult> {
  const who = takenBy.trim().slice(0, 80);
  if (!who) throw new Error("Enter who it was checked out by.");
  const result: BatchResult = { done: [], skipped: [] };
  let n = 0;
  for (const p of pkgs) {
    try {
      result.done.push(await checkOut(p.code, who));
    } catch {
      const now = await getPackage(p.code).catch(() => null);
      const reason = !now ? "removed" : now.status === "checked_out" ? `already out to ${now.checkedOutTo ?? "someone"}` : "did not save";
      result.skipped.push({ code: p.code, jobName: p.jobName, reason });
    }
    onEach?.((n += 1));
  }
  return result;
}

/** Records where the box is now, plus a history entry. Works on the floor or checked out. */
export async function movePackage(code: string, to: string, movedBy: string): Promise<Pkg> {
  const place = cleanLocation(to);
  const who = movedBy.trim().slice(0, 80);
  if (!place) throw new Error("Pick where it went, or type it under Other.");
  if (!who) throw new Error("Enter who moved it.");
  const current = await getPackage(code);
  if (!current) throw new Error("That package is gone.");
  if (current.lastLocation === place) throw new Error(`It's already marked at ${place}.`);
  const queue = async () => {
    const op: MoveOp = { kind: "move", id: offline.newOpId(), at: new Date().toISOString(), code, jobName: current.jobName, from: current.lastLocation, to: place, by: who };
    await offline.enqueue(op);
    return offline.cachedGet(code) ?? { ...current, lastLocation: place, locationAt: op.at };
  };
  if (offline.isOffline()) return queue();
  try {
    return await moveNow(code, current.lastLocation, place, who);
  } catch (err) {
    if (offline.isNetworkError(err)) return queue();
    throw err;
  }
}

/**
 * Records a move. With `at` (an offline move syncing later), the history keeps
 * the real time, and the box's place only changes if no newer move got there first.
 */
async function moveNow(code: string, from: string | null, place: string, who: string, at?: string): Promise<Pkg> {
  const when = at ?? new Date().toISOString();
  const { error } = await sb()
    .from("package_moves")
    .insert({ ...moveRow(code, from, place, who), ...(at ? { moved_at: at } : {}) });
  if (error) {
    if (offline.isNetworkError(error)) throw error;
    if (!(await fetchPackage(code))) throw new Error("That package is gone.");
    throw new Error("The move did not save.");
  }
  let q = sb().from("packages").update({ last_location: place, location_at: when }).eq("code", code);
  if (at) q = q.or(`location_at.is.null,location_at.lt."${at}"`);
  const { data, error: upErr } = await q.select(COLUMNS).maybeSingle();
  if (upErr) fail(upErr, "Could not save.");
  const pkg = data ? mapRow(data as PkgRow) : await fetchPackage(code);
  if (!pkg) throw new Error("That package is gone.");
  return pkg;
}

export async function returnToFloor(code: string): Promise<Pkg> {
  const pkg = await update(code, { status: "on_floor" }, "checked_out");
  if (!pkg) throw new Error("Already on the floor, or removed.");
  return pkg;
}

// ------------------------------------------------------------------ offline sync

const clock = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
let syncRun: Promise<number> | null = null;

/**
 * Sends everything done offline, oldest first. Another phone's change always wins:
 * a box already checked out stays with that person, a newer move keeps its place,
 * a code already received stays as received. Those land in "Couldn't sync".
 * Returns how many actions went through.
 */
export function syncOutbox(): Promise<number> {
  if (syncRun) return syncRun;
  syncRun = (async () => {
    await offline.loaded;
    if (offline.isOffline() || !offline.pendingOps().length) {
      syncRun = null;
      return 0;
    }
    offline.setSyncing(true);
    let done = 0;
    let retry = false;
    try {
      for (const op of offline.pendingOps()) {
        if (!offline.pendingOps().some((o) => o.id === op.id)) continue; // dropped with a failed receive
        try {
          const failure = await syncOne(op);
          offline.finish(op, failure ?? undefined);
          if (failure && op.kind === "receive") offline.dropFollowers(op.code, `${op.code} was never received, so this didn't apply.`);
          if (!failure) done += 1;
        } catch (err) {
          if (offline.isNetworkError(err)) {
            // Signal is flaky (or only just came back): try again shortly.
            retry = true;
            break;
          }
          offline.finish(op, err instanceof Error ? err.message : "Did not sync.");
        }
      }
    } finally {
      offline.setSyncing(false);
      syncRun = null;
      notifyChanged();
      if (retry && !offline.isOffline()) window.setTimeout(() => void syncOutbox(), 3000);
    }
    return done;
  })();
  return syncRun;
}

/** One action. Returns a "Couldn't sync" message, or null when it went through. */
async function syncOne(op: Op): Promise<string | null> {
  if (op.kind === "receive") {
    try {
      const r = await receiveNow(op.values, op.code, op.photo, op.slip, op.at);
      offline.rememberOne(op.code, r.pkg);
      return null;
    } catch (err) {
      if (err instanceof DuplicateCode) {
        const other = await fetchPackage(op.code);
        return op.existing
          ? `${op.code} was already received on another phone${other ? ` (${other.jobName})` : ""}.`
          : `${op.code} clashed with a box another phone received. Receive ${op.jobName} again and put the new sticker on it.`;
      }
      throw err;
    }
  }
  const now = await fetchPackage(op.code);
  if (!now) return `${op.code} was removed before this synced.`;
  if (op.kind === "move") {
    const pkg = await moveNow(op.code, op.from, op.to, op.by, op.at);
    offline.rememberOne(op.code, pkg);
    return null;
  }
  // Check-out: first to sync wins.
  if (now.status === "checked_out") return `${op.code} was already checked out to ${now.checkedOutTo ?? "someone"} at ${clock(now.checkedOutAt ?? op.at)}. Yours to ${op.who} wasn't applied.`;
  const pkg = await update(op.code, { status: "checked_out", checked_out_to: op.who, checked_out_at: op.at }, "on_floor");
  if (!pkg) {
    const again = await fetchPackage(op.code);
    return `${op.code} was already checked out to ${again?.checkedOutTo ?? "someone"}. Yours to ${op.who} wasn't applied.`;
  }
  offline.rememberOne(op.code, pkg);
  return null;
}

/** Deletes the row, its sticker, and every photo file for that code. */
export async function removePackage(code: string): Promise<void> {
  const current = await getPackage(code);
  const { error } = await sb().from("packages").delete().eq("code", code);
  if (error) fail(error, "Could not remove it.");
  await sb()
    .storage.from(BARCODES_BUCKET)
    .remove([current?.barcodePath || stickerPath(code)])
    .catch(() => undefined);
  await removePhotoFiles(code).catch(() => undefined);
  await removePhotoFiles(code, [], "slip").catch(() => undefined);
}
