import JSZip from "jszip";
import { isPlausibleCode, isReturnCode, normalizeCode } from "@/lib/codes";
import { listAllMoves } from "@/lib/locations";
import { COLOR_TAGS } from "@/lib/form";
import { listPackages, type Pkg } from "@/lib/packages";
import { dataUrlToBlob, photoFromFile, uploadPhoto } from "@/lib/photo";
import { renderSticker, stickerPath } from "@/lib/sticker";
import { listReturns, setReturnPhoto, type Ret } from "@/lib/returns";
import { BARCODES_BUCKET, PHOTOS_BUCKET, sb } from "@/lib/supabase";

/**
 * Zip layout:
 *   packages.json   every record (the restore source of truth)
 *   packages.csv    same records for a spreadsheet
 *   stickers/<code>.png
 *   photos/<code>.jpg   full compressed photo
 *   slip-photos/<code>.jpg  packing slip photo
 *   moves.json      location history, oldest first
 *   returns.json    every return (and returns.csv)
 *   return-photos/<code>.jpg
 */
export const CSV_COLUMNS = [
  "code",
  "jobName",
  "poNumber",
  "vendor",
  "deliveredBy",
  "receivedBy",
  "pm",
  "packingSlip",
  "quantities",
  "damaged",
  "colorTag",
  "notes",
  "status",
  "receivedAt",
  "checkedOutTo",
  "checkedOutAt",
  "lastLocation",
  "locationAt",
  "legacy",
  "stickerFile",
  "photoFile",
  "slipPhotoFile",
] as const;

export type BackupRecord = Omit<Pkg, "id" | "barcodePath" | "photoPath" | "thumbPath" | "updatedAt" | "slipPhotoPath" | "slipThumbPath"> & {
  stickerFile: string | null;
  photoFile: string | null;
  slipPhotoFile: string | null;
};

export function csvCell(value: unknown): string {
  if (value == null) return "";
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(records: BackupRecord[]): string {
  return csvTable(CSV_COLUMNS, records as unknown as Array<Record<string, unknown>>);
}

function csvTable(columns: readonly string[], rows: Array<Record<string, unknown>>): string {
  const lines = [columns.join(","), ...rows.map((r) => columns.map((k) => csvCell(r[k])).join(","))];
  return `﻿${lines.join("\r\n")}\r\n`;
}

export type ReturnRecord = Omit<Ret, "id" | "photoPath" | "thumbPath" | "updatedAt"> & { photoFile: string | null };
const RETURN_CSV_COLUMNS = ["code", "type", "status", "returnedBy", "vendor", "jobName", "notes", "createdAt", "closedAt", "closedBy", "closeNote", "photoFile"] as const;

export function backupName(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `floorcast-backup-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}.zip`;
}

async function download(bucket: string, path: string | null): Promise<Blob | null> {
  if (!path) return null;
  const { data, error } = await sb().storage.from(bucket).download(path);
  return !error && data && data.size > 0 ? data : null;
}

export async function buildBackup(onProgress?: (done: number, total: number) => void) {
  const packages = await listPackages("all");
  const zip = new JSZip();
  const records: BackupRecord[] = [];
  let i = 0;
  for (const p of packages) {
    let sticker = await download(BARCODES_BUCKET, p.barcodePath);
    if (!sticker) sticker = await renderSticker(p).catch(() => null);
    const photo = await download(PHOTOS_BUCKET, p.photoPath);
    const slip = await download(PHOTOS_BUCKET, p.slipPhotoPath);
    const stickerFile = sticker ? `stickers/${p.code}.png` : null;
    const photoFile = photo ? `photos/${p.code}.jpg` : null;
    const slipPhotoFile = slip ? `slip-photos/${p.code}.jpg` : null;
    if (sticker && stickerFile) zip.file(stickerFile, sticker);
    if (photo && photoFile) zip.file(photoFile, photo);
    if (slip && slipPhotoFile) zip.file(slipPhotoFile, slip);
    records.push({
      code: p.code,
      jobName: p.jobName,
      poNumber: p.poNumber,
      vendor: p.vendor,
      deliveredBy: p.deliveredBy,
      receivedBy: p.receivedBy,
      pm: p.pm,
      packingSlip: p.packingSlip,
      quantities: p.quantities,
      damaged: p.damaged,
      colorTag: p.colorTag,
      notes: p.notes,
      status: p.status,
      receivedAt: p.receivedAt,
      checkedOutTo: p.checkedOutTo,
      checkedOutAt: p.checkedOutAt,
      lastLocation: p.lastLocation,
      locationAt: p.locationAt,
      legacy: p.legacy,
      stickerFile,
      photoFile,
      slipPhotoFile,
    });
    onProgress?.((i += 1), packages.length);
  }
  zip.file("packages.json", JSON.stringify({ app: "floorcast", version: 1, exportedAt: new Date().toISOString(), packages: records }, null, 2));
  zip.file("packages.csv", toCsv(records));

  const moves = await listAllMoves();
  zip.file("moves.json", JSON.stringify({ moves: moves.map(({ code, from, to, by, at }) => ({ code, from, to, by, at })) }, null, 2));

  const returns = await listReturns("all");
  const returnRecords: ReturnRecord[] = [];
  for (const r of returns) {
    const photo = await download(PHOTOS_BUCKET, r.photoPath);
    const photoFile = photo ? `return-photos/${r.code}.jpg` : null;
    if (photo && photoFile) zip.file(photoFile, photo);
    const { id: _id, photoPath: _p, thumbPath: _t, updatedAt: _u, ...rest } = r;
    returnRecords.push({ ...rest, photoFile });
  }
  zip.file("returns.json", JSON.stringify({ returns: returnRecords }, null, 2));
  zip.file("returns.csv", csvTable(RETURN_CSV_COLUMNS, returnRecords as unknown as Array<Record<string, unknown>>));
  const blob = await zip.generateAsync({ type: "blob", mimeType: "application/zip", compression: "DEFLATE" });
  return { blob, filename: backupName(), count: records.length, returns: returnRecords.length };
}

const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const bool = (v: unknown) => (typeof v === "boolean" ? v : null);
const date = (v: unknown) => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? v : null);

/** Turns one packages.json entry into a row. Returns null for junk. */
export function recordToRow(raw: unknown) {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const code = typeof r.code === "string" ? normalizeCode(r.code) : "";
  const job = str(r.jobName, 120);
  if (!code || !isPlausibleCode(code) || !job) return null;
  const color = str(r.colorTag, 20);
  const status = r.status === "checked_out" ? "checked_out" : "on_floor";
  return {
    code,
    job_name: job,
    po_number: str(r.poNumber, 60),
    vendor: str(r.vendor, 200),
    delivered_by: str(r.deliveredBy, 120),
    received_by: str(r.receivedBy, 120),
    pm: str(r.pm, 120),
    packing_slip_received: bool(r.packingSlip ?? r.packingSlipReceived),
    quantities: str(r.quantities, 1000),
    damaged: bool(r.damaged),
    color_tag: color && (COLOR_TAGS as readonly string[]).includes(color) ? color : null,
    notes: str(r.notes, 2000),
    status,
    received_at: date(r.receivedAt) ?? new Date().toISOString(),
    checked_out_to: status === "checked_out" ? str(r.checkedOutTo, 80) : null,
    checked_out_at: status === "checked_out" ? date(r.checkedOutAt) : null,
    last_location: str(r.lastLocation, 60),
    location_at: date(r.locationAt),
    // Older backups have no legacy field; those boxes are not legacy.
    legacy: bool(r.legacy) === true,
  };
}

/** One returns.json entry → a row, or null for junk. */
export function returnRecordToRow(raw: unknown) {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const code = typeof r.code === "string" ? normalizeCode(r.code) : "";
  if (!isReturnCode(code)) return null;
  const type = ["vendor", "stock", "warranty", "general"].includes(String(r.type)) ? String(r.type) : "general";
  const closed = r.status === "closed";
  return {
    code,
    type,
    status: closed ? "closed" : "open",
    returned_by: str(r.returnedBy, 80),
    vendor: str(r.vendor, 200),
    job_name: str(r.jobName, 120),
    notes: str(r.notes, 2000),
    created_at: date(r.createdAt) ?? new Date().toISOString(),
    closed_at: closed ? date(r.closedAt) : null,
    closed_by: closed ? str(r.closedBy, 80) : null,
    close_note: closed ? str(r.closeNote, 500) : null,
  };
}

function fileByCode(zip: JSZip, folder: string, ext: RegExp) {
  const map = new Map<string, JSZip.JSZipObject>();
  zip.folder(folder)?.forEach((rel, entry) => {
    if (entry.dir) return;
    const name = rel.split("/").pop() ?? rel;
    if (ext.test(name)) map.set(normalizeCode(name.replace(ext, "")), entry);
  });
  return map;
}

/** Merges by code: rows in the zip overwrite rows with the same code. */
export async function restoreBackup(file: File, onProgress?: (done: number, total: number) => void) {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const json = zip.file("packages.json");
  if (!json) throw new Error("That zip has no packages.json. Pick a Floorcast backup.");
  const parsed = JSON.parse(await json.async("string")) as unknown;
  const list = Array.isArray(parsed) ? parsed : (parsed as { packages?: unknown })?.packages;
  if (!Array.isArray(list)) throw new Error("packages.json is not a package list.");

  const stickers = fileByCode(zip, "stickers", /\.png$/i);
  for (const [k, v] of fileByCode(zip, "barcodes", /\.png$/i)) if (!stickers.has(k)) stickers.set(k, v);
  const photos = fileByCode(zip, "photos", /\.jpe?g$/i);
  const slipPhotos = fileByCode(zip, "slip-photos", /\.jpe?g$/i);

  let restored = 0;
  const restoredCodes = new Set<string>();
  let files = 0;
  let skipped = 0;
  for (const item of list) {
    const row = recordToRow(item);
    if (!row) {
      skipped += 1;
      continue;
    }
    const { code } = row;
    const { error } = await sb().from("packages").upsert(row, { onConflict: "code" });
    if (error) throw new Error(`Could not restore ${code}: ${error.message}`);
    restored += 1;
    restoredCodes.add(code);

    const patch: Record<string, string> = {};
    const stickerEntry = stickers.get(code);
    let stickerBlob = stickerEntry ? await stickerEntry.async("blob") : null;
    if (!stickerBlob && item && typeof (item as { barcodePng?: unknown }).barcodePng === "string") {
      stickerBlob = dataUrlToBlob((item as { barcodePng: string }).barcodePng);
    }
    if (!stickerBlob) stickerBlob = await renderSticker({ code, jobName: row.job_name, receivedAt: row.received_at, legacy: row.legacy }).catch(() => null);
    if (stickerBlob) {
      const path = stickerPath(code);
      const up = await sb()
        .storage.from(BARCODES_BUCKET)
        .upload(path, new Blob([stickerBlob], { type: "image/png" }), { upsert: true, contentType: "image/png" });
      if (!up.error) {
        patch.barcode_path = path;
        files += 1;
      }
    }

    const photoEntry = photos.get(code);
    let photoBlob = photoEntry ? await photoEntry.async("blob") : null;
    if (!photoBlob && item && typeof (item as { photoJpg?: unknown }).photoJpg === "string") {
      photoBlob = dataUrlToBlob((item as { photoJpg: string }).photoJpg);
    }
    if (photoBlob) {
      try {
        // Re-derive the thumbnail so every photo gets the same square crop.
        const captured = await photoFromFile(new Blob([photoBlob], { type: "image/jpeg" }));
        const paths = await uploadPhoto(code, captured);
        patch.photo_path = paths.photoPath;
        patch.thumb_path = paths.thumbPath;
        files += 1;
      } catch {
        /* row is restored; photo can be retaken */
      }
    }
    const slipEntry = slipPhotos.get(code);
    if (slipEntry) {
      try {
        const captured = await photoFromFile(new Blob([await slipEntry.async("blob")], { type: "image/jpeg" }), "slip");
        const paths = await uploadPhoto(code, captured, "slip");
        patch.slip_photo_path = paths.photoPath;
        patch.slip_thumb_path = paths.thumbPath;
        files += 1;
      } catch {
        /* row is restored; slip photo can be retaken */
      }
    }
    if (Object.keys(patch).length) await sb().from("packages").update(patch).eq("code", code);
    onProgress?.(restored + skipped, list.length);
  }

  // Location history: each restored box gets exactly the history in the zip.
  const movesFile = zip.file("moves.json");
  if (movesFile && restoredCodes.size) {
    const parsedMoves = JSON.parse(await movesFile.async("string")) as { moves?: unknown };
    const moves = Array.isArray(parsedMoves?.moves) ? parsedMoves.moves : [];
    const rows = moves
      .map((m) => (m && typeof m === "object" ? (m as Record<string, unknown>) : null))
      .filter((m): m is Record<string, unknown> => !!m && typeof m.code === "string" && restoredCodes.has(normalizeCode(m.code as string)) && !!str(m.to, 60))
      .map((m) => ({ package_code: normalizeCode(m.code as string), from_location: str(m.from, 60), to_location: str(m.to, 60), moved_by: str(m.by, 80), moved_at: date(m.at) ?? new Date().toISOString() }));
    const codes = [...new Set(rows.map((r) => r.package_code))];
    for (const c of codes) await sb().from("package_moves").delete().eq("package_code", c);
    if (rows.length) {
      const { error } = await sb().from("package_moves").insert(rows);
      if (error) throw new Error(`Could not restore location history: ${error.message}`);
    }
  }

  // Returns: merge by code, like packages.
  let returnsRestored = 0;
  const returnsFile = zip.file("returns.json");
  if (returnsFile) {
    const parsedReturns = JSON.parse(await returnsFile.async("string")) as { returns?: unknown };
    const rlist = Array.isArray(parsedReturns?.returns) ? parsedReturns.returns : [];
    const retPhotos = fileByCode(zip, "return-photos", /\.jpe?g$/i);
    for (const item of rlist) {
      const row = returnRecordToRow(item);
      if (!row) {
        skipped += 1;
        continue;
      }
      const { error } = await sb().from("returns").upsert(row, { onConflict: "code" });
      if (error) throw new Error(`Could not restore ${row.code}: ${error.message}`);
      returnsRestored += 1;
      const entry = retPhotos.get(row.code);
      if (entry) {
        try {
          const blob = await entry.async("blob");
          await setReturnPhoto(row.code, await photoFromFile(new Blob([blob], { type: "image/jpeg" })));
          files += 1;
        } catch {
          /* the return is restored; a photo can be added again */
        }
      }
    }
  }
  return { restored, files, skipped, returnsRestored };
}
