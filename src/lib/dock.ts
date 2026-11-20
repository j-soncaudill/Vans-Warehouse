import { dataUrlToBlob, photoUrl, uploadPhoto, type CapturedPhoto } from "@/lib/photo";
import { PHOTOS_BUCKET, sb } from "@/lib/supabase";

/**
 * Dock receipts: a delivery logged while no admin was around to receive it.
 * Office staff pick the PM, photograph the box and the packing slip, and can
 * leave a note. An admin later receives it properly
 * (it becomes a box on the floor) or closes it.
 */
export type DockStatus = "waiting" | "received" | "closed";

export type DockReceipt = {
  id: number;
  pm: string;
  note: string | null;
  photoPath: string;
  thumbPath: string;
  slipPhotoPath: string;
  slipThumbPath: string;
  status: DockStatus;
  packageCode: string | null;
  closedAt: string | null;
  createdAt: string;
};

type Row = {
  id: number;
  pm: string;
  note: string | null;
  photo_path: string;
  thumb_path: string;
  slip_photo_path: string;
  slip_thumb_path: string;
  status: string;
  package_code: string | null;
  closed_at: string | null;
  created_at: string;
};

const COLS = "id, pm, note, photo_path, thumb_path, slip_photo_path, slip_thumb_path, status, package_code, closed_at, created_at";

const mapRow = (r: Row): DockReceipt => ({
  id: r.id,
  pm: r.pm,
  note: r.note,
  photoPath: r.photo_path,
  thumbPath: r.thumb_path,
  slipPhotoPath: r.slip_photo_path,
  slipThumbPath: r.slip_thumb_path,
  status: r.status === "received" || r.status === "closed" ? r.status : "waiting",
  packageCode: r.package_code,
  closedAt: r.closed_at,
  createdAt: r.created_at,
});

export const DOCK_NOTE_MAX = 500;

/** Uploads both photos, then saves the receipt. Needs a signal: nothing is queued offline. */
export async function logDockReceipt(input: { pm: string; note: string; box: CapturedPhoto; slip: CapturedPhoto }): Promise<DockReceipt> {
  const name = input.pm.trim().slice(0, 80);
  if (!name) throw new Error("Choose a PM.");
  const key = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const box = await uploadPhoto(`dock/${key}`, input.box);
  let slip: { photoPath: string; thumbPath: string };
  try {
    slip = await uploadPhoto(`dock/${key}/slip`, input.slip);
  } catch (err) {
    await removeFiles([box.photoPath, box.thumbPath]);
    throw err;
  }
  const note = input.note.trim().slice(0, DOCK_NOTE_MAX) || null;
  const { data, error } = await sb()
    .from("dock_receipts")
    .insert({
      pm: name,
      note,
      photo_path: box.photoPath,
      thumb_path: box.thumbPath,
      slip_photo_path: slip.photoPath,
      slip_thumb_path: slip.thumbPath,
    })
    .select(COLS)
    .single();
  if (error) {
    await removeFiles([box.photoPath, box.thumbPath, slip.photoPath, slip.thumbPath]);
    throw error;
  }
  return mapRow(data as Row);
}

async function removeFiles(paths: string[]) {
  try {
    await sb().storage.from(PHOTOS_BUCKET).remove(paths);
  } catch {
    /* leftover files are harmless */
  }
}

/** Waiting receipts, oldest first: the one that has sat longest gets handled first. */
export async function listWaitingDock(): Promise<DockReceipt[]> {
  const { data, error } = await sb().from("dock_receipts").select(COLS).eq("status", "waiting").order("created_at", { ascending: true });
  if (error) throw error;
  return (data as Row[]).map(mapRow);
}

export async function getDockReceipt(id: number): Promise<DockReceipt | null> {
  const { data, error } = await sb().from("dock_receipts").select(COLS).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? mapRow(data as Row) : null;
}

/** Received: it became the box with this code. */
export async function markDockReceived(id: number, packageCode: string): Promise<void> {
  const { error } = await sb()
    .from("dock_receipts")
    .update({ status: "received", package_code: packageCode, closed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

/** Closed without receiving (a duplicate, or it wasn't ours). The photos stay. */
export async function closeDockReceipt(id: number): Promise<void> {
  const { error } = await sb().from("dock_receipts").update({ status: "closed", closed_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

/** The receipt's two photos as captured photos, so the receive form can reuse them. */
export async function dockPhotos(r: DockReceipt): Promise<{ box: CapturedPhoto | null; slip: CapturedPhoto | null }> {
  const get = async (path: string): Promise<Blob | null> => {
    const url = photoUrl(path);
    if (!url) return null;
    try {
      if (url.startsWith("data:")) return dataUrlToBlob(url);
      const res = await fetch(url);
      return res.ok ? await res.blob() : null;
    } catch {
      return null;
    }
  };
  const [bf, bt, sf, st] = await Promise.all([get(r.photoPath), get(r.thumbPath), get(r.slipPhotoPath), get(r.slipThumbPath)]);
  return { box: bf && bt ? { full: bf, thumb: bt } : null, slip: sf && st ? { full: sf, thumb: st } : null };
}

/** What goes in the box's notes when it is received from a dock receipt. */
export function dockNoteForBox(r: DockReceipt): string {
  const when = new Date(r.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return [`Dock receipt ${when}.`, r.note?.trim()].filter(Boolean).join(" ");
}
