import JSZip from "jszip";
import { isPlausibleCode, normalizeCode } from "@/lib/codes";
import { COLOR_TAGS } from "@/lib/form";
import { listPackages, type Pkg } from "@/lib/packages";
import { dataUrlToBlob, photoFromFile, uploadPhoto } from "@/lib/photo";
import { renderSticker, stickerPath } from "@/lib/sticker";
import { BARCODES_BUCKET, PHOTOS_BUCKET, sb } from "@/lib/supabase";

/**
 * Zip layout:
 *   packages.json   every record (the restore source of truth)
 *   packages.csv    same records for a spreadsheet
 *   stickers/<code>.png
 *   photos/<code>.jpg   full compressed photo
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
  "stickerFile",
  "photoFile",
] as const;

export type BackupRecord = Omit<Pkg, "id" | "barcodePath" | "photoPath" | "thumbPath" | "updatedAt"> & {
  stickerFile: string | null;
  photoFile: string | null;
};

export function csvCell(value: unknown): string {
  if (value == null) return "";
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(records: BackupRecord[]): string {
  const lines = [CSV_COLUMNS.join(","), ...records.map((r) => CSV_COLUMNS.map((k) => csvCell(r[k])).join(","))];
  return `﻿${lines.join("\r\n")}\r\n`;
}

export function backupName(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `vans-warehouse-backup-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}.zip`;
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
    const stickerFile = sticker ? `stickers/${p.code}.png` : null;
    const photoFile = photo ? `photos/${p.code}.jpg` : null;
    if (sticker && stickerFile) zip.file(stickerFile, sticker);
    if (photo && photoFile) zip.file(photoFile, photo);
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
      stickerFile,
      photoFile,
    });
    onProgress?.((i += 1), packages.length);
  }
  zip.file("packages.json", JSON.stringify({ app: "vans-warehouse", version: 1, exportedAt: new Date().toISOString(), packages: records }, null, 2));
  zip.file("packages.csv", toCsv(records));
  const blob = await zip.generateAsync({ type: "blob", mimeType: "application/zip", compression: "DEFLATE" });
  return { blob, filename: backupName(), count: records.length };
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
  if (!json) throw new Error("That zip has no packages.json. Pick a Van's Warehouse backup.");
  const parsed = JSON.parse(await json.async("string")) as unknown;
  const list = Array.isArray(parsed) ? parsed : (parsed as { packages?: unknown })?.packages;
  if (!Array.isArray(list)) throw new Error("packages.json is not a package list.");

  const stickers = fileByCode(zip, "stickers", /\.png$/i);
  for (const [k, v] of fileByCode(zip, "barcodes", /\.png$/i)) if (!stickers.has(k)) stickers.set(k, v);
  const photos = fileByCode(zip, "photos", /\.jpe?g$/i);

  let restored = 0;
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

    const patch: Record<string, string> = {};
    const stickerEntry = stickers.get(code);
    let stickerBlob = stickerEntry ? await stickerEntry.async("blob") : null;
    if (!stickerBlob && item && typeof (item as { barcodePng?: unknown }).barcodePng === "string") {
      stickerBlob = dataUrlToBlob((item as { barcodePng: string }).barcodePng);
    }
    if (!stickerBlob) stickerBlob = await renderSticker({ code, jobName: row.job_name, receivedAt: row.received_at }).catch(() => null);
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
    if (Object.keys(patch).length) await sb().from("packages").update(patch).eq("code", code);
    onProgress?.(restored + skipped, list.length);
  }
  return { restored, files, skipped };
}
